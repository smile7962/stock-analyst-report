/**
 * 재무비율 계산기 (순수 함수) — 성장성·수익성·안정성 지표.
 *
 * 원칙(CLAUDE.md 규칙 5): 모든 수치는 여기서 계산한다. 값이 없거나 분모가 0/음수라
 * 의미가 없으면 null을 반환한다 (조용히 0으로 만들지 않는다).
 */
import type { FinancialSnapshot, MarketSnapshot } from "../types";
import type { FinancialMetrics } from "./types";

/** 안전 나눗셈: 분자/분모가 없거나 분모 0이면 null */
export function div(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

/** 전년대비 성장률. 기저(prev)가 없거나 0 이하면 null (음수 기저 성장률은 무의미) */
export function yoy(current: number | null, prev: number | null): number | null {
  if (current === null || prev === null || prev <= 0) return null;
  return (current - prev) / prev;
}

/** 연평균성장률. 시작/끝 값이 양수여야 하며 years<1이면 null */
export function cagr(first: number | null, last: number | null, years: number): number | null {
  if (first === null || last === null || first <= 0 || last <= 0 || years < 1) return null;
  return Math.pow(last / first, 1 / years) - 1;
}

/**
 * 재무 스냅샷 배열(최신 연도 우선)과 시세 스냅샷에서 지표를 계산한다.
 * @param financials 최신 연도가 [0]에 오도록 정렬된 배열
 */
export function computeMetrics(
  financials: FinancialSnapshot[],
  market: MarketSnapshot,
): FinancialMetrics {
  const latest = financials[0];
  const prev = financials[1];
  const oldest = financials[financials.length - 1];
  const shares = market.listedShares;
  const price = market.close;

  const eps = div(latest?.netIncome ?? null, shares);
  const bps = div(latest?.totalEquity ?? null, shares);

  return {
    eps,
    bps,
    roe: div(latest?.netIncome ?? null, latest?.totalEquity ?? null),
    roa: div(latest?.netIncome ?? null, latest?.totalAssets ?? null),
    per: div(price, eps),
    pbr: div(price, bps),
    opMargin: div(latest?.operatingProfit ?? null, latest?.revenue ?? null),
    netMargin: div(latest?.netIncome ?? null, latest?.revenue ?? null),
    debtRatio: div(latest?.totalLiabilities ?? null, latest?.totalEquity ?? null),
    equityRatio: div(latest?.totalEquity ?? null, latest?.totalAssets ?? null),
    revenueGrowth: yoy(latest?.revenue ?? null, prev?.revenue ?? null),
    opGrowth: yoy(latest?.operatingProfit ?? null, prev?.operatingProfit ?? null),
    niGrowth: yoy(latest?.netIncome ?? null, prev?.netIncome ?? null),
    revenueCagr: cagr(oldest?.revenue ?? null, latest?.revenue ?? null, financials.length - 1),
    niCagr: cagr(oldest?.netIncome ?? null, latest?.netIncome ?? null, financials.length - 1),
  };
}
