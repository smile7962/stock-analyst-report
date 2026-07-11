/** 도메인 공통 타입 — REPORT_SPEC.md의 데이터 계약과 정합 유지 */

export interface CompanyProfile {
  corpCode: string;
  stockCode: string;
  name: string;
  ceo: string;
  /** DART 업종코드 (한국표준산업분류) */
  indutyCode: string;
  /** 설립일 YYYYMMDD */
  establishedDate: string;
  homepage: string;
}

/** 정규화된 연간/분기 재무 스냅샷. 값 단위: 원 */
export interface FinancialSnapshot {
  /** 예: "2025", "2026Q1" */
  period: string;
  /** 연결(CFS) / 별도(OFS) */
  fsDiv: "CFS" | "OFS";
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  operatingCashFlow: number | null;
}

export interface Disclosure {
  /** 접수번호 */
  rceptNo: string;
  title: string;
  /** YYYYMMDD */
  date: string;
  submitter: string;
}
