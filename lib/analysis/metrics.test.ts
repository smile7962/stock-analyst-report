import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics, div, yoy, cagr } from "./metrics";
import { SAMSUNG, SHINHAN, KAKAO } from "./fixtures";

/** 상대 오차 허용 근사 비교 */
function near(actual: number | null, expected: number, tolRel = 0.001) {
  assert.notEqual(actual, null, "값이 null 이면 안 됨");
  assert.ok(
    Math.abs((actual as number) - expected) <= Math.abs(expected) * tolRel,
    `기대 ${expected}, 실제 ${actual}`,
  );
}

test("div/yoy/cagr 널·경계 처리", () => {
  assert.equal(div(10, 0), null);
  assert.equal(div(null, 2), null);
  assert.equal(yoy(120, 100), 0.2);
  assert.equal(yoy(100, 0), null); // 기저 0
  assert.equal(yoy(100, -50), null); // 음수 기저
  assert.equal(cagr(100, 0, 2), null); // 음수/0 끝값
  near(cagr(100, 121, 2), 0.1); // √1.21−1
});

test("삼성전자 지표 손계산 대조", () => {
  const m = computeMetrics(SAMSUNG.financials, SAMSUNG.market);
  near(m.eps!, 45206805000000 / 5846278608); // ≈7732.4
  near(m.bps!, 436320337000000 / 5846278608); // ≈74632
  near(m.roe!, 0.10361, 0.002);
  near(m.per!, 285000 / (45206805000000 / 5846278608), 0.002); // ≈36.86
  near(m.pbr!, 285000 / (436320337000000 / 5846278608), 0.002); // ≈3.81
  near(m.opMargin!, 43601051000000 / 333605938000000, 0.002); // ≈0.1307
  near(m.debtRatio!, 130621773000000 / 436320337000000, 0.002); // ≈0.299
  near(m.equityRatio!, 436320337000000 / 566942110000000, 0.002); // ≈0.770
  near(m.revenueGrowth!, (333605938 - 300870903) / 300870903, 0.002); // ≈0.109
  near(m.revenueCagr!, Math.pow(333605938 / 258935494, 1 / 2) - 1, 0.002); // ≈0.135
});

test("신한지주: 매출 null → 매출 기반 지표는 null, 순이익 CAGR로 대체 성장", () => {
  const m = computeMetrics(SHINHAN.financials, SHINHAN.market);
  assert.equal(m.opMargin, null); // 매출 null → null
  assert.equal(m.netMargin, null);
  assert.equal(m.revenueGrowth, null);
  assert.equal(m.revenueCagr, null);
  near(m.roe!, 5084519000000 / 60372324000000, 0.002); // ≈0.0842
  near(m.niCagr!, Math.pow(5084519 / 4478000, 1 / 2) - 1, 0.002); // ≈0.0656
});

test("카카오: 최신 흑자지만 전년 적자 → niGrowth 는 음수 기저라 null", () => {
  const m = computeMetrics(KAKAO.financials, KAKAO.market);
  near(m.roe!, 517959587282 / 15224922016050, 0.002); // ≈0.034
  assert.equal(m.niGrowth, null); // 2024 순이익 음수 기저
  near(m.revenueGrowth!, (8099147815086 - 7871692199887) / 7871692199887, 0.002);
});
