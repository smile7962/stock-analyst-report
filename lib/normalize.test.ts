import { test } from "node:test";
import assert from "node:assert/strict";
import { extractIncomeItems, normalizeFinancials } from "./normalize";
import type { DartAccountRow } from "./dart";

// 분기보고서 손익 실응답 형태(삼성 2025 3분기): 당기(3개월)=thstrm, 누적(9개월)=thstrm_add
const quarterRows: DartAccountRow[] = [
  {
    sj_div: "IS",
    account_id: "ifrs-full_Revenue",
    account_nm: "매출액",
    thstrm_amount: "86061747000000",
    thstrm_add_amount: "239768567000000",
  },
  {
    sj_div: "IS",
    account_id: "dart_OperatingIncomeLoss",
    account_nm: "영업이익",
    thstrm_amount: "12000000000000",
    thstrm_add_amount: "30000000000000",
  },
  {
    sj_div: "IS",
    account_id: "ifrs-full_ProfitLoss",
    account_nm: "분기순이익",
    thstrm_amount: "12200000000000",
    thstrm_add_amount: "31000000000000",
  },
];

test("extractIncomeItems: 당기(3개월) 금액 추출 (thstrm_amount)", () => {
  const it = extractIncomeItems(quarterRows, "thstrm_amount");
  assert.equal(it.revenue, 86061747000000);
  assert.equal(it.operatingProfit, 12000000000000);
  assert.equal(it.netIncome, 12200000000000);
});

test("extractIncomeItems: 당기 누적(YTD) 금액 추출 (thstrm_add_amount) — Q4 산출용", () => {
  const it = extractIncomeItems(quarterRows, "thstrm_add_amount");
  assert.equal(it.revenue, 239768567000000);
  assert.equal(it.operatingProfit, 30000000000000);
});

test("extractIncomeItems: 누적 필드 없으면 null (연간 보고서 등)", () => {
  const annualRow: DartAccountRow[] = [
    {
      sj_div: "IS",
      account_id: "ifrs-full_Revenue",
      account_nm: "매출액",
      thstrm_amount: "333605938000000",
    },
  ];
  assert.equal(extractIncomeItems(annualRow, "thstrm_add_amount").revenue, null);
  assert.equal(extractIncomeItems(annualRow, "thstrm_amount").revenue, 333605938000000);
});

test("normalizeFinancials 는 기존대로 당기(thstrm) 기준 (회귀 방지)", () => {
  const snap = normalizeFinancials(quarterRows, "2025Q3", "CFS");
  assert.equal(snap.revenue, 86061747000000);
  assert.equal(snap.period, "2025Q3");
});
