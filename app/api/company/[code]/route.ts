/**
 * GET /api/company/[code] — 종목 원자재 데이터(CompanyReportData) 반환.
 *
 * Phase 1 완료 기준: /api/company/005930 이 DART+KRX 병합 정규화 JSON을 돌려준다.
 * 실제 계산(밸류에이션 등)은 Phase 2 분석 엔진이 이 JSON을 입력받아 수행한다.
 *
 * ⚠️ 콜드 캐시 시 KRX 시세 스냅샷은 52주 밴드 산출을 위해 일자별로 반복 호출하므로
 *   수 분 걸릴 수 있다 (공식 Open API가 "기준일 × 시장 전체" 단위인 데 따른 비용).
 *   운영에서는 캐시 예열(야간 배치)로 완화한다 — DEVELOPMENT_PLAN Phase 6.
 */
import { NextResponse } from "next/server";
import { fetchCompanyReport } from "@/lib/company";
import { StockNotFoundError } from "@/lib/stock-master";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "6자리 종목코드가 아닙니다 (예: 005930)" },
      { status: 400 },
    );
  }

  try {
    const data = await fetchCompanyReport(code);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof StockNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    // 상류(DART/KRX) 오류는 감추지 않고 502로 그대로 노출한다
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
