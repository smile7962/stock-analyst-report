/**
 * 밸류에이션 엔진 (순수 함수) — 업종별 방법론 분기 + 목표주가 3밴드 + 규칙 기반 투자의견.
 *
 * 방법론 (DEVELOPMENT_PLAN §5.1~§5.3, v3 개정):
 *  - RIM(잔여이익모델) 정당 PBR 폐형: 적정가 = BPS × (ROE − g)/(r − g), r>g.
 *    후행 실적 기반 장부 내재가치. "안전판" 성격 — 사이클 저점에선 과소평가되므로 저비중.
 *  - FWD_EARNINGS(선행 이익력): 선행EPS × (1/r). 요구수익률 r에서 무성장 영구이익의 정당
 *    PER(=1/r)을 선행 실적에 적용한 AI 독립 산출값. 컨센서스와 무관하게 성장을 반영한다.
 *    완전 DCF의 성장·FCF·터미널 가치 창작을 피하고 공개 상수(r) 하나만 쓴다.
 *  - CONSENSUS(증권사 컨센서스): 네이버 금융 집계 목표주가 평균 ±스프레드 밴드. 시장 관점.
 *
 * 목표주가 = 위 셋의 유형별 가중평균. 일반기업은 RIM 0.2 / 선행이익력 0.4 / 컨센서스 0.4로,
 * "AI 독립 산출(RIM+선행) 0.6 : 시장 0.4"의 균형을 둔다(컨센서스 추종 방지, §5.2 v3).
 * combineBands 는 사용 불가한 방법(밴드 null)을 자동으로 빼고 남은 비중으로 재정규화한다.
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
/** 점추정(컨센서스·선행이익력)을 3밴드로 펼칠 때의 폭(±) */
export const BAND_SPREAD = 0.1;
/** 투자의견 임계 상승여력 (§5.3) */
const OPINION_BUY = 0.15;
const OPINION_SELL = -0.15;

/** 목표주가 합성 가중치 {RIM, 선행이익력, 컨센서스}. combineBands가 결측 방법을 재정규화한다 */
const WEIGHTS: Record<CompanyType, { rim: number; fwd: number; cons: number }> = {
  // 일반: AI 독립(RIM+선행) 0.6 vs 시장 0.4. RIM은 안전판이라 저비중, 성장은 선행이익력이 담당
  general: { rim: 0.2, fwd: 0.4, cons: 0.4 },
  // 금융: ROE가 안정적이라 후행 RIM(PBR–ROE)이 주력. 선행이익력은 쓰지 않고 컨센서스로 보정
  financial: { rim: 0.5, fwd: 0, cons: 0.5 },
  holding: { rim: 0.5, fwd: 0, cons: 0.5 },
  // 적자: 장부 RIM 부적합. 턴어라운드 선행이익력·컨센서스가 있으면 그것으로만
  lossmaking: { rim: 0, fwd: 0.5, cons: 0.5 },
};

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

/** 선행 이익력 = 선행EPS × (1/r). 무성장 영구이익의 정당가치. EPS≤0/없음이면 null */
export function forwardEarningsValue(
  forwardEps: number | null,
  r: number = REQUIRED_RETURN,
): number | null {
  if (forwardEps === null || forwardEps <= 0) return null;
  return forwardEps * (1 / r);
}

/** 점추정값을 ±spread 3밴드로 (컨센서스·선행이익력 공용) */
export function spreadBand(center: number, spread: number = BAND_SPREAD): ValuationBand {
  return {
    conservative: center * (1 - spread),
    base: center,
    optimistic: center * (1 + spread),
  };
}

/** 세 시나리오 값을 오름차순 밴드로. null이 하나라도 있으면 null */
function toBand(values: (number | null)[]): ValuationBand | null {
  if (values.some((v) => v === null)) return null;
  const s = (values as number[]).slice().sort((a, b) => a - b);
  return { conservative: s[0], base: s[1], optimistic: s[2] };
}

