/** 분석 엔진(Phase 2) 출력 계약 — 모든 수치는 코드가 계산한다 (CLAUDE.md 규칙 5). */

/** 업종별 밸류에이션 분기용 기업 유형 (DEVELOPMENT_PLAN §5.1) */
export type CompanyType = "general" | "financial" | "holding" | "lossmaking";

/** 규칙 기반 투자의견 (§5.3) */
export type Opinion = "매수" | "중립" | "매도" | "의견제시불가";

/** 재무비율 12종 — 값 없음/분모 0/음수 기저는 null (조용히 0 처리 금지) */
export interface FinancialMetrics {
  /** 주당순이익 (원) */
  eps: number | null;
  /** 주당순자산 (원) */
  bps: number | null;
  /** 자기자본이익률 = 당기순이익/자본총계 */
  roe: number | null;
  /** 총자산이익률 = 당기순이익/자산총계 */
  roa: number | null;
  /** PER = 현재가/EPS */
  per: number | null;
  /** PBR = 현재가/BPS */
  pbr: number | null;
  /** 영업이익률 = 영업이익/매출액 */
  opMargin: number | null;
  /** 순이익률 = 당기순이익/매출액 */
  netMargin: number | null;
  /** 부채비율 = 부채총계/자본총계 */
  debtRatio: number | null;
  /** 자기자본비율 = 자본총계/자산총계 */
  equityRatio: number | null;
  /** 매출액 전년대비 성장률(최신) */
  revenueGrowth: number | null;
  /** 영업이익 전년대비 성장률(최신) */
  opGrowth: number | null;
  /** 당기순이익 전년대비 성장률(최신) */
  niGrowth: number | null;
  /** 매출액 CAGR (수집 연도 전체, 양수 기저만) */
  revenueCagr: number | null;
  /** 당기순이익 CAGR (매출 없는 금융업 대체 성장 지표) */
  niCagr: number | null;
}

/** 보수/기본/낙관 3밴드 (§5.3). 값 오름차순 보장 */
export interface ValuationBand {
  conservative: number;
  base: number;
  optimistic: number;
}

export interface MethodValuation {
  method: "RIM" | "MULTIPLE" | "PSR";
  /** 방법론별 3밴드. 산출 불가 시 null */
  band: ValuationBand | null;
  /** 목표주가 합성 가중치 */
  weight: number;
  /** 산출 근거·가정 서술 (리포트 표기) */
  note: string;
}

export interface ValuationResult {
  stockCode: string;
  companyType: CompanyType;
  currentPrice: number;
  metrics: FinancialMetrics;
  methods: MethodValuation[];
  /** 합성 목표주가 3밴드. 적자기업 등 산출 불가 시 null */
  targetPrice: ValuationBand | null;
  /** 기본 밴드 기준 상승여력 (%) */
  upsidePct: number | null;
  opinion: Opinion;
  /** 산출에 쓴 가정 — 리포트에 반드시 표기 (§5.3) */
  assumptions: string[];
}
