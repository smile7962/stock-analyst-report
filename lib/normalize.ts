/**
 * DART 재무제표 계정과목 정규화.
 *
 * 원칙 (CLAUDE.md 규칙 6): 계정명은 회사·보고서마다 다르므로 명시적 매핑을 두고,
 * 표준계정 ID(account_id) 우선 매칭 → 계정명(account_nm) 보조 매칭 순서로 해석한다.
 * 매핑 실패는 null로 남겨 드러낸다 (조용히 0 처리 금지).
 *
 * ⚠️ 가정 명시: 매핑 후보는 공식 표준계정 체계(IFRS taxonomy) 기준이며,
 * 실제 응답 검증은 scripts/verify-dart.ts로 확인한다. 금융업(수익 구조 상이)은
 * revenue가 null이 될 수 있고, 이는 Phase 5에서 업종별 매핑으로 확장한다.
 */
import type { DartAccountRow } from "./dart";
import type { FinancialSnapshot } from "./types";

interface AccountMatcher {
  /** 대상 재무제표 (IS=손익, CIS=포괄손익, BS=재무상태, CF=현금흐름) */
  sjDivs: string[];
  /** account_id 정확 일치 후보 (우선순위 순) */
  ids: string[];
  /** account_nm 일치 후보 (공백 제거 후 비교, 보조) */
  names: string[];
}

const MATCHERS: Record<keyof Omit<FinancialSnapshot, "period" | "fsDiv">, AccountMatcher> = {
  revenue: {
    sjDivs: ["IS", "CIS"],
    ids: ["ifrs-full_Revenue", "ifrs_Revenue"],
    names: ["매출액", "수익(매출액)", "영업수익", "매출"],
  },
  operatingProfit: {
    sjDivs: ["IS", "CIS"],
    ids: ["dart_OperatingIncomeLoss"],
    names: ["영업이익", "영업이익(손실)", "영업손익"],
  },
  netIncome: {
    sjDivs: ["IS", "CIS"],
    ids: ["ifrs-full_ProfitLoss", "ifrs_ProfitLoss"],
    names: ["당기순이익", "당기순이익(손실)", "연결당기순이익", "분기순이익", "반기순이익"],
  },
  totalAssets: {
    sjDivs: ["BS"],
    ids: ["ifrs-full_Assets", "ifrs_Assets"],
    names: ["자산총계"],
  },
  totalLiabilities: {
    sjDivs: ["BS"],
    ids: ["ifrs-full_Liabilities", "ifrs_Liabilities"],
    names: ["부채총계"],
  },
  totalEquity: {
    sjDivs: ["BS"],
    ids: ["ifrs-full_Equity", "ifrs_Equity"],
    names: ["자본총계"],
  },
  operatingCashFlow: {
    sjDivs: ["CF"],
    ids: [
      "ifrs-full_CashFlowsFromUsedInOperatingActivities",
      "ifrs_CashFlowsFromUsedInOperatingActivities",
    ],
    names: ["영업활동현금흐름", "영업활동으로인한현금흐름"],
  },
};

/** "1,234,567" / "-1,234" → 숫자(원). 빈 값·비수치는 null */
export function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^-?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

function matchRow(rows: DartAccountRow[], m: AccountMatcher): number | null {
  const inScope = rows.filter((r) => m.sjDivs.includes(r.sj_div));
  for (const id of m.ids) {
    const hit = inScope.find((r) => r.account_id === id);
    if (hit) {
      const v = parseAmount(hit.thstrm_amount);
      if (v !== null) return v;
    }
  }
  for (const name of m.names) {
    const hit = inScope.find(
      (r) => r.account_nm.replace(/\s/g, "") === name.replace(/\s/g, ""),
    );
    if (hit) {
      const v = parseAmount(hit.thstrm_amount);
      if (v !== null) return v;
    }
  }
  return null;
}

/** 전체 재무제표 계정 행들을 정규화 스냅샷으로 변환 */
export function normalizeFinancials(
  rows: DartAccountRow[],
  period: string,
  fsDiv: "CFS" | "OFS",
): FinancialSnapshot {
  return {
    period,
    fsDiv,
    revenue: matchRow(rows, MATCHERS.revenue),
    operatingProfit: matchRow(rows, MATCHERS.operatingProfit),
    netIncome: matchRow(rows, MATCHERS.netIncome),
    totalAssets: matchRow(rows, MATCHERS.totalAssets),
    totalLiabilities: matchRow(rows, MATCHERS.totalLiabilities),
    totalEquity: matchRow(rows, MATCHERS.totalEquity),
    operatingCashFlow: matchRow(rows, MATCHERS.operatingCashFlow),
  };
}
