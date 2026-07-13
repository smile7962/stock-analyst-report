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

import { unzipSync, strFromU8 } from "fflate";

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
  /** 당기 금액 (콤마 포함 문자열, 음수는 -). 분기·반기 손익은 당기 3개월(discrete) */
  thstrm_amount: string;
  /** 당기 누적 금액(YTD). 분기·반기 손익만 존재하며, 연간·재무상태표에는 빈 값일 수 있다 */
  thstrm_add_amount?: string;
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

/**
 * 최신 사업보고서의 '사업의 개요' 발췌.
 *
 * 스키마 근거(2026-07 실응답 확인): document.xml?rcept_no=... 은 원문 문서를 ZIP으로 준다.
 * 첫 XML 파일 본문에서 '사업의 개요' 헤딩 이후 텍스트를 태그 제거해 발췌한다.
 * 보조 정보이므로 실패 시 null 을 반환한다(리포트를 죽이지 않는다).
 */
export async function fetchBusinessOverview(corpCode: string): Promise<string | null> {
  const now = new Date();
  const yyyymmdd = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const begin = `${now.getFullYear() - 2}0101`;
  const list = await fetchDisclosuresRaw(corpCode, begin, yyyymmdd(now), 100);
  const biz = (list.list ?? []).find((d) => d.report_nm.includes("사업보고서"));
  if (!biz) return null;

  const res = await fetch(`${BASE}/document.xml?crtfc_key=${apiKey()}&rcept_no=${biz.rcept_no}`);
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!(buf[0] === 0x50 && buf[1] === 0x4b)) return null; // ZIP(PK) 아니면 오류 응답

  const files = unzipSync(buf);
  const first = Object.keys(files)[0];
  if (!first) return null;
  return extractOverview(strFromU8(files[first]));
}

/** 문서 XML에서 '사업의 개요' 문단을 태그 없는 텍스트로 발췌 (~500자, 문장 경계 컷) */
function extractOverview(xml: string): string | null {
  const idx = xml.indexOf("사업의 개요");
  if (idx < 0) return null;
  let text = xml
    .slice(idx + "사업의 개요".length, idx + 2600)
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 참고 안내(☞) 또는 하위 항목 헤딩에서 컷
  const cut = text.search(/☞|[가나다라]\.\s/);
  if (cut > 120) text = text.slice(0, cut).trim();
  if (text.length > 500) {
    text = text.slice(0, 500);
    const lastDot = text.lastIndexOf(".");
    if (lastDot > 200) text = text.slice(0, lastDot + 1);
  }
  return text.length > 30 ? text : null;
}
