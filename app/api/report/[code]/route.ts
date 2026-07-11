/**
 * GET /api/report/[code] — 전체 파이프라인으로 완성된 리포트(Report) 반환.
 *
 * 원자재 수집(DART+KRX) → 분석 엔진(밸류에이션) → LLM 서술(Gemini API) → 수치 검증 → 병합.
 *
 * ⚠️ 콜드 캐시 시 KRX 시세 수집으로 수 분 소요. GEMINI_API_KEY 미설정 시 서술 생성에서
 *   502로 실패한다(그 전 계산 결과는 정상). Phase 6에서 캐시 예열·스트리밍으로 개선.
 */
import { NextResponse } from "next/server";
import { fetchCompanyReport } from "@/lib/company";
import { analyze } from "@/lib/analysis";
import { generateReportCached } from "@/lib/report/generate";
import { StockNotFoundError } from "@/lib/stock-master";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "6자리 종목코드가 아닙니다 (예: 005930)" }, { status: 400 });
  }
  try {
    const data = await fetchCompanyReport(code);
    const valuation = analyze(data);
    const report = await generateReportCached(data, valuation);
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof StockNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
