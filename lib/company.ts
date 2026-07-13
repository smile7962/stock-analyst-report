/**
 * 종목 원자재 데이터 병합 — DART(기업개황·연간 재무·최근 공시) + KRX(시세 스냅샷).
 *
 * 이 모듈은 정규화된 원천 데이터만 모은다. 재무비율·밸류에이션 등 계산은 전혀 하지 않는다
 * (CLAUDE.md 규칙 5: 계산은 Phase 2 분석 엔진의 순수 함수가 담당).
 *
 * 캐시는 조각별로 TTL을 달리한다 (시세=일, 재무·개황=분기). 병합 결과 전체를 한 키로
 * 캐시하지 않는다 — 계획서 §3의 "어제 주가로 계산되는 버그" 방지.
 */
import {
  fetchCompanyRaw,
  fetchFinancialRaw,
  fetchDisclosuresRaw,
  fetchBusinessOverview,
  REPRT_CODE,
} from "./dart";
import { normalizeFinancials, extractIncomeItems } from "./normalize";
import { KrxOpenApiClient } from "./krx";
import { fetchConsensus } from "./consensus";
import { resolveStockEntry } from "./stock-master";
import { cached, TTL } from "./cache";
import type {
  CompanyProfile,
  CompanyReportData,
  Disclosure,
  FinancialSnapshot,
  QuarterlySnapshot,
} from "./types";

/** 수집할 연간 재무 연도 수 */
const ANNUAL_YEARS = 3;
/** 최신 사업보고서 미제출 대비, 뒤로 스캔할 최대 연도 수 */
const ANNUAL_LOOKBACK = 5;
/** 표시할 분기 수(최신 우선) */
const QUARTERS_TARGET = 6;
/** 분기 수집 시 뒤로 스캔할 최대 연도 수 */
const QUARTERLY_LOOKBACK = 3;
/** 최근 공시 조회 기간(일) */
const DISCLOSURE_DAYS = 365;

/** KRX 클라이언트는 (시장,일자) 캐시를 인스턴스에 들고 있어 재사용해야 이득이다 */
let marketClient: KrxOpenApiClient | null = null;
function getMarketClient(): KrxOpenApiClient {
  if (!marketClient) marketClient = new KrxOpenApiClient();
  return marketClient;
}

