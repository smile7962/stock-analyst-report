/**
 * KRX 공식 Open API(openapi.krx.co.kr) 기반 MarketDataClient 구현.
 *
 * 스키마는 추측이 아니라 2026-07-11 실응답으로 확인했다 (CLAUDE.md 규칙 6):
 *  - 엔드포인트: GET https://data-dbg.krx.co.kr/svc/apis/sto/{stk|ksq|knx}_bydd_trd?basDd=YYYYMMDD
 *  - 인증: HTTP 헤더 `AUTH_KEY: <발급키>` (환경변수 KRX_OPENAPI_KEY)
 *  - 응답: {"OutBlock_1":[{BAS_DD,ISU_CD,ISU_NM,MKT_NM,SECT_TP_NM,TDD_CLSPRC,CMPPREVDD_PRC,
 *          FLUC_RT,TDD_OPNPRC,TDD_HGPRC,TDD_LWPRC,ACC_TRDVOL,ACC_TRDVAL,MKTCAP,LIST_SHRS}]}
 *    수치는 콤마 없는 문자열, ISU_CD는 6자리 종목코드다.
 *  - 휴장일·미래일·basDd 누락: HTTP 200 + {"OutBlock_1":[]}
 *  - 인증 실패: HTTP 401 + {"respMsg":"Unauthorized Key","respCode":"401"}
 *  - 키에 미승인된 API: HTTP 401 + {"respMsg":"Unauthorized API Call","respCode":"401"}
 *    (현재 키는 유가증권 stk_bydd_trd·stk_isu_base_info만 승인 — KOSDAQ/KONEX는 포털에서
 *     추가 신청 필요. 미승인 시장은 건너뛰되, 종목을 못 찾으면 오류 메시지에 명시한다)
 *
 * API가 "기준일자 1일 × 시장 전체 종목" 단위라 기간 조회는 일자별 반복 호출이 필요하다.
 * (일자,시장)별 응답을 인스턴스 캐시에 담아 같은 시장의 여러 종목 조회 시 재호출을 막는다.
 *
 * 한계(실응답으로 확인): 일별매매정보에는 업종 분류가 없어 MarketSnapshot.sector는
 * 항상 null이다. 상장종목정보(stk_isu_base_info)에도 업종명 필드는 없다.
 */
import type { DailyPrice, MarketSnapshot } from "./types";
import type { MarketDataClient } from "./market";

const BASE = "https://data-dbg.krx.co.kr/svc/apis/sto";

const MARKETS = [
  { api: "stk_bydd_trd", name: "KOSPI" },
  { api: "ksq_bydd_trd", name: "KOSDAQ" },
  { api: "knx_bydd_trd", name: "KONEX" },
] as const;
type Market = (typeof MARKETS)[number];

/** 최신 거래일 탐색 시 오늘부터 거슬러 올라갈 최대 일수 (설/추석 연휴를 덮는다) */
const LATEST_LOOKBACK_DAYS = 14;
/** 52주 밴드 계산 기간: 최신 거래일 포함 과거 364일 */
const WEEK52_DAYS = 364;
/** 일자별 호출 동시성 (한도 절약과 속도의 절충) */
const CONCURRENCY = 4;

/** 일별매매정보 1행 — 필드명은 실응답 그대로 */
interface ByddTrdRow {
  BAS_DD: string;
  ISU_CD: string;
  MKT_NM: string;
  TDD_CLSPRC: string;
  CMPPREVDD_PRC: string;
  TDD_OPNPRC: string;
  TDD_HGPRC: string;
  TDD_LWPRC: string;
  ACC_TRDVOL: string;
  MKTCAP: string;
  LIST_SHRS: string;
}

export class KrxApiError extends Error {
  constructor(
    message: string,
    readonly respCode?: string,
  ) {
    super(message);
    this.name = "KrxApiError";
  }
}

