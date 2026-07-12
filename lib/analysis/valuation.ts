/**
 * 밸류에이션 엔진 (순수 함수) — 업종별 방법론 분기 + 목표주가 3밴드 + 규칙 기반 투자의견.
 *
 * 방법론 (DEVELOPMENT_PLAN §5.1~§5.3, v3 개정):
 *  - RIM(잔여이익모델) 정당 PBR 폐형: 적정가 = BPS × (ROE − g)/(r − g), r>g.
 *    후행 실적만 쓰는 내재가치 앵커. 금융업 포함 범용. 사이클 저점에선 과소평가 경향.
 *  - CONSENSUS(증권사 컨센서스): 네이버 금융이 집계한 다수 증권사 목표주가 평균(선행 실적
 *    추정 반영). 커버리지가 있을 때만. 후행 RIM의 사이클 저점 과소평가를 보정하는 선행 신호.
 *  - 성장률 g는 실적 CAGR에서 규칙으로 산출한 보수/기본/낙관 3밴드 (§5.2).
 *
 * v2까지 쓰던 "멀티플 = EPS × 현재 PER × (1+g)"는 목표주가가 현재가로 회귀하는 순환
 * 구조라 삭제했다. 선행 신호가 필요하면 컨센서스(외부 출처)를 도입해 대체한다(§5.2 v3).
 *
 * ROE<r 인 기업은 g가 커질수록 정당가치가 낮아진다(가치파괴 성장). 그래서 시나리오→값
 * 매핑을 라벨에 고정하지 않고, 산출된 세 값을 오름차순 정렬해 보수/기본/낙관 밴드로 삼는다.
 */
import type { MarketSnapshot } from "../types";
import type { Consensus } from "../consensus";
import { div } from "./metrics";
import type {
  CompanyType,
  FinancialMetrics,
  MethodValuation,
  Opinion,
  ValuationBand,
  ValuationResult,
} from "./types";

// ── 가정(모두 리포트에 공개) ─────────────────────────────────────────────
/** 요구수익률 r */
export const REQUIRED_RETURN = 0.09;
/** 장기 성장률 하한/상한 (RIM 안정성: g는 r보다 충분히 낮게 클램프) */
export const G_FLOOR = 0.0;
export const G_CAP = 0.05;
/** 시나리오 스프레드: 보수 = 기본−spread, 낙관 = 기본+spread */
export const SCENARIO_SPREAD = 0.02;
/** 컨센서스 목표주가 평균 둘레의 밴드 폭(±) — 점추정에 보수/낙관 여지를 준다 */
export const CONS_SPREAD = 0.1;
/** 투자의견 임계 상승여력 (§5.3) */
const OPINION_BUY = 0.15;
const OPINION_SELL = -0.15;

