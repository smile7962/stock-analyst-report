/**
 * OpenDART API 클라이언트.
 *
 * 스키마 근거: OpenDART 공식 개발가이드 (opendart.fss.or.kr/guide)
 *  - 기업개황: /api/company.json
 *  - 단일회사 전체 재무제표: /api/fnlttSinglAcntAll.json
 *  - 공시검색: /api/list.json
 *
 * ⚠️ 가정 명시: 본 필드명들은 공식 문서 기준이며, 실제 응답 검증은
 * scripts/verify-dart.ts 실행으로 확인한다 (네트워크 정책 허용 후).
 */

const BASE = "https://opendart.fss.or.kr/api";

/** 보고서 코드: 사업보고서(연간) / 반기 / 1분기 / 3분기 */
export const REPRT_CODE = {
  annual: "11011",
  half: "11012",
  q1: "11013",
  q3: "11014",
} as const;

function apiKey(): string {
  const key = process.env.DART_API_KEY;
  if (!key) throw new Error("DART_API_KEY 환경변수가 없습니다");
  return key;
}

async function dartGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ crtfc_key: apiKey(), ...params });
  const res = await fetch(`${BASE}/${path}?${qs}`);
  if (!res.ok) throw new Error(`DART HTTP ${res.status}: ${path}`);
  const json = (await res.json()) as { status: string; message: string } & T;
  // status "000"=정상, "013"=조회 데이터 없음 (호출부에서 구분 처리)
  if (json.status !== "000" && json.status !== "013") {
    throw new Error(`DART 오류 ${json.status}: ${json.message} (${path})`);
  }
  return json;
}

/** 기업개황 원본 응답 (사용 필드만 선언) */
export interface DartCompanyRaw {
  status: string;
  corp_name: string;
  stock_code: string;
  ceo_nm: string;
  induty_code: string;
  est_dt: string;
  hm_url: string;
}

export async function fetchCompanyRaw(corpCode: string): Promise<DartCompanyRaw> {
  return dartGet<DartCompanyRaw>("company.json", { corp_code: corpCode });
}

/** 전체 재무제표 계정 행 원본 (사용 필드만 선언) */
export interface DartAccountRow {
  /** 재무제표 구분: BS/IS/CIS/CF/SCE */
  sj_div: string;
  /** 표준계정 ID (예: ifrs-full_Revenue). 표준 외 계정은 "-표준계정코드 미사용-" */
  account_id: string;
  account_nm: string;
  /** 당기 금액 (콤마 포함 문자열, 음수는 -) */
  thstrm_amount: string;
}

export interface DartFnlttResponse {
  status: string;
  message: string;
  list?: DartAccountRow[];
}

/**
 * 단일회사 전체 재무제표.
 * @param fsDiv CFS=연결, OFS=별도
 */
export async function fetchFinancialRaw(
  corpCode: string,
  bsnsYear: string,
  reprtCode: string,
  fsDiv: "CFS" | "OFS",
): Promise<DartFnlttResponse> {
  return dartGet<DartFnlttResponse>("fnlttSinglAcntAll.json", {
    corp_code: corpCode,
    bsns_year: bsnsYear,
    reprt_code: reprtCode,
    fs_div: fsDiv,
  });
}

export interface DartDisclosureRow {
  rcept_no: string;
  report_nm: string;
  rcept_dt: string;
  flr_nm: string;
}

export interface DartListResponse {
  status: string;
  list?: DartDisclosureRow[];
}

/** 최근 공시 목록 (최신순) */
export async function fetchDisclosuresRaw(
  corpCode: string,
  beginDate: string,
  endDate: string,
  count = 20,
): Promise<DartListResponse> {
  return dartGet<DartListResponse>("list.json", {
    corp_code: corpCode,
    bgn_de: beginDate,
    end_de: endDate,
    page_count: String(count),
  });
}
