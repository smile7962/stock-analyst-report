/**
 * KRX 정보데이터시스템(data.krx.co.kr) 기반 MarketDataClient 구현 (프로토타입용).
 *
 * ⚠️ 가정 명시 (CLAUDE.md 규칙 1·6):
 *  - 이 엔드포인트는 공식 문서가 없는 웹 화면용 JSON이다. bld 코드·필드명은
 *    pykrx(github.com/sharebook-kr/pykrx)가 사용하는 요청/응답 구조를 근거로 했다.
 *      · 종목 검색: dbms/comm/finder/finder_stkisu → block1[].full_code/short_code/marketName
 *      · 일별 시세: dbms/MDC/STAT/standard/MDCSTAT01701 → output[].TRD_DD/TDD_CLSPRC/...
 *      · 업종 분류: dbms/MDC/STAT/standard/MDCSTAT03901 → block1[].ISU_SRT_CD/IDX_IND_NM
 *  - 실응답 검증은 scripts/verify-krx.ts 로 수행한다. 클라우드 IP에서는 KRX가
 *    본문 "LOGOUT"(HTTP 400)으로 차단하므로(2026-07 확인) 허용된 네트워크에서 실행해야 한다.
 *  - 운영 전환(Phase 6) 시 이 파일만 공식 Open API 구현체로 교체한다 (lib/market.ts 참고).
 */
import type { DailyPrice, MarketSnapshot } from "./types";
import type { MarketDataClient } from "./market";

const ENDPOINT = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";

/** KRX가 비브라우저/차단 IP에 돌려주는 본문. 발생 시 명시적 오류로 승격한다 */
const BLOCKED_BODY = "LOGOUT";

export class KrxBlockedError extends Error {
  constructor() {
    super(
      "KRX가 요청을 차단했습니다(LOGOUT 응답). 클라우드 IP 차단일 가능성이 높습니다 — " +
        "허용된 네트워크에서 재시도하거나 공식 Open API 전환(Phase 6)을 앞당기세요",
    );
    this.name = "KrxBlockedError";
  }
}

