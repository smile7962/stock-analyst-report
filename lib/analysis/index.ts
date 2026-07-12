/**
 * 분석 엔진 오케스트레이터 — CompanyReportData(원자재 JSON) → ValuationResult.
 *
 * Phase 1 라우트가 만든 정규화 데이터를 입력받아 지표·분류·밸류에이션을 계산한다.
 * 여기서도 서술(LLM)은 전혀 하지 않는다 — 순수 계산만.
 */
import type { CompanyReportData } from "../types";
import { computeMetrics } from "./metrics";
import { classifyCompany } from "./classify";
import { valuate } from "./valuation";
import type { ValuationResult } from "./types";

export function analyze(data: CompanyReportData): ValuationResult {
  const latest = data.annualFinancials[0];
  const metrics = computeMetrics(data.annualFinancials, data.market);
  const companyType = classifyCompany(data.profile, latest);
  return valuate(
    data.profile.stockCode,
    companyType,
    metrics,
    data.market,
    latest?.revenue ?? null,
    data.consensus ?? null,
  );
}

export * from "./types";
export { computeMetrics } from "./metrics";
export { classifyCompany } from "./classify";
export {
  valuate,
  growthScenarios,
  rimValue,
  forwardEarningsValue,
  spreadBand,
  REQUIRED_RETURN,
} from "./valuation";
