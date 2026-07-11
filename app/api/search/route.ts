/**
 * GET /api/search?q=삼성 — 종목명/코드 자동완성.
 *
 * 종목 마스터(data/stock-master.json)에서 이름·코드로 검색해 상위 매칭을 반환한다.
 * 리포트 생성과 달리 로컬 파일만 읽으므로 빠르다(외부 호출 없음).
 */
import { NextResponse } from "next/server";
import { searchStocks } from "@/lib/stock-master";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: searchStocks(q, 8) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
