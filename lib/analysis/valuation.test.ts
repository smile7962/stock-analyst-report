import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics } from "./metrics";
import {
  valuate,
  growthScenarios,
  rimValue,
  forwardEarningsValue,
  spreadBand,
  decideOpinion,
  REQUIRED_RETURN,
  G_CAP,
  BAND_SPREAD,
} from "./valuation";
import {
  SAMSUNG,
  SHINHAN,
  KAKAO,
  SAMSUNG_CONSENSUS,
  SHINHAN_CONSENSUS,
} from "./fixtures";
import type { FinancialMetrics } from "./types";

function near(actual: number | null, expected: number, tolRel = 0.01) {
  assert.notEqual(actual, null);
  assert.ok(
    Math.abs((actual as number) - expected) <= Math.abs(expected) * tolRel,
    `기대 ${expected}, 실제 ${actual}`,
  );
}

test("성장 시나리오: 실적 CAGR가 커도 g는 [0, CAP−spread]로 클램프, 밴드 미겹침", () => {
  const s = growthScenarios({ revenueCagr: 0.135, niCagr: null } as FinancialMetrics);
  near(s.base, 0.03); // CAP(0.05) − spread(0.02)
  near(s.conservative, 0.01);
  near(s.optimistic, 0.05);
  assert.ok(s.conservative < s.base && s.base < s.optimistic);
  assert.ok(s.optimistic <= G_CAP + 1e-9);
});

test("rimValue: r≤g 방어, 음수 정당가치 0 바닥", () => {
  assert.equal(rimValue(10000, 0.1, 0.09, 0.09), null); // r=g
  assert.equal(rimValue(null, 0.1, 0.03), null);
  near(rimValue(10000, 0.15, 0.03)!, 10000 * ((0.15 - 0.03) / (0.09 - 0.03))); // 20000
  assert.equal(rimValue(10000, 0.02, 0.05), 0); // ROE<g → 음수 → 0
});

test("forwardEarningsValue: 선행EPS × (1/r), 음수/없음이면 null", () => {
  near(forwardEarningsValue(46664, 0.09)!, 46664 / 0.09); // ≈ 518,489
  assert.equal(forwardEarningsValue(0), null);
  assert.equal(forwardEarningsValue(-100), null);
  assert.equal(forwardEarningsValue(null), null);
});

test("spreadBand: 점추정 ±spread 3밴드", () => {
  const b = spreadBand(100000, 0.1);
  near(b.conservative, 90000);
  near(b.base, 100000);
  near(b.optimistic, 110000);
  assert.ok(b.conservative < b.base && b.base < b.optimistic);
});

test("decideOpinion 임계값 (+15% 매수 / −15% 매도)", () => {
  assert.equal(decideOpinion(15), "매수");
  assert.equal(decideOpinion(14.99), "중립");
  assert.equal(decideOpinion(-15), "매도");
  assert.equal(decideOpinion(-14.99), "중립");
  assert.equal(decideOpinion(0), "중립");
  assert.equal(decideOpinion(null), "의견제시불가");
});

test("삼성전자(일반) 컨센서스 없음: RIM 단독 → 후행 저점 저평가로 매도", () => {
  const m = computeMetrics(SAMSUNG.financials, SAMSUNG.market);
  const v = valuate("005930", "general", m, SAMSUNG.market, SAMSUNG.financials[0].revenue);
  assert.equal(v.methods.length, 1);
  assert.equal(v.methods[0].method, "RIM");
  near(v.targetPrice!.base, 91560, 0.01);
  near(v.intrinsicTarget!, 91560, 0.01); // 컨센서스 없으면 내재가치=RIM
  assert.equal(v.consensusGapPct, null);
  assert.equal(v.opinion, "매도");
  assert.equal(v.consensus, null);
});

test("삼성전자(일반) 컨센서스+선행이익력: RIM 0.2 + 선행 0.4 + 컨센 0.4 → 매수", () => {
  const m = computeMetrics(SAMSUNG.financials, SAMSUNG.market);
  const v = valuate(
    "005930",
    "general",
    m,
    SAMSUNG.market,
    SAMSUNG.financials[0].revenue,
    SAMSUNG_CONSENSUS,
  );
  assert.deepEqual(
    v.methods.map((x) => x.method),
    ["RIM", "FWD_EARNINGS", "CONSENSUS"],
  );
  // 0.2×91,560 + 0.4×518,489 + 0.4×513,958 ≈ 431,291
  near(v.targetPrice!.base, 431291, 0.01);
  // AI 독립 내재가치(RIM+선행, 컨센 제외) ≈ 376,179 — RIM 단독(91,560)보다 성장 반영
  near(v.intrinsicTarget!, 376179, 0.01);
  assert.ok(v.intrinsicTarget! > 91560 * 3);
  // 괴리 = (513,958 − 376,179)/376,179 ≈ +36.6%
  near(v.consensusGapPct!, 36.6, 0.03);
  assert.equal(v.opinion, "매수");
  assert.ok(v.targetPrice!.base > 285000 * 1.15);
});