/** "1234" → 1234. "-"/빈 값은 null (콤마는 방어적으로 제거) */
function parseNum(v: unknown): number | null {
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function requireNum(v: unknown, field: string): number {
  const n = parseNum(v);
  if (n === null) throw new Error(`KRX 응답에서 ${field} 값을 읽지 못했습니다: ${String(v)}`);
  return n;
}

export class KrxOpenApiClient implements MarketDataClient {
  private readonly apiKey: string;
  /** `${api}|${basDd}` → (ISU_CD → 행). 휴장일은 빈 Map으로 캐시된다 */
  private readonly dayCache = new Map<string, Map<string, ByddTrdRow>>();
  /** 이 키에 승인되지 않은 시장 API (Unauthorized API Call 응답으로 확인된 것) */
  private readonly unauthorizedApis = new Set<string>();

  constructor(apiKey: string | undefined = process.env.KRX_OPENAPI_KEY) {
    if (!apiKey) {
      throw new Error("KRX_OPENAPI_KEY 가 설정되지 않았습니다 (.env.local 참고)");
    }
    this.apiKey = apiKey;
  }

  async fetchDailyPrices(
    stockCode: string,
    startDate: string,
    endDate: string,
  ): Promise<DailyPrice[]> {
    const { market } = await this.resolveMarket(stockCode);
    const rows = await this.collectRows(market, stockCode, startDate, endDate);
    return rows.map((r) => ({
      date: r.BAS_DD,
      open: requireNum(r.TDD_OPNPRC, "TDD_OPNPRC"),
      high: requireNum(r.TDD_HGPRC, "TDD_HGPRC"),
      low: requireNum(r.TDD_LWPRC, "TDD_LWPRC"),
      close: requireNum(r.TDD_CLSPRC, "TDD_CLSPRC"),
      volume: requireNum(r.ACC_TRDVOL, "ACC_TRDVOL"),
    }));
  }

  async fetchSnapshot(stockCode: string): Promise<MarketSnapshot> {
    const { market, date: latestDate } = await this.resolveMarket(stockCode);
    const rows = await this.collectRows(
      market,
      stockCode,
      addDays(latestDate, -WEEK52_DAYS),
      latestDate,
    );
    const latest = rows[rows.length - 1];

    const close = requireNum(latest.TDD_CLSPRC, "TDD_CLSPRC");
    const change = requireNum(latest.CMPPREVDD_PRC, "CMPPREVDD_PRC");
    const prevClose = close - change;

    return {
      stockCode,
      date: latest.BAS_DD,
      close,
      change,
      changePct: prevClose !== 0 ? (change / prevClose) * 100 : 0,
      marketCap: requireNum(latest.MKTCAP, "MKTCAP"),
      listedShares: requireNum(latest.LIST_SHRS, "LIST_SHRS"),
      high52w: Math.max(...rows.map((r) => requireNum(r.TDD_HGPRC, "TDD_HGPRC"))),
      low52w: Math.min(...rows.map((r) => requireNum(r.TDD_LWPRC, "TDD_LWPRC"))),
      market: latest.MKT_NM,
      // 공식 Open API 일별매매정보에는 업종 분류가 없다 (파일 상단 주석 참고)
      sector: null,
    };
  }

  /**
   * 오늘부터 최대 LATEST_LOOKBACK_DAYS 일 거슬러 올라가며, 승인된 시장 API에서
   * 종목이 존재하는 최신 거래일과 소속 시장을 찾는다.
   */
  private async resolveMarket(stockCode: string): Promise<{ market: Market; date: string }> {
    const today = fmtDate(new Date());
    for (let back = 0; back <= LATEST_LOOKBACK_DAYS; back++) {
      const date = addDays(today, -back);
      if (isWeekend(date)) continue;
      for (const market of MARKETS) {
        const day = await this.fetchDay(market, date);
        if (day?.has(stockCode)) return { market, date };
      }
    }
    let msg = `최근 ${LATEST_LOOKBACK_DAYS}일 내 KRX 일별매매정보에서 ${stockCode} 를 찾지 못했습니다`;
    if (this.unauthorizedApis.size) {
      const skipped = MARKETS.filter((m) => this.unauthorizedApis.has(m.api))
        .map((m) => m.name)
        .join("/");
      msg += ` (미승인으로 건너뛴 시장: ${skipped} — openapi.krx.co.kr 에서 해당 API 사용 신청 필요)`;
    }
    throw new KrxApiError(msg);
  }

  /** 기간 내 해당 종목의 행을 날짜 오름차순으로 수집한다 (주말은 호출 생략) */
  private async collectRows(
    market: Market,
    stockCode: string,
    startDate: string,
    endDate: string,
  ): Promise<ByddTrdRow[]> {
    const dates: string[] = [];
    for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
      if (!isWeekend(d)) dates.push(d);
    }
    const rows: ByddTrdRow[] = [];
    for (let i = 0; i < dates.length; i += CONCURRENCY) {
      const days = await Promise.all(
        dates.slice(i, i + CONCURRENCY).map((d) => this.fetchDay(market, d)),
      );
      for (const day of days) {
        const hit = day?.get(stockCode);
        if (hit) rows.push(hit);
      }
    }
    if (!rows.length) {
      throw new KrxApiError(`${stockCode} 의 ${startDate}~${endDate} 일별매매정보가 비어 있습니다`);
    }
    return rows; // dates 가 오름차순이므로 결과도 오름차순
  }

  /**
   * (시장, 기준일자) 하루치 전 종목을 조회해 캐시한다.
   * 반환 null = 이 시장 API가 키에 승인되지 않음(호출자에서 건너뜀).
   */
  private async fetchDay(
    market: Market,
    basDd: string,
  ): Promise<Map<string, ByddTrdRow> | null> {
    if (this.unauthorizedApis.has(market.api)) return null;
    const cacheKey = `${market.api}|${basDd}`;
    const cached = this.dayCache.get(cacheKey);
    if (cached) return cached;

    const res = await fetch(`${BASE}/${market.api}?basDd=${basDd}`, {
      headers: { AUTH_KEY: this.apiKey },
    });
    const text = await res.text();
    if (!res.ok) {
      let respMsg = text.slice(0, 200);
      let respCode: string | undefined;
      try {
        const body = JSON.parse(text) as { respMsg?: string; respCode?: string };
        respMsg = body.respMsg ?? respMsg;
        respCode = body.respCode;
      } catch {
        // JSON이 아니면 본문 앞부분을 그대로 사용
      }
      if (res.status === 401 && respMsg === "Unauthorized API Call") {
        this.unauthorizedApis.add(market.api);
        return null;
      }
      throw new KrxApiError(`KRX Open API HTTP ${res.status} (${market.api}): ${respMsg}`, respCode);
    }

    let rows: unknown;
    try {
      rows = (JSON.parse(text) as { OutBlock_1?: unknown }).OutBlock_1;
    } catch {
      throw new KrxApiError(`KRX Open API 응답이 JSON이 아닙니다: ${text.slice(0, 200)}`);
    }
    if (!Array.isArray(rows)) {
      throw new KrxApiError(`KRX Open API 응답에 OutBlock_1 배열이 없습니다: ${text.slice(0, 200)}`);
    }
    const day = new Map<string, ByddTrdRow>();
    for (const r of rows as ByddTrdRow[]) day.set(r.ISU_CD, r);
    this.dayCache.set(cacheKey, day);
    return day;
  }
}

/** Date → YYYYMMDD */
function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** YYYYMMDD ± n일 (UTC 기준 산술 — 표기용 문자열 연산이라 시간대 무관) */
function addDays(yyyymmdd: string, n: number): string {
  const t = Date.UTC(
    Number(yyyymmdd.slice(0, 4)),
    Number(yyyymmdd.slice(4, 6)) - 1,
    Number(yyyymmdd.slice(6, 8)) + n,
  );
  const d = new Date(t);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** KRX는 토·일 휴장 — 해당 일자는 호출 자체를 생략한다 */
function isWeekend(yyyymmdd: string): boolean {
  const dow = new Date(
    Date.UTC(
      Number(yyyymmdd.slice(0, 4)),
      Number(yyyymmdd.slice(4, 6)) - 1,
      Number(yyyymmdd.slice(6, 8)),
    ),
  ).getUTCDay();
  return dow === 0 || dow === 6;
}
