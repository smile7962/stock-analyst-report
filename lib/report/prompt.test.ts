import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDataBlock } from "./prompt";
import { computeMetrics } from "../analysis/metrics";
import { classifyCompany } from "../analysis/classify";
import { valuate } from "../analysis/valuation";
import { SAMSUNG, SHINHAN, SAMSUNG_CONSENSUS } from "../analysis/fixtures";
import type { CompanyReportData } from "../types";
import type { Consensus } from "../consensus";

function dataBlock(
  fx: typeof SAMSUNG | typeof SHINHAN,
  consensus: Consensus | null = null,
): string {
  const data: CompanyReportData = {
    profile: fx.profile,
    annualFinancials: fx.financials,
    market: fx.market,
    disclosures: [],
    consensus,
    fetchedAt: "2026-07-11T00:00:00Z",
  };
  const metrics = computeMetrics(fx.financials, fx.market);
  const valuation = valuate(
    fx.profile.stockCode,
    classifyCompany(fx.profile, fx.financials[0]),
    metrics,
    fx.market,
    fx.financials[0].revenue,
    consensus,
  );
  return buildDataBlock(data, valuation);
}

test("일반 기업은 부채비율 값을 데이터에 포함한다", () => {
  const block = dataBlock(SAMSUNG);
  assert.match(block, /부채비율 \d/); // "부채비율 29.9%"
  assert.match(block, /영업이익률 \d/);
});

test("금융업은 부채비율 값을 빼고 부적합 주석을 넣는다", () => {
  const block = dataBlock(SHINHAN);
  assert.doesNotMatch(block, /부채비율 \d/); // 값(예: 1201.9%)을 제시하지 않음
  assert.match(block, /부적합하여 제시하지 않는다/);
});

test("컨센서스가 있으면 [시장 컨센서스] 섹션에 선행 EPS·목표주가를 담는다", () => {
  const block = dataBlock(SAMSUNG, SAMSUNG_CONSENSUS);
  assert.match(block, /\[시장 컨센서스\]/);
  assert.match(block, /선행 EPS/);
  assert.match(block, /목표주가 컨센서스/);
});

test("컨센서스가 없으면 [시장 컨센서스] 섹션을 넣지 않는다", () => {
  const block = dataBlock(SAMSUNG, null);
  assert.doesNotMatch(block, /\[시장 컨센서스\]/);
});
