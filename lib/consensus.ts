/**
 * 애널리스트 컨센서스(선행 EPS·목표주가) 수집 — 네이버 금융 모바일 통합 API.
 *
 * 배경(DEVELOPMENT_PLAN §5.2 v3 개정): 초기 계획은 "확보 가능한 공식 선행 EPS 소스가
 * 없다"는 이유로 후행 실적만 썼다. 그러나 후행 EPS만으로 목표주가를 잡으면 실적이 사이클
 * 저점에 있는 종목(예: 반도체)은 현저히 과소평가된다(삼성전자 후행 목표 172,356원 vs
 * 증권사 컨센서스 513,958원). 네이버 금융이 다수 증권사 컨센서스를 집계해 공개하므로,
 * 이를 "창작 수치"가 아니라 출처가 명시된 외부 사실로 도입한다(CLAUDE.md 규칙 6: 실응답 확인).
 *
 * 실응답 구조(2026-07 확인, `https://m.stock.naver.com/api/stock/{code}/integration`):
 *  - consensusInfo.priceTargetMean : 증권사 목표주가 평균(문자열, 예 "513,958")
 *  - consensusInfo.recommMean       : 투자의견 평균 1(매도)~5(매수) (예 "4.04")
 *  - consensusInfo.createDate        : 컨센서스 기준일
 *  - totalInfos[] : {code,key,value} 배열. code="cnsEps"=추정EPS("46,664원"),
 *                   "cnsPer"=추정PER("6.11배"). 값은 단위·콤마 포함 문자열.
 * 애널리스트 커버리지가 없는 소형주는 priceTargetMean=null, cnsEps="N/A"로 온다 →
 * 각 필드는 개별적으로 null 가능(선택적). 조회 자체가 실패하면 전체 null을 반환한다.
 *
 * ⚠️ 비공식 엔드포인트다. 계산은 하지 않고 값 파싱만 한다(CLAUDE.md 규칙 5).
 */

/** 증권사 컨센서스 스냅샷 — 각 필드는 커버리지 없으면 개별적으로 null */
export interface Consensus {
  /** 선행(추정) EPS, 원 — cnsEps */
  forwardEps: number | null;
  /** 선행(추정) PER, 배 — cnsPer (현재가/선행EPS이므로 목표배수 산정엔 쓰지 않는다) */
  forwardPer: number | null;
  /** 증권사 목표주가 평균, 원 — priceTargetMean */
  targetMean: number | null;
  /** 투자의견 평균 1(매도)~5(매수) — recommMean */
  recommMean: number | null;
  /** 컨센서스 기준일 (예 "2026-07-09") */
  asOf: string | null;
}

const BASE = "https://m.stock.naver.com/api/stock";
/** 네이버 모바일 API는 User-Agent 없으면 차단한다 */
const UA = "Mozilla/5.0 (compatible; stock-analyst-report/1.0)";

/** "46,664원" → 46664, "6.11배" → 6.11, "N/A"·null → null */
function parseNum(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[,\s원배%]/g, "");
  if (!cleaned || cleaned.toUpperCase() === "N/A") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

interface TotalInfo {
  code?: string;
  value?: string;
}
interface IntegrationResponse {
  consensusInfo?: {
    priceTargetMean?: string | null;
    recommMean?: string | null;
    createDate?: string | null;
  };
  totalInfos?: TotalInfo[];
}

/**
 * 종목의 증권사 컨센서스를 조회한다. 네트워크·파싱 실패 시 null(리포트를 죽이지 않는다).
 * 성공하되 커버리지가 없으면 각 필드가 null인 객체를 반환한다.
 */
export async function fetchConsensus(stockCode: string): Promise<Consensus | null> {
  try {
    const res = await fetch(`${BASE}/${stockCode}/integration`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as IntegrationResponse;

    const ci = json.consensusInfo ?? {};
    const byCode = new Map<string, string | undefined>();
    for (const t of json.totalInfos ?? []) {
      if (t.code) byCode.set(t.code, t.value);
    }

    return {
      forwardEps: parseNum(byCode.get("cnsEps")),
      forwardPer: parseNum(byCode.get("cnsPer")),
      targetMean: parseNum(ci.priceTargetMean),
      recommMean: parseNum(ci.recommMean),
      asOf: ci.createDate ?? null,
    };
  } catch {
    return null;
  }
}