export async function fetchCompanyReport(stockCode: string): Promise<CompanyReportData> {
  const { corpCode } = resolveStockEntry(stockCode); // 없으면 StockNotFoundError

  const [
    profile,
    annualFinancials,
    quarterlyFinancials,
    market,
    disclosures,
    businessOverview,
    consensus,
  ] = await Promise.all([
    cached(`profile:${corpCode}`, TTL.financials, () => fetchProfile(corpCode, stockCode)),
    cached(`fin:${corpCode}`, TTL.financials, () => fetchAnnualFinancials(corpCode)),
    // 분기 실적은 보조 정보 — 실패해도 리포트를 죽이지 않는다
    cached(`quarterly:${corpCode}`, TTL.financials, () =>
      fetchQuarterlyFinancials(corpCode).catch(() => []),
    ),
    cached(`market:${stockCode}`, TTL.daily, () => getMarketClient().fetchSnapshot(stockCode)),
    cached(`disc:${corpCode}`, TTL.daily, () => fetchRecentDisclosures(corpCode)),
    // 사업 개요는 보조 정보 — 실패해도 리포트를 죽이지 않는다
    cached(`biz:${corpCode}`, TTL.financials, () =>
      fetchBusinessOverview(corpCode).catch(() => null),
    ),
    // 컨센서스는 선행 밸류에이션 보정용 — 실패/미커버리지면 null (fetchConsensus 자체가 방어)
    cached(`consensus:${stockCode}`, TTL.daily, () => fetchConsensus(stockCode)),
  ]);

  return {
    profile,
    annualFinancials,
    quarterlyFinancials,
    market,
    disclosures,
    businessOverview,
    consensus,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchProfile(corpCode: string, stockCode: string): Promise<CompanyProfile> {
  const raw = await fetchCompanyRaw(corpCode);
  return {
    corpCode,
    stockCode,
    name: raw.corp_name,
    ceo: raw.ceo_nm,
    indutyCode: raw.induty_code,
    establishedDate: raw.est_dt,
    homepage: raw.hm_url,
  };
}

/**
 * 최신 연도부터 거슬러 올라가며 사업보고서(연간) 재무를 ANNUAL_YEARS 개 수집한다.
 * 연도별로 연결(CFS) 우선, 없으면 별도(OFS)로 폴백한다.
 */
async function fetchAnnualFinancials(corpCode: string): Promise<FinancialSnapshot[]> {
  const results: FinancialSnapshot[] = [];
  const startYear = new Date().getFullYear() - 1;
  for (
    let year = startYear;
    year > startYear - ANNUAL_LOOKBACK && results.length < ANNUAL_YEARS;
    year--
  ) {
    const snap = await fetchAnnualForYear(corpCode, year);
    if (snap) results.push(snap);
  }
  return results; // 최신 연도 우선
}

async function fetchAnnualForYear(
  corpCode: string,
  year: number,
): Promise<FinancialSnapshot | null> {
  for (const fsDiv of ["CFS", "OFS"] as const) {
    const fin = await fetchFinancialRaw(corpCode, String(year), REPRT_CODE.annual, fsDiv);
    if (fin.list?.length) return normalizeFinancials(fin.list, String(year), fsDiv);
  }
  return null;
}

/**
 * 분기 실적(당분기 3개월) 시리즈를 최신 분기 우선으로 QUARTERS_TARGET 개 수집한다.
 *
 * DART 손익계산서 금액 필드(실응답 확인, §6):
 *  - thstrm_amount     = 당분기 3개월(discrete). 1Q·2Q·3Q 그대로 사용.
 *  - thstrm_add_amount = 당기 누적(YTD). 4Q는 직접 제공되지 않아 연간−3Q누적으로 계산한다.
 */
async function fetchQuarterlyFinancials(corpCode: string): Promise<QuarterlySnapshot[]> {
  const startYear = new Date().getFullYear();
  const collected: QuarterlySnapshot[] = [];
  for (
    let year = startYear;
    year > startYear - QUARTERLY_LOOKBACK && collected.length < QUARTERS_TARGET;
    year--
  ) {
    collected.push(...(await quartersForYear(corpCode, year)));
  }
  return collected.sort(byPeriodDesc).slice(0, QUARTERS_TARGET);
}

/** 한 사업연도의 1Q~4Q 당분기 실적. 미제출 분기는 건너뛴다 */
async function quartersForYear(corpCode: string, year: number): Promise<QuarterlySnapshot[]> {
  const [q1, q2, q3, annual] = await Promise.all([
    fetchQuarterIncome(corpCode, year, REPRT_CODE.q1),
    fetchQuarterIncome(corpCode, year, REPRT_CODE.half),
    fetchQuarterIncome(corpCode, year, REPRT_CODE.q3),
    fetchQuarterIncome(corpCode, year, REPRT_CODE.annual),
  ]);
  const out: QuarterlySnapshot[] = [];
  if (q1) out.push({ period: `${year} 1Q`, ...q1.discrete });
  if (q2) out.push({ period: `${year} 2Q`, ...q2.discrete });
  if (q3) out.push({ period: `${year} 3Q`, ...q3.discrete });
  // 4Q = 연간(누적 전체) − 3Q 누적(9개월)
  if (annual && q3) {
    out.push({
      period: `${year} 4Q`,
      revenue: sub(annual.discrete.revenue, q3.cumulative.revenue),
      operatingProfit: sub(annual.discrete.operatingProfit, q3.cumulative.operatingProfit),
      netIncome: sub(annual.discrete.netIncome, q3.cumulative.netIncome),
    });
  }
  return out;
}

type IncomeItems = { revenue: number | null; operatingProfit: number | null; netIncome: number | null };

/** 한 보고서의 당기(3개월)·당기누적(YTD) 손익 3종. 연결 우선, 없으면 별도. 데이터 없으면 null */
async function fetchQuarterIncome(
  corpCode: string,
  year: number,
  reprtCode: string,
): Promise<{ discrete: IncomeItems; cumulative: IncomeItems } | null> {
  for (const fsDiv of ["CFS", "OFS"] as const) {
    const fin = await fetchFinancialRaw(corpCode, String(year), reprtCode, fsDiv);
    if (fin.list?.length) {
      return {
        discrete: extractIncomeItems(fin.list, "thstrm_amount"),
        cumulative: extractIncomeItems(fin.list, "thstrm_add_amount"),
      };
    }
  }
  return null;
}

/** a−b (둘 다 있을 때만) */
function sub(a: number | null, b: number | null): number | null {
  return a != null && b != null ? a - b : null;
}

/** "2025 3Q" 최신 우선 정렬 (연도 desc, 분기 desc) */
function byPeriodDesc(a: QuarterlySnapshot, b: QuarterlySnapshot): number {
  const [ya, qa] = a.period.split(" ");
  const [yb, qb] = b.period.split(" ");
  return yb.localeCompare(ya) || qb.localeCompare(qa);
}

async function fetchRecentDisclosures(corpCode: string): Promise<Disclosure[]> {
  const now = new Date();
  const begin = new Date(now.getTime() - DISCLOSURE_DAYS * 24 * 60 * 60 * 1000);
  const res = await fetchDisclosuresRaw(corpCode, fmtDate(begin), fmtDate(now));
  return (res.list ?? []).map((r) => ({
    rceptNo: r.rcept_no,
    title: r.report_nm,
    date: r.rcept_dt,
    submitter: r.flr_nm,
  }));
}

/** Date → YYYYMMDD */
function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
