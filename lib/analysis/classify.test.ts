import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCompany } from "./classify";
import { SAMSUNG, SHINHAN, KAKAO } from "./fixtures";
import type { CompanyProfile, FinancialSnapshot } from "../types";

const profile = (name: string, indutyCode: string): CompanyProfile => ({
  corpCode: "0",
  stockCode: "000000",
  name,
  ceo: "-",
  indutyCode,
  establishedDate: "-",
  homepage: "-",
});

const fin = (netIncome: number): FinancialSnapshot => ({
  period: "2025",
  fsDiv: "CFS",
  revenue: 1000,
  operatingProfit: 100,
  netIncome,
  totalAssets: 1000,
  totalLiabilities: 400,
  totalEquity: 600,
  operatingCashFlow: 100,
});

test("대표 3종목 분류", () => {
  assert.equal(classifyCompany(SAMSUNG.profile, SAMSUNG.financials[0]), "general");
  assert.equal(classifyCompany(SHINHAN.profile, SHINHAN.financials[0]), "financial");
  assert.equal(classifyCompany(KAKAO.profile, KAKAO.financials[0]), "general");
});

test("적자 우선 판정 — 금융업이라도 순이익 ≤ 0 이면 lossmaking", () => {
  assert.equal(classifyCompany(profile("적자테크", "264"), fin(-100)), "lossmaking");
  assert.equal(classifyCompany(profile("적자은행", "64992"), fin(-1)), "lossmaking");
  assert.equal(classifyCompany(profile("적자테크", "264"), fin(0)), "lossmaking"); // 0 포함
});

test("금융(KSIC 64/65/66) 판별", () => {
  assert.equal(classifyCompany(profile("어떤은행", "64110"), fin(100)), "financial");
  assert.equal(classifyCompany(profile("어떤보험", "65110"), fin(100)), "financial");
  assert.equal(classifyCompany(profile("어떤금융서비스", "66201"), fin(100)), "financial");
});

test("지주회사 상호 판별 (비금융)", () => {
  assert.equal(classifyCompany(profile("LG지주", "70200"), fin(100)), "holding");
  assert.equal(classifyCompany(profile("어떤홀딩스", "64992"), fin(100)), "financial"); // 금융이 우선
});
