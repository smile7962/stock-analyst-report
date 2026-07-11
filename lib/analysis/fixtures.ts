/**
 * 단위 테스트용 실데이터 픽스처 (2026-07-11 DART·KRX 실응답에서 수집).
 * 대표 3종목: 삼성전자(일반)·신한지주(금융)·카카오(일반, 최근 적자 이력).
 * ⚠️ 테스트 전용 — 런타임 코드에서 import 하지 않는다.
 */
import type { CompanyProfile, FinancialSnapshot, MarketSnapshot } from "../types";

function fs(
  period: string,
  revenue: number | null,
  operatingProfit: number,
  netIncome: number,
  totalAssets: number,
  totalLiabilities: number,
  totalEquity: number,
  operatingCashFlow: number,
): FinancialSnapshot {
  return {
    period,
    fsDiv: "CFS",
    revenue,
    operatingProfit,
    netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    operatingCashFlow,
  };
}

function market(
  stockCode: string,
  close: number,
  listedShares: number,
  marketCap: number,
): MarketSnapshot {
  return {
    stockCode,
    date: "20260710",
    close,
    change: 0,
    changePct: 0,
    marketCap,
    listedShares,
    high52w: close,
    low52w: close,
    market: "KOSPI",
    sector: null,
  };
}

// ── 삼성전자 (005930) 일반 제조 ──────────────────────────────────────────
export const SAMSUNG = {
  profile: {
    corpCode: "00126380",
    stockCode: "005930",
    name: "삼성전자(주)",
    ceo: "전영현, 노태문",
    indutyCode: "264",
    establishedDate: "19690113",
    homepage: "www.samsung.com/sec",
  } as CompanyProfile,
  financials: [
    fs("2025", 333605938000000, 43601051000000, 45206805000000, 566942110000000, 130621773000000, 436320337000000, 85315148000000),
    fs("2024", 300870903000000, 32725961000000, 34451351000000, 514531948000000, 112339878000000, 402192070000000, 72982621000000),
    fs("2023", 258935494000000, 6566976000000, 15487100000000, 455905980000000, 92228115000000, 363677865000000, 44137427000000),
  ] as FinancialSnapshot[],
  market: market("005930", 285000, 5846278608, 1666189403280000),
};

// ── 신한지주 (055550) 금융지주 (매출 null) ───────────────────────────────
export const SHINHAN = {
  profile: {
    corpCode: "00382199",
    stockCode: "055550",
    name: "신한지주",
    ceo: "진옥동",
    indutyCode: "64992",
    establishedDate: "20010901",
    homepage: "www.shinhangroup.com",
  } as CompanyProfile,
  financials: [
    fs("2025", null, 7023357000000, 5084519000000, 786013485000000, 725641161000000, 60372324000000, 9730881000000),
    fs("2024", null, 6458670000000, 4558170000000, 739764256000000, 680943223000000, 58821033000000, 4626299000000),
    fs("2023", null, 6100850000000, 4478000000000, 691795333000000, 635473468000000, 56321865000000, 529846000000),
  ] as FinancialSnapshot[],
  market: market("055550", 109200, 474654361, 51832256221200),
};

// ── 카카오 (035720) 일반, 2024·2023 적자 이력 ────────────────────────────
export const KAKAO = {
  profile: {
    corpCode: "00918444",
    stockCode: "035720",
    name: "카카오",
    ceo: "정신아",
    indutyCode: "63120",
    establishedDate: "19950216",
    homepage: "www.kakaocorp.com",
  } as CompanyProfile,
  financials: [
    fs("2025", 8099147815086, 732036535379, 517959587282, 27783524545811, 12558602529761, 15224922016050, 1404762595727),
    fs("2024", 7871692199887, 460212161525, -161870567171, 25773028304462, 11830134144725, 13942894159737, 1250459006332),
    fs("2023", 7557001757272, 460857845673, -1816669011014, 25179968939321, 11321369715195, 13858599224126, 1341098333644),
  ] as FinancialSnapshot[],
  market: market("035720", 35350, 442981070, 15659380824500),
};
