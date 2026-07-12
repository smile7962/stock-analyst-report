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

/** 일별 시세 1행. 가격 단위: 원 */
export interface DailyPrice {
  /** YYYYMMDD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 최신 거래일 기준 시세 스냅샷 */
export interface MarketSnapshot {
  stockCode: string;
  /** 기준 거래일 YYYYMMDD */
  date: string;
  /** 종가(현재가) */
  close: number;
  /** 전일 대비 (원) */
  change: number;
  /** 전일 대비 등락률 (%) — 코드가 계산 */
  changePct: number;
  marketCap: number;
  listedShares: number;
  high52w: number;
  low52w: number;
  /** KOSPI / KOSDAQ 등 시장 구분 */
  market: string;
  /** KRX 업종명. 조회 실패 시 null (실패를 감추지 않는다) */
  sector: string | null;
}

export interface Disclosure {
  /** 접수번호 */
  rceptNo: string;
  title: string;
  /** YYYYMMDD */
  date: string;
  submitter: string;
}

/**
 * 리포트 생성 입력이 되는 종목 "원자재" 데이터 (DART + KRX 병합).
 * 분석 엔진(Phase 2)이 이 JSON을 먹어 재무비율·밸류에이션을 계산한다.
 * 수치 계산은 전혀 하지 않고, 정규화된 원천 데이터만 담는다.
 */
export interface CompanyReportData {
  profile: CompanyProfile;
  /** 연간(사업보고서) 재무 스냅샷 — 최신 연도 우선 정렬 */
  annualFinancials: FinancialSnapshot[];
  /** 최신 거래일 기준 시세 스냅샷 */
  market: MarketSnapshot;
  /** 최근 공시 (최신순) */
  disclosures: Disclosure[];
  /** DART 사업보고서 '사업의 개요' 발췌 (없으면 null/미설정) */
  businessOverview?: string | null;
  /** 데이터 수집 시각 (ISO) — 캐시 조각의 신선도가 달라 병합 시점을 기록한다 */
  fetchedAt: string;
}
