/**
 * 기업 유형 분류 (DEVELOPMENT_PLAN §5.1) — 밸류에이션 방법론 분기용.
 *
 * ⚠️ 계획서는 "KRX 업종분류"로 금융 판별을 규정하나, KRX 공식 Open API는 업종(sector)을
 *   제공하지 않는다(실응답 확인, lib/krx.ts 참고). 그래서 DART 업종코드(KSIC)로 대체한다:
 *     - K 금융및보험업(64 금융/65 보험/66 관련서비스) → financial
 *   이는 추측이 아니라 표준산업분류 체계에 근거한 실제 DART 데이터다. 향후 KRX 업종
 *   데이터를 확보하면(별도 소스) 교차검증한다.
 */
import type { CompanyProfile, FinancialSnapshot } from "../types";
import type { CompanyType } from "./types";

/** KSIC 대분류 K(금융및보험업) 중분류 앞 2자리 */
const FINANCIAL_KSIC_PREFIXES = ["64", "65", "66"];

/** 지주회사 상호 관례 */
const HOLDING_NAME_PATTERN = /지주|홀딩스|holdings/i;

export function classifyCompany(
  profile: CompanyProfile,
  latest: FinancialSnapshot | undefined,
): CompanyType {
  // 1) 적자기업 우선: 최근 연간 순이익 ≤ 0 이면 멀티플 부적합 (§5.1)
  if (latest?.netIncome != null && latest.netIncome <= 0) return "lossmaking";

  // 2) 금융: DART 업종코드(KSIC) 앞 2자리로 판별
  const ksic2 = (profile.indutyCode ?? "").slice(0, 2);
  if (FINANCIAL_KSIC_PREFIXES.includes(ksic2)) return "financial";

  // 3) 지주회사: 상호 관례 (금융지주는 2)에서 이미 financial로 처리됨)
  if (HOLDING_NAME_PATTERN.test(profile.name)) return "holding";

  return "general";
}
