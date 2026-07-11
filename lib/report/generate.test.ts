import { test } from "node:test";
import assert from "node:assert/strict";
import { reportCacheKey, REPORT_VERSION } from "./generate";
import { SAMSUNG } from "../analysis/fixtures";
import type { CompanyReportData } from "../types";

const base: CompanyReportData = {
  profile: SAMSUNG.profile,
  annualFinancials: SAMSUNG.financials,
  market: SAMSUNG.market, // date "20260710"
  disclosures: [],
  fetchedAt: "2026-07-11T00:00:00Z",
};

test("캐시 키는 종목·거래일·버전을 담는다", () => {
  assert.equal(reportCacheKey(base), `report:005930:20260710:v${REPORT_VERSION}`);
});

test("거래일이 다르면 키가 다르다 (새 거래일 = 재생성)", () => {
  const next = { ...base, market: { ...base.market, date: "20260711" } };
  assert.notEqual(reportCacheKey(base), reportCacheKey(next));
});

test("종목이 다르면 키가 다르다", () => {
  const other = { ...base, profile: { ...base.profile, stockCode: "055550" } };
  assert.notEqual(reportCacheKey(base), reportCacheKey(other));
});
