/**
 * 밸류에이션 엔진 (순수 함수) — 업종별 방법론 분기 + 목표주가 3밴드 + 규칙 기반 투자의견.
 *
 * 방법론 (DEVELOPMENT_PLAN §5.1~§5.3):
 *  - RIM(잔여이익모델) 정당 PBR 폐형: 적정가 = BPS × (ROE − g)/(r − g), r>g.
 *    컨센서스 불필요, 금융업 포함 범용. 주력 절대가치 방법론.
 *  - 멀티플: 후행 EPS × 현재 PER × (1+g). "시장이 같은 배수로 재평가한다"는 상대가치 앵커
 *    (일반 기업만). 선행 EPS 컨센서스를 쓰지 않는다는 §5.2 제약을 지키기 위한 형태다.
 *  - 성장률 g는 실적 CAGR에서 규칙으로 산출한 보수/기본/낙관 3밴드 (§5.2).
 *
 * ROE<r 인 기업은 g가 커질수록 정당가치가 낮아진다(가치파괴 성장). 그래서 시나리오→값
 * 매핑을 라벨에 고정하지 않고, 산출된 세 값을 오름차순 정렬해 보수/기본/낙관 밴드로 삼는다.
 */
import type { MarketSnapshot } from "../types";
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
/** 목표주가 합성 가중치 */
const WEIGHTS: Record<CompanyType, { rim: number; multiple: number }> = {
  general: { rim: 0.6, multiple: 0.4 },
  financial: { rim: 1.0, multiple: 0 },
  holding: { rim: 1.0, multiple: 0 }, // NAV 할인은 1차 범위에서 PBR–ROE로 근사 (§5.1)
  lossmaking: { rim: 0, multiple: 0 },
};
/** 투자의견 임계 상승여력 (§5.3) */
const OPINION_BUY = 0.15;
const OPINION_SELL = -0.15;

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

/** 멀티플 적정가 = EPS × 현재 PER × (1+g). EPS≤0 이면 null (음수 EPS에 배수를 곱하지 않는다) */
export function multipleValue(
  eps: number | null,
  per: number | null,
  g: number,
): number | null {
  if (eps === null || per === null || eps <= 0) return null;
  return eps * per * (1 + g);
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
 * 목표주가·투자의견 산출. metrics는 computeMetrics 결과, market은 시세 스냅샷.
 * 계산만 하며, 서술(LLM)은 전혀 하지 않는다.
 */
export function valuate(
  stockCode: string,
  companyType: CompanyType,
  metrics: FinancialMetrics,
  market: MarketSnapshot,
  latestRevenue: number | null,
): ValuationResult {
  const scen = growthScenarios(metrics);
  const gs = [scen.conservative, scen.base, scen.optimistic];
  const weights = WEIGHTS[companyType];
  const r = REQUIRED_RETURN;
  const assumptions: string[] = [];
  const methods: MethodValuation[] = [];

  if (companyType === "lossmaking") {
    // 음수 EPS에 멀티플 금지 (§5.1). PSR 참고치만 제시하고 목표주가는 미제시
    const psrRef = div(market.marketCap, latestRevenue);
    methods.push({
      method: "PSR",
      band: null,
      weight: 0,
      note: `적자기업: 목표주가 미제시. 참고 PSR(시가총액/매출)=${
        psrRef === null ? "N/A" : psrRef.toFixed(2)
      }`,
    });
    assumptions.push("최근 연간 순이익 ≤ 0 → 멀티플·RIM 부적합으로 목표주가 미제시 (§5.1)");
    return {
      stockCode,
      companyType,
      currentPrice: market.close,
      metrics,
      methods,
      targetPrice: null,
      upsidePct: null,
      opinion: "의견제시불가",
      assumptions,
    };
  }

  // RIM (전 유형 공통)
  const rimBand = toBand(gs.map((g) => rimValue(metrics.bps, metrics.roe, g, r)));
  methods.push({
    method: "RIM",
    band: rimBand,
    weight: weights.rim,
    note:
      `정당PBR = (ROE−g)/(r−g), BPS=${fmt(metrics.bps)}, ROE=${pct(metrics.roe)}, ` +
      `r=${pct(r)}, g∈[${pct(scen.conservative)}~${pct(scen.optimistic)}]`,
  });

  // 멀티플 (일반 기업만)
  let multBand: ValuationBand | null = null;
  if (weights.multiple > 0) {
    multBand = toBand(gs.map((g) => multipleValue(metrics.eps, metrics.per, g)));
    methods.push({
      method: "MULTIPLE",
      band: multBand,
      weight: weights.multiple,
      note:
        `EPS×현재PER×(1+g), EPS=${fmt(metrics.eps)}, PER=${fmt(metrics.per)}배, ` +
        `g∈[${pct(scen.conservative)}~${pct(scen.optimistic)}] (현재 배수 유지 가정의 상대가치)`,
    });
  }

  const targetPrice = combineBands([
    { band: rimBand, weight: weights.rim },
    { band: multBand, weight: weights.multiple },
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
  assumptions.push(
    `목표주가 = ${
      weights.multiple > 0 ? `RIM×${weights.rim}+멀티플×${weights.multiple}` : "RIM 단독(금융/지주는 PER 부적합)"
    } 가중평균`,
  );
  assumptions.push("선행 EPS 컨센서스를 쓰지 않음 — 후행 실적+성장 시나리오 기반 (§5.2)");

  return {
    stockCode,
    companyType,
    currentPrice: market.close,
    metrics,
    methods,
    targetPrice,
    upsidePct,
    opinion: decideOpinion(upsidePct),
    assumptions,
  };
}

function fmt(v: number | null): string {
  return v === null ? "N/A" : Math.round(v).toLocaleString("ko-KR");
}
function pct(v: number | null): string {
  return v === null ? "N/A" : `${(v * 100).toFixed(1)}%`;
}