test("신한지주(금융) 컨센서스: RIM 0.5 + 컨센 0.5 (선행이익력 미사용)", () => {
  const m = computeMetrics(SHINHAN.financials, SHINHAN.market);
  const v = valuate(
    "055550",
    "financial",
    m,
    SHINHAN.market,
    SHINHAN.financials[0].revenue,
    SHINHAN_CONSENSUS,
  );
  assert.deepEqual(
    v.methods.map((x) => x.method),
    ["RIM", "CONSENSUS"], // 금융은 fwd 가중 0 → 선행이익력 방법 없음
  );
  near(v.targetPrice!.base, 123302, 0.01);
  near(v.intrinsicTarget!, 114938, 0.01); // 금융 내재가치 = RIM 단독
});

test("신한지주(금융) 컨센서스 없음: RIM 단독, 중립", () => {
  const m = computeMetrics(SHINHAN.financials, SHINHAN.market);
  const v = valuate("055550", "financial", m, SHINHAN.market, SHINHAN.financials[0].revenue);
  assert.equal(v.methods.length, 1);
  assert.equal(v.methods[0].method, "RIM");
  near(v.targetPrice!.base, 114938, 0.01);
  assert.equal(v.opinion, "중립");
});

test("카카오(일반, 저 ROE) 컨센서스 없음: RIM 낮음 → 매도, 밴드 오름차순", () => {
  const m = computeMetrics(KAKAO.financials, KAKAO.market);
  const v = valuate("035720", "general", m, KAKAO.market, KAKAO.financials[0].revenue);
  assert.ok(v.targetPrice!.conservative <= v.targetPrice!.base);
  assert.ok(v.targetPrice!.base < v.targetPrice!.optimistic);
  assert.equal(v.opinion, "매도");
});

test("적자기업 & 컨센서스 없음: 목표주가 미제시 + PSR 참고치만", () => {
  const m = computeMetrics(KAKAO.financials, KAKAO.market);
  const v = valuate("000000", "lossmaking", m, KAKAO.market, 8099147815086);
  assert.equal(v.targetPrice, null);
  assert.equal(v.intrinsicTarget, null);
  assert.equal(v.upsidePct, null);
  assert.equal(v.opinion, "의견제시불가");
  assert.equal(v.methods[0].method, "PSR");
  assert.match(v.methods[0].note, /PSR/);
});

test("적자기업 & 컨센서스 있음: 선행이익력 0.5 + 컨센 0.5로 목표 제시", () => {
  const m = computeMetrics(KAKAO.financials, KAKAO.market);
  const v = valuate("000000", "lossmaking", m, KAKAO.market, 8099147815086, SHINHAN_CONSENSUS);
  assert.deepEqual(
    v.methods.map((x) => x.method),
    ["FWD_EARNINGS", "CONSENSUS"], // 적자는 RIM 없음
  );
  near(v.targetPrice!.base, 131572, 0.02);
  assert.notEqual(v.upsidePct, null);
});

test("고 ROE 일반기업(컨센서스 없음): 저평가 → 매수 (RIM 단독)", () => {
  const m: FinancialMetrics = {
    eps: 2000,
    bps: 10000,
    roe: 0.25,
    roa: 0.1,
    per: 5,
    pbr: 1,
    opMargin: 0.2,
    netMargin: 0.15,
    debtRatio: 0.5,
    equityRatio: 0.6,
    revenueGrowth: 0.1,
    opGrowth: 0.1,
    niGrowth: 0.1,
    revenueCagr: 0.135,
    niCagr: 0.1,
  };
  const mkt = { ...SAMSUNG.market, close: 10000 };
  const v = valuate("111111", "general", m, mkt, 1000);
  assert.ok(v.targetPrice!.base > mkt.close * 1.15);
  assert.equal(v.opinion, "매수");
  assert.ok(REQUIRED_RETURN > 0);
  assert.ok(BAND_SPREAD > 0);
});
