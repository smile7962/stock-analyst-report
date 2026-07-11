/**
 * 리포트 생성 end-to-end 관찰 스크립트 (Phase 3).
 *
 * 사용법: npx tsx scripts/verify-report.ts [6자리 종목코드]
 *   기본값 005930. DART_API_KEY·KRX_OPENAPI_KEY·GEMINI_API_KEY 필요(.env.local).
 *   프록시 환경의 Node 22에서는 NODE_USE_ENV_PROXY=1 필요.
 *
 * 전체 파이프라인을 관통한다: 원자재 수집(DART+KRX) → 분석 엔진(밸류에이션) →
 * LLM 서술 생성(Gemini API) → 수치 검증 → 병합 리포트.
 *
 * ⚠️ KRX 시세는 콜드 캐시 시 수 분 소요. GEMINI_API_KEY 가 없으면 서술 생성 단계에서
 *   명확한 오류로 멈춘다(그 전까지의 계산 결과는 정상).
 */
import { fetchCompanyReport } from "../lib/company";
import { analyze } from "../lib/analysis";
import { generateReport } from "../lib/report/generate";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

async function main() {
  const code = process.argv[2] ?? "005930";
  if (!/^\d{6}$/.test(code)) {
    console.error("6자리 종목코드를 입력하세요 (예: 005930)");
    process.exit(1);
  }

  console.log(`=== 원자재 수집·분석: ${code} ===`);
  const data = await fetchCompanyReport(code);
  const valuation = analyze(data);
  console.log(
    `${data.profile.name} · ${valuation.companyType} · 투자의견 ${valuation.opinion} · ` +
      `목표(기본) ${valuation.targetPrice ? Math.round(valuation.targetPrice.base).toLocaleString("ko-KR") + "원" : "미제시"}`,
  );

  console.log(`\n=== LLM 서술 생성 + 수치 검증 ===`);
  const report = await generateReport(data, valuation);

  const n = report.narrative;
  console.log("\n[투자 요약]");
  n.summary.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log(`\n[사업]\n  ${n.business}`);
  console.log(`\n[실적 해석]\n  ${n.earningsComment}`);
  console.log(`\n[밸류에이션 서술]\n  ${n.valuationComment}`);
  console.log(`\n[강점]`);
  n.strengths.forEach((s) => console.log(`  + ${s}`));
  console.log(`[리스크]`);
  n.risks.forEach((s) => console.log(`  - ${s}`));
  console.log(`\n[종합]\n  ${n.analystView}`);

  console.log(`\n=== 수치 검증 결과 ===`);
  const v = report.verification;
  console.log(`재생성 횟수: ${v.regenerated}`);
  if (v.passed) {
    console.log("✅ 서술 속 모든 수치가 계산값과 일치");
  } else {
    console.log(`⚠️ 검증 실패 문장 ${v.findings.length}건:`);
    for (const f of v.findings) {
      console.log(`  [${f.field}] "${f.sentence}" → ${f.unmatched.join(", ")}`);
    }
  }

  // 서술 필드 개수 점검(스키마는 3개를 기대)
  for (const [field, arr] of [
    ["summary", n.summary],
    ["strengths", n.strengths],
    ["risks", n.risks],
  ] as const) {
    if (arr.length !== 3) console.log(`⚠️ ${field} 개수가 3이 아님: ${arr.length}`);
  }

  console.log(`\n면책: ${report.disclaimer}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