async function krxPost(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
    body: new URLSearchParams({ locale: "ko_KR", csvxls_isNo: "false", ...params }).toString(),
  });
  const text = await res.text();
  if (text.trim().startsWith(BLOCKED_BODY)) throw new KrxBlockedError();
  if (!res.ok) throw new Error(`KRX HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`KRX 응답이 JSON이 아닙니다: ${text.slice(0, 200)}`);
  }
}

/** "1,234" → 1234. "-"/빈 값은 null */
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

interface FinderRow {
  full_code: string; // ISIN (예: KR7005930003)
  short_code: string; // 6자리 종목코드
  codeName: string;
  marketName: string; // KOSPI / KOSDAQ / KONEX
}

export class KrxMarketClient implements MarketDataClient {
  /** 종목코드 → ISIN·시장구분. 검색 결과에서 정확히 일치하는 종목만 취한다 */
  private async resolveIsin(stockCode: string): Promise<FinderRow> {
    const json = await krxPost({
      bld: "dbms/comm/finder/finder_stkisu",
      mktsel: "ALL",
      typeNo: "0",
      searchText: stockCode,
    });
    const rows = (json.block1 ?? []) as FinderRow[];
    const hit = rows.find((r) => r.short_code === stockCode);
    if (!hit) throw new Error(`KRX 종목 검색에 ${stockCode} 가 없습니다`);
    return hit;
  }

  async fetchDailyPrices(
    stockCode: string,
    startDate: string,
    endDate: string,
  ): Promise<DailyPrice[]> {
    const { full_code } = await this.resolveIsin(stockCode);
    const rows = await this.fetchDailyRaw(full_code, startDate, endDate);
    return rows
      .map((r) => ({
        date: String(r.TRD_DD).replace(/\//g, ""),
        open: requireNum(r.TDD_OPNPRC, "TDD_OPNPRC"),
        high: requireNum(r.TDD_HGPRC, "TDD_HGPRC"),
        low: requireNum(r.TDD_LWPRC, "TDD_LWPRC"),
        close: requireNum(r.TDD_CLSPRC, "TDD_CLSPRC"),
        volume: requireNum(r.ACC_TRDVOL, "ACC_TRDVOL"),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async fetchSnapshot(stockCode: string): Promise<MarketSnapshot> {
    const finder = await this.resolveIsin(stockCode);

    // 최근 ~54주 조회: 최신 거래일 확정 + 52주 밴드 산출을 한 번에
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 378);
    const rows = await this.fetchDailyRaw(finder.full_code, fmtDate(from), fmtDate(today));
    if (!rows.length) throw new Error(`${stockCode} 일별 시세가 비어 있습니다`);

    // 응답은 최신일이 먼저 온다(pykrx 근거). 순서를 가정하지 않고 날짜로 정렬한다
    const daily = rows
      .map((r) => ({
        date: String(r.TRD_DD).replace(/\//g, ""),
        close: requireNum(r.TDD_CLSPRC, "TDD_CLSPRC"),
        high: requireNum(r.TDD_HGPRC, "TDD_HGPRC"),
        low: requireNum(r.TDD_LWPRC, "TDD_LWPRC"),
        change: requireNum(r.CMPPREVDD_PRC, "CMPPREVDD_PRC"),
        marketCap: requireNum(r.MKTCAP, "MKTCAP"),
        listedShares: requireNum(r.LIST_SHRS, "LIST_SHRS"),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const latest = daily[daily.length - 1];
    const prevClose = latest.close - latest.change;

    return {
      stockCode,
      date: latest.date,
      close: latest.close,
      change: latest.change,
      changePct: prevClose !== 0 ? (latest.change / prevClose) * 100 : 0,
      marketCap: latest.marketCap,
      listedShares: latest.listedShares,
      high52w: Math.max(...daily.map((d) => d.high)),
      low52w: Math.min(...daily.map((d) => d.low)),
      market: finder.marketName,
      sector: await this.fetchSector(stockCode, finder.marketName, latest.date),
    };
  }

  private async fetchDailyRaw(
    isin: string,
    startDate: string,
    endDate: string,
  ): Promise<Record<string, unknown>[]> {
    const json = await krxPost({
      bld: "dbms/MDC/STAT/standard/MDCSTAT01701",
      isuCd: isin,
      strtDd: startDate,
      endDd: endDate,
      share: "1",
      money: "1",
    });
    // pykrx 근거로는 output 키이나, 통계 화면에 따라 OutBlock_1을 쓰는 경우가 있어 둘 다 수용
    const rows = (json.output ?? json.OutBlock_1) as Record<string, unknown>[] | undefined;
    if (!Array.isArray(rows)) {
      throw new Error(`KRX 일별 시세 응답 구조가 예상과 다릅니다: keys=${Object.keys(json)}`);
    }
    return rows;
  }

  /**
   * 전종목 업종분류(MDCSTAT03901)에서 해당 종목의 업종명을 찾는다.
   * 업종은 리포트 보조 정보이므로 조회 실패 시 전체를 죽이지 않고 null을 반환한다.
   */
  private async fetchSector(
    stockCode: string,
    marketName: string,
    tradingDate: string,
  ): Promise<string | null> {
    const mktId = { KOSPI: "STK", KOSDAQ: "KSQ", KONEX: "KNX" }[marketName];
    if (!mktId) return null;
    try {
      const json = await krxPost({
        bld: "dbms/MDC/STAT/standard/MDCSTAT03901",
        mktId,
        trdDd: tradingDate,
        money: "1",
      });
      const rows = (json.block1 ?? json.OutBlock_1) as Record<string, unknown>[] | undefined;
      if (!Array.isArray(rows)) return null;
      const hit = rows.find((r) => r.ISU_SRT_CD === stockCode);
      return hit ? String(hit.IDX_IND_NM) : null;
    } catch (err) {
      if (err instanceof KrxBlockedError) throw err; // 차단은 감추지 않는다
      return null;
    }
  }
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
