/**
 * 프론트엔드 표시용 포맷터·스타일 헬퍼.
 *
 * 색상 관례(DEVELOPMENT_PLAN §4.1): 상승 = 빨강, 하락 = 파랑 (국내 관례).
 * 계산은 하지 않는다 — 이미 계산된 값을 문자열/클래스로 바꾸기만 한다.
 */
import type { CompanyType, Opinion } from "../analysis/types";

/** 금액을 조/억/원으로. 큰 재무 수치용 */
export function won(n: number | null): string {
  if (n == null) return "자료 없음";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(1)}조원`;
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(0)}억원`;
  return `${sign}${Math.round(a).toLocaleString("ko-KR")}원`;
}

/** 주가처럼 원 단위 그대로 콤마 표기 */
export function price(n: number | null): string {
  return n == null ? "-" : `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** 퍼센트. isRatio=true 이면 ×100 */
export function pct(n: number | null, isRatio = false): string {
  if (n == null) return "-";
  return `${(isRatio ? n * 100 : n).toFixed(1)}%`;
}

export function mult(n: number | null): string {
  return n == null ? "-" : `${n.toFixed(1)}배`;
}

/** 부호 포함 표기 (전일대비·상승여력) */
export function signed(n: number | null, unit: "won" | "pct"): string {
  if (n == null) return "-";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const body = unit === "won" ? Math.abs(Math.round(n)).toLocaleString("ko-KR") + "원" : `${Math.abs(n).toFixed(1)}%`;
  return `${sign}${body}`;
}

/** 등락 방향 색상 (상승 빨강 / 하락 파랑 / 보합 회색) */
export function changeColor(n: number | null): string {
  if (n == null || n === 0) return "text-neutral-500";
  return n > 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400";
}

/** 배수 표기, 단 값이 0 이하면 의미 없으므로 N/A (적자기업 PER 등) */
export function multOrNA(n: number | null): string {
  return n != null && n > 0 ? mult(n) : "N/A";
}

/** 기업 유형 한국어 라벨 */
export function companyTypeLabel(t: CompanyType): string {
  switch (t) {
    case "financial":
      return "금융";
    case "holding":
      return "지주회사";
    case "lossmaking":
      return "적자기업";
    default:
      return "일반 기업";
  }
}

/** 투자의견 배지 라벨·색상 */
export function opinionStyle(op: Opinion): { label: string; className: string } {
  switch (op) {
    case "매수":
      return { label: "매수", className: "bg-red-600 text-white" };
    case "매도":
      return { label: "매도", className: "bg-blue-600 text-white" };
    case "중립":
      return { label: "중립", className: "bg-neutral-500 text-white" };
    default:
      return { label: "의견 제시 불가", className: "bg-neutral-400 text-white" };
  }
}