/** 방법론 밴드들을 가중 합성 (성분별 가중평균, 결측은 빼고 남은 비중으로 재정규화). 없으면 null */
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
  const w = WEIGHTS[companyType];
  const assumptions: string[] = [];
  const methods: MethodValuation[] = [];

  // RIM (적자기업 제외 전 유형 공통) — 후행 장부 내재가치, 안전판
  let rimBand: ValuationBand | null = null;
  if (companyType !== "lossmaking") {
    rimBand = toBand(gs.map((g) => rimValue(metrics.bps, metrics.roe, g, r)));
    methods.push({
      method: "RIM",
      band: rimBand,
      weight: w.rim,
      note:
        `정당PBR = (ROE−g)/(r−g), BPS=${fmt(metrics.bps)}, ROE=${pct(metrics.roe)}, ` +
        `r=${pct(r)}, g∈[${pct(scen.conservative)}~${pct(scen.optimistic)}] (후행 장부 내재가치·안전판)`,
    });
  }

  // FWD_EARNINGS (선행 이익력) — 선행EPS × (1/r). 성장을 담는 AI 독립 산출값
  let fwdBand: ValuationBand | null = null;
  const fwdVal = forwardEarningsValue(consensus?.forwardEps ?? null, r);
  if (w.fwd > 0 && fwdVal != null) {
    fwdBand = spreadBand(fwdVal);
    methods.push({
      method: "FWD_EARNINGS",
      band: fwdBand,
      weight: w.fwd,
      note:
        `선행EPS ${fmt(consensus!.forwardEps)}원 × 정당PER(1/r=${(1 / r).toFixed(1)}배) = ` +
        `${fmt(fwdVal)}원, ±${pct(BAND_SPREAD)} (무성장 선행 이익력, 성장은 선행EPS에 반영)`,
    });
  }

  // CONSENSUS — 증권사 목표주가 평균. 시장 관점
  let consBand: ValuationBand | null = null;
  const hasCons = consensus?.targetMean != null && consensus.targetMean > 0;
  if (w.cons > 0 && hasCons) {
    consBand = spreadBand(consensus!.targetMean!);
    methods.push({
      method: "CONSENSUS",
      band: consBand,
      weight: w.cons,
      note:
        `증권사 목표주가 평균 ${fmt(consensus!.targetMean)}원 (네이버 금융 집계, 기준일 ${
          consensus!.asOf ?? "N/A"
        }` +
        `${consensus!.recommMean != null ? `, 의견평균 ${consensus!.recommMean.toFixed(2)}/5` : ""}` +
        `). ±${pct(BAND_SPREAD)} 밴드. 외부 출처값 — 본 앱 산출이 아님`,
    });
  }

  // AI 독립 내재가치(컨센서스 제외) — 투명성·비교용
  const intrinsicBand = combineBands([
    { band: rimBand, weight: w.rim },
    { band: fwdBand, weight: w.fwd },
  ]);
  const intrinsicTarget = intrinsicBand?.base ?? null;

  // 적자기업이 선행이익력·컨센서스 둘 다 없으면 → PSR 참고치만, 목표주가 미제시
  if (companyType === "lossmaking" && !fwdBand && !consBand) {
    const psrRef = div(market.marketCap, latestRevenue);
    methods.push({
      method: "PSR",
      band: null,
      weight: 0,
      note: `적자기업: 목표주가 미제시. 참고 PSR(시가총액/매출)=${
        psrRef === null ? "N/A" : psrRef.toFixed(2)
      }`,
    });
    assumptions.push("최근 연간 순이익 ≤ 0 → 장부 RIM 부적합. 선행이익력·컨센서스도 없어 목표주가 미제시 (§5.1)");
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
      intrinsicTarget: null,
      consensusGapPct: null,
      assumptions,
    };
  }

  const targetPrice = combineBands([
    { band: rimBand, weight: w.rim },
    { band: fwdBand, weight: w.fwd },
    { band: consBand, weight: w.cons },
  ]);

  const upsidePct =
    targetPrice && market.close > 0
      ? ((targetPrice.base - market.close) / market.close) * 100
      : null;

  // AI 내재가치 대비 컨센서스 괴리 (둘 다 있을 때만) — 리포트에서 원인을 해석하게 한다
  const consensusGapPct =
    intrinsicTarget != null && intrinsicTarget > 0 && hasCons
      ? ((consensus!.targetMean! - intrinsicTarget) / intrinsicTarget) * 100
      : null;

  assumptions.push(
    `요구수익률 r=${pct(r)}, 장기성장률 g는 실적 CAGR 기반 [${pct(scen.conservative)}~${pct(
      scen.optimistic,
    )}] 클램프`,
  );
  const usedWeights = [
    rimBand ? `RIM ${w.rim}` : null,
    fwdBand ? `선행이익력 ${w.fwd}` : null,
    consBand ? `컨센서스 ${w.cons}` : null,
  ].filter(Boolean);
  assumptions.push(
    `목표주가 = ${usedWeights.join(" + ")} 가중평균(결측 방법은 빼고 재정규화). ` +
      `RIM은 후행 장부 안전판, 선행이익력은 선행EPS로 성장 반영, 컨센서스는 시장 관점 (§5.2 v3)`,
  );
  if (intrinsicTarget != null && consensusGapPct != null) {
    assumptions.push(
      `AI 독립 내재가치(RIM+선행이익력) ${fmt(intrinsicTarget)}원 vs 컨센서스 ${fmt(
        consensus!.targetMean,
      )}원 → 괴리 ${signedPct(consensusGapPct)}. ` +
        `괴리는 시장이 선행 실적에 적용하는 배수·성장·할인율 차이에서 비롯된다`,
    );
  }
  if (hasCons) {
    assumptions.push(
      `증권사 컨센서스는 네이버 금융 집계 외부 출처값(기준일 ${consensus!.asOf ?? "N/A"})이며 본 앱 산출이 아니다`,
    );
  } else {
    assumptions.push("증권사 컨센서스 미확보(커버리지 없음) → AI 자체 산출(RIM·선행이익력)만으로 평가");
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
    intrinsicTarget,
    consensusGapPct,
    assumptions,
  };
}

function fmt(v: number | null): string {
  return v === null ? "N/A" : Math.round(v).toLocaleString("ko-KR");
}
function pct(v: number | null): string {
  return v === null ? "N/A" : `${(v * 100).toFixed(1)}%`;
}
function signedPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
