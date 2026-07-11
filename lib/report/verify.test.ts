import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAllowedNumbers, verifyNarrative } from "./verify";
import { computeMetrics } from "../analysis/metrics";
import { classifyCompany } from "../analysis/classify";
import { valuate } from "../analysis/valuation";
import { SAMSUNG } from "../analysis/fixtures";
import type { ReportNarrative } from "./types";

// 삼성전자 실데이터로 밸류에이션 → 검증기 허용값 구성
const data = {
  profile: SAMSUNG.profile,
  annualFinancials: SAMSUNG.financials,
  market: SAMSUNG.market,
  disclosures: [],
  fetchedAt: "2026-07-11T00:00:00Z",
};
const metrics = computeMetrics(SAMSUNG.financials, SAMSUNG.market);
const valuation = valuate(
  "005930",
  classifyCompany(SAMSUNG.profile, SAMSUNG.financials[0]),
  metrics,
  SAMSUNG.market,
  SAMSUNG.financials[0].revenue,
);
const allowed = buildAllowedNumbers(data, valuation);

function narrative(over: Partial<ReportNarrative>): ReportNarrative {
  return {
    summary: ["a", "b", "c"],
    business: "",
    earningsComment: "",
    valuationComment: "",
    strengths: ["a", "b", "c"],
    risks: ["a", "b", "c"],
    analystView: "",
    ...over,
  };
}

test("데이터와 일치하는 수치(조/억·%·배·원)는 통과", () => {
  // 삼성 2025 매출 333.6조, 현재가 285,000원, ROE 10.4%, PER 36.9배, 목표 기본 172,356원
  const f = verifyNarrative(
    narrative({
      business: "2025년 매출은 333.6조원, 순이익 45.2조원을 기록했다.",
      earningsComment: "현재가 285,000원에 PER 36.9배, PBR 3.8배, ROE 10.4% 수준이다.",
      valuationComment: "기본 목표주가는 172,356원으로 상승여력은 -39.5%다.",
    }),
    allowed,
  );
  assert.deepEqual(f, [], `예상치 못한 finding: ${JSON.stringify(f)}`);
});

test("반올림된 수치도 통과 (333조원, 37배, 10%)", () => {
  const f = verifyNarrative(
    narrative({ business: "매출 333조원 규모이며 PER 37배, ROE 10%다." }),
    allowed,
  );
  assert.deepEqual(f, []);
});

test("연도·개수·주 등 단위 없는 정수는 검증 대상 아님", () => {
  const f = verifyNarrative(
    narrative({
      earningsComment: "2023년부터 2025년까지 3개년 실적과 52주 밴드를 함께 봤다.",
      analystView: "강점 3가지와 리스크 3가지를 균형 있게 제시한다.",
    }),
    allowed,
  );
  assert.deepEqual(f, []);
});

test("데이터에 없는 수치는 finding으로 잡힌다", () => {
  const f = verifyNarrative(
    narrative({ business: "매출은 999.9조원으로 창작된 값이다." }),
    allowed,
  );
  assert.equal(f.length, 1);
  assert.equal(f[0].field, "business");
  assert.ok(f[0].unmatched.some((u) => u.includes("999.9")));
});

test("배열 필드(summary/strengths/risks)의 창작 수치도 잡힌다", () => {
  const f = verifyNarrative(
    narrative({ risks: ["부채비율이 500%로 위험하다", "정상", "정상"] }),
    allowed,
  );
  assert.equal(f.length, 1);
  assert.equal(f[0].field, "risks");
  assert.ok(f[0].unmatched.some((u) => u.includes("500")));
});

test("여러 문장 중 문제 문장만 골라낸다", () => {
  const f = verifyNarrative(
    narrative({
      analystView:
        "현재가 285,000원은 부담스럽다. 적정가는 172,356원으로 본다. 다만 목표를 250,000원으로 낮춘다.",
    }),
    allowed,
  );
  assert.equal(f.length, 1);
  assert.ok(f[0].sentence.includes("250,000"));
});

test("허용값 집합에 목표주가 3밴드·지표가 모두 포함된다", () => {
  assert.ok(allowed.money.length > 5);
  assert.ok(allowed.percent.includes(15)); // 투자의견 임계
  assert.ok(allowed.multiple.length >= 2); // PER, PBR
});
