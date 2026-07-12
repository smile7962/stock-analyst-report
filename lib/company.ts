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
import { normalizeFinancials } from "./normalize";
import { KrxOpenApiClient } from "./krx";
import { resolveStockEntry } from "./stock-master";
import { cached, TTL } from "./cache";
import type { CompanyProfile, CompanyReportData, Disclosure, FinancialSnapshot } from "./types";

/** 수집할 연간 재무 연도 수 */
const ANNUAL_YEARS = 3;
/** 최신 사업보고서 미제출 대비, 뒤로 스캔할 최대 연도 수 */
const ANNUAL_LOOKBACK = 5;
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

  const [profile, annualFinancials, market, disclosures, businessOverview] = await Promise.all([
    cached(`profile:${corpCode}`, TTL.financials, () => fetchProfile(corpCode, stockCode)),
    cached(`fin:${corpCode}`, TTL.financials, () => fetchAnnualFinancials(corpCode)),
    cached(`market:${stockCode}`, TTL.daily, () => getMarketClient().fetchSnapshot(stockCode)),
    cached(`disc:${corpCode}`, TTL.daily, () => fetchRecentDisclosures(corpCode)),
    // 사업 개요는 보조 정보 — 실패해도 리포트를 죽이지 않는다
    cached(`biz:${corpCode}`, TTL.financials, () =>
      fetchBusinessOverview(corpCode).catch(() => null),
    ),
  ]);

  return {
    profile,
    annualFinancials,
    market,
    disclosures,
    businessOverview,
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
