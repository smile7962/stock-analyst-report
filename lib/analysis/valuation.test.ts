import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics } from "./metrics";
import {
  valuate,
  growthScenarios,
  rimValue,
  multipleValue,
  decideOpinion,
  REQUIRED_RETURN,
  G_CAP,
} from "./valuation";
import { SAMSUNG, SHINHAN, KAKAO } from "./fixtures";
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

test("multipleValue: 음수 EPS엔 배수 미적용", () => {
  assert.equal(multipleValue(-100, 10, 0.03), null);
  assert.equal(multipleValue(0, 10, 0.03), null);
  near(multipleValue(2000, 5, 0.03)!, 2000 * 5 * 1.03);
});

test("decideOpinion 임계값 (+15% 매수 / −15% 매도)", () => {
  assert.equal(decideOpinion(15), "매수");
  assert.equal(decideOpinion(14.99), "중립");
  assert.equal(decideOpinion(-15), "매도");
  assert.equal(decideOpinion(-14.99), "중립");
  assert.equal(decideOpinion(0), "중립");
  assert.equal(decideOpinion(null), "의견제시불가");
});

test("삼성전자(일반): RIM 0.6 + 멀티플 0.4, 후행 기준 고평가 → 매도", () => {
  const m = computeMetrics(SAMSUNG.financials, SAMSUNG.market);
  const v = valuate("005930", "general", m, SAMSUNG.market, SAMSUNG.financials[0].revenue);
  assert.equal(v.companyType, "general");
  assert.equal(v.methods.length, 2); // RIM + MULTIPLE
  assert.ok(v.targetPrice);
  near(v.targetPrice!.base, 172358, 0.01);
  assert.ok(v.targetPrice!.conservative < v.targetPrice!.base);
  assert.ok(v.targetPrice!.base < v.targetPrice!.optimistic);
  assert.equal(v.opinion, "매도");
  assert.ok(v.upsidePct! < 0);
});

test("신한지주(금융): RIM 단독(멀티플 없음), 밴드 정렬, 중립", () => {
  const m = computeMetrics(SHINHAN.financials, SHINHAN.market);
  const v = valuate("055550", "financial", m, SHINHAN.market, SHINHAN.financials[0].revenue);
  assert.equal(v.companyType, "financial");
  assert.equal(v.methods.length, 1); // RIM only
  assert.equal(v.methods[0].method, "RIM");
  near(v.targetPrice!.base, 114941, 0.01);
  assert.ok(v.targetPrice!.conservative <= v.targetPrice!.base);
  assert.ok(v.targetPrice!.base <= v.targetPrice!.optimistic);
  assert.equal(v.opinion, "중립");
});

test("카카오(일반, 저 ROE): RIM 낮음 → 매도, 밴드 오름차순 유지", () => {
  const m = computeMetrics(KAKAO.financials, KAKAO.market);
  const v = valuate("035720", "general", m, KAKAO.market, KAKAO.financials[0].revenue);
  near(v.targetPrice!.base, 15946, 0.02);
  assert.ok(v.targetPrice!.conservative < v.targetPrice!.base);
  assert.ok(v.targetPrice!.base < v.targetPrice!.optimistic);
  assert.equal(v.opinion, "매도");
});

test("적자기업: 목표주가 미제시 + PSR 참고치만", () => {
  const m = computeMetrics(KAKAO.financials, KAKAO.market);
  const v = valuate("000000", "lossmaking", m, KAKAO.market, 8099147815086);
  assert.equal(v.targetPrice, null);
  assert.equal(v.upsidePct, null);
  assert.equal(v.opinion, "의견제시불가");
  assert.equal(v.methods[0].method, "PSR");
  assert.match(v.methods[0].note, /PSR/);
});

test("고 ROE 일반기업: 저평가 → 매수 (합성 입력)", () => {
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
});