/** 목표주가 합성 가중치 {RIM, 컨센서스}. 컨센서스 확보 여부에 따라 분기 */
function pickWeights(
  type: CompanyType,
  hasConsensus: boolean,
): { rim: number; consensus: number } {
  if (type === "lossmaking") {
    // 적자기업은 RIM·멀티플 부적합. 컨센서스(턴어라운드 기대)가 있으면 그것만, 없으면 목표 미제시
    return hasConsensus ? { rim: 0, consensus: 1 } : { rim: 0, consensus: 0 };
  }
  if (type === "financial" || type === "holding") {
    // 금융·지주는 PBR–ROE(RIM)가 주력. 컨센서스는 동등 비중으로 보정
    return hasConsensus ? { rim: 0.5, consensus: 0.5 } : { rim: 1, consensus: 0 };
  }
  // 일반: 후행 RIM은 사이클 저점에서 과소평가되므로, 컨센서스가 있으면 선행 신호를 더 크게 반영
  return hasConsensus ? { rim: 0.35, consensus: 0.65 } : { rim: 1, consensus: 0 };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** 실적 CAGR → 보수/기본/낙관 성장률. 기본은 [FLOOR, CAP−SPREAD]로 클램프해 밴드가 겹치지 않게 한다 */
export function growthScenarios(m: FinancialMetrics): {
  conservative: number;
  base: number;
  optimistic: number;
} {
  const hist = m.revenueCagr ?? m.niCagr ?? 0; // 매출 없는 금융업은 순이익 CAGR로 대체
  const base = clamp(hist, G_FLOOR, G_CAP - SCENARIO_SPREAD);
  return {
    conservative: clamp(base - SCENARIO_SPREAD, G_FLOOR, G_CAP),
    base,
    optimistic: clamp(base + SCENARIO_SPREAD, G_FLOOR, G_CAP),
  };
}

/** RIM 정당가치. r≤g 이거나 입력 없으면 null. 음수 정당가치는 0으로 바닥 처리 */
export function rimValue(
  bps: number | null,
  roe: number | null,
  g: number,
  r: number = REQUIRED_RETURN,
): number | null {
  if (bps === null || roe === null || r <= g) return null;
  return Math.max(0, bps * ((roe - g) / (r - g)));
}

/** 컨센서스 목표주가 평균 → ±spread 3밴드 */
export function consensusBand(mean: number, spread: number = CONS_SPREAD): ValuationBand {
  return {
    conservative: mean * (1 - spread),
    base: mean,
    optimistic: mean * (1 + spread),
  };
}

/** 세 시나리오 값을 오름차순 밴드로. null이 하나라도 있으면 null */
function toBand(values: (number | null)[]): ValuationBand | null {
  if (values.some((v) => v === null)) return null;
  const s = (values as number[]).slice().sort((a, b) => a - b);
  return { conservative: s[0], base: s[1], optimistic: s[2] };
}

/** 방법론 밴드들을 가중 합성 (성분별 가중평균). 유효 밴드가 없으면 null */
function combineBands(
  parts: { band: ValuationBand | null; weight: number }[],
): ValuationBand | null {
  const valid = parts.filter((p) => p.band !== null && p.weight > 0) as {
    band: ValuationBand;
    weight: number;
  }[];
  if (!valid.length) return null;
  const tw = valid.reduce((s, p) => s + p.weight, 0);
  const w = (k: keyof ValuationBand) =>
    valid.reduce((s, p) => s + p.band[k] * p.weight, 0) / tw;
  return { conservative: w("conservative"), base: w("base"), optimistic: w("optimistic") };
}

export function decideOpinion(upsidePct: number | null): Opinion {
  if (upsidePct === null) return "의견제시불가";
  const u = upsidePct / 100;
  if (u >= OPINION_BUY) return "매수";
  if (u <= OPINION_SELL) return "매도";
  return "중립";
}

/**
 * 목표주가·투자의견 산출. metrics는 computeMetrics 결과, market은 시세 스냅샷,
 * consensus는 증권사 컨센서스(없으면 null). 계산만 하며, 서술(LLM)은 전혀 하지 않는다.
 */
export function valuate(
  stockCode: string,
  companyType: CompanyType,
  metrics: FinancialMetrics,
  market: MarketSnapshot,
  latestRevenue: number | null,
  consensus: Consensus | null = null,
): ValuationResult {
  const scen = growthScenarios(metrics);
  const gs = [scen.conservative, scen.base, scen.optimistic];
  const r = REQUIRED_RETURN;
  const assumptions: string[] = [];
  const methods: MethodValuation[] = [];

  const hasCons =
    consensus != null && consensus.targetMean != null && consensus.targetMean > 0;
  const weights = pickWeights(companyType, hasCons);

  // RIM (적자기업 제외 전 유형 공통)
  let rimBand: ValuationBand | null = null;
  if (companyType !== "lossmaking") {
    rimBand = toBand(gs.map((g) => rimValue(metrics.bps, metrics.roe, g, r)));
    methods.push({
      method: "RIM",
      band: rimBand,
      weight: weights.rim,
      note:
        `정당PBR = (ROE−g)/(r−g), BPS=${fmt(metrics.bps)}, ROE=${pct(metrics.roe)}, ` +
        `r=${pct(r)}, g∈[${pct(scen.conservative)}~${pct(scen.optimistic)}] (후행 실적 기반 내재가치)`,
    });
  }

  // CONSENSUS (애널리스트 커버리지 있을 때만)
  let consBand: ValuationBand | null = null;
  if (hasCons) {
    consBand = consensusBand(consensus!.targetMean!);
    methods.push({
      method: "CONSENSUS",
      band: consBand,
      weight: weights.consensus,
      note:
        `증권사 목표주가 평균 ${fmt(consensus!.targetMean)}원 (네이버 금융 집계, 기준일 ${
          consensus!.asOf ?? "N/A"
        }` +
        `${consensus!.forwardEps != null ? `, 선행EPS ${fmt(consensus!.forwardEps)}원` : ""}` +
        `${consensus!.recommMean != null ? `, 의견평균 ${consensus!.recommMean.toFixed(2)}/5` : ""}` +
        `). ±${pct(CONS_SPREAD)} 밴드. 외부 출처값 — 본 앱 산출이 아님`,
    });
  }

  // 적자기업 & 컨센서스 없음 → PSR 참고치만, 목표주가 미제시
  if (companyType === "lossmaking" && !hasCons) {
    const psrRef = div(market.marketCap, latestRevenue);
    methods.push({
      method: "PSR",
      band: null,
      weight: 0,
      note: `적자기업: 목표주가 미제시. 참고 PSR(시가총액/매출)=${
        psrRef === null ? "N/A" : psrRef.toFixed(2)
      }`,
    });
    assumptions.push("최근 연간 순이익 ≤ 0 → 멀티플·RIM 부적합. 컨센서스도 없어 목표주가 미제시 (§5.1)");
    return {
      stockCode,
      companyType,
      currentPrice: market.close,
      metrics,
      methods,
      targetPrice: null,
      upsidePct: null,
      opinion: "의견제시불가",
      consensus,
      assumptions,
    };
  }

  const targetPrice = combineBands([
    { band: rimBand, weight: weights.rim },
    { band: consBand, weight: weights.consensus },
  ]);

  const upsidePct =
    targetPrice && market.close > 0
      ? ((targetPrice.base - market.close) / market.close) * 100
      : null;

  assumptions.push(
    `요구수익률 r=${pct(r)}, 장기성장률 g는 실적 CAGR 기반 [${pct(scen.conservative)}~${pct(
      scen.optimistic,
    )}] 클램프`,
  );
  if (hasCons) {
    const label =
      companyType === "lossmaking"
        ? "증권사 컨센서스 단독(적자 → RIM 부적합)"
        : `RIM(내재가치)×${weights.rim} + 증권사 컨센서스×${weights.consensus} 가중평균`;
    assumptions.push(
      `목표주가 = ${label}. 컨센서스는 다수 증권사의 선행 실적 추정을 반영하므로, ` +
        `후행 실적만으로 사이클 저점 종목이 과소평가되는 문제를 보정한다 (§5.2 v3)`,
    );
    assumptions.push(
      `증권사 컨센서스는 네이버 금융이 집계한 외부 출처값(기준일 ${
        consensus!.asOf ?? "N/A"
      })이며 본 앱이 산출한 값이 아니다`,
    );
  } else {
    assumptions.push(
      "증권사 컨센서스 미확보(애널리스트 커버리지 없음) → RIM 내재가치 단독. " +
        "선행 실적 추정이 없어 후행 기준으로 보수적으로 평가됨",
    );
  }

  return {
    stockCode,
    companyType,
    currentPrice: market.close,
    metrics,
    methods,
    targetPrice,
    upsidePct,
    opinion: decideOpinion(upsidePct),
    consensus,
    assumptions,
  };
}

function fmt(v: number | null): string {
  return v === null ? "N/A" : Math.round(v).toLocaleString("ko-KR");
}
function pct(v: number | null): string {
  return v === null ? "N/A" : `${(v * 100).toFixed(1)}%`;
}
