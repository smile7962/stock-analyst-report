/**
 * 리포트 생성 레이어 타입 (DEVELOPMENT_PLAN §6).
 *
 * 핵심 원칙: LLM은 서술 필드만 생성한다. 수치·투자의견은 백엔드 계산값을 그대로 쓰고
 * 코드에서 병합한다 (§6.1). 따라서 ReportNarrative 에는 숫자 필드가 없다.
 */
import type { CompanyReportData } from "../types";
import type { ValuationResult } from "../analysis/types";

/** LLM 출력 — 서술 전용. 어떤 필드도 수치를 담지 않는다 (§6.1) */
export interface ReportNarrative {
  /** 핵심 투자 논거 3줄 */
  summary: string[];
  /** 사업 개요 서술 */
  business: string;
  /** 실적 추이 해석 */
  earningsComment: string;
  /** 밸류에이션 산출 논리 서술 */
  valuationComment: string;
  /** 강점 3가지 */
  strengths: string[];
  /** 리스크 3가지 */
  risks: string[];
  /** 종합 애널리스트 의견 */
  analystView: string;
}

/** 수치 검증기 결과 (§6.4) */
export interface VerificationFinding {
  /** 검증에 걸린 서술 필드명 */
  field: keyof ReportNarrative;
  /** 문제가 된 문장 */
  sentence: string;
  /** 입력 데이터와 대조되지 않은 수치 표현 */
  unmatched: string[];
}

export interface VerificationResult {
  passed: boolean;
  findings: VerificationFinding[];
  /** 재생성 시도 횟수 (0 = 1회 통과) */
  regenerated: number;
}

/**
 * 최종 리포트 = 백엔드 계산값(valuation·원자재 데이터) + LLM 서술을 코드에서 병합한 것.
 * 화면·PDF 렌더링의 단일 입력.
 */
export interface Report {
  stockCode: string;
  /** 백엔드 계산값 (수치의 유일한 출처) */
  valuation: ValuationResult;
  /** 원자재 데이터 (재무·시세·공시) */
  data: CompanyReportData;
  /** LLM 서술 */
  narrative: ReportNarrative;
  /** 수치 검증 결과 — 실패해도 리포트는 반환하되 플래그를 남긴다 (§6.4) */
  verification: VerificationResult;
  /** 면책 문구 (모든 출력에 포함 — CLAUDE.md 규칙 8, §8) */
  disclaimer: string;
  generatedAt: string;
}

export const DISCLAIMER =
  "본 리포트는 공시 데이터 기반 자동 생성 참고자료이며, 투자 권유가 아닙니다. " +
  "투자 판단의 책임은 이용자 본인에게 있습니다.";
