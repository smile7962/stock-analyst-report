/**
 * 분석 엔진 end-to-end 관찰 스크립트 — 대표 3종목의 목표주가·투자의견을 출력한다.
 *
 * 사용법: npx tsx scripts/verify-analysis.ts [6자리 종목코드 ...]
 *   기본값 005930 055550 035720. DART_API_KEY·KRX_OPENAPI_KEY 필요(.env.local).
 *   프록시 환경의 Node 22에서는 NODE_USE_ENV_PROXY=1 필요.
 *
 * ⚠️ KRX 시세 스냅샷은 콜드 캐시 시 종목당 수 분 소요된다(52주 밴드).
 *
 * 이 스크립트는 실동작 관찰용이다. 수치 정합성 회귀 검증은 lib/analysis/*.test.ts
 * (npm test)가 픽스처 손계산 대조로 담당한다.
 */
import { fetchCompanyReport } from "../lib/company";
import { analyze } from "../lib/analysis";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

function won(v: number | null): string {
  return v === null ? "N/A" : `${Math.round(v).toLocaleString("ko-KR")}원`;
}

async function main() {
  const codes = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["005930", "055550", "035720"];

  for (const code of codes) {
    const data = await fetchCompanyReport(code);
    const v = analyze(data);
    console.log(`\n${"=".repeat(64)}`);
    console.log(`${data.profile.name} (${code}) — 유형: ${v.companyType}`);
    console.log("=".repeat(64));
    console.log(`현재가: ${won(v.currentPrice)}  |  업종코드(DART): ${data.profile.indutyCode}`);
    console.log(
      `PER ${v.metrics.per?.toFixed(1) ?? "N/A"}배  PBR ${v.metrics.pbr?.toFixed(2) ?? "N/A"}배  ` +
        `ROE ${v.metrics.roe !== null ? (v.metrics.roe * 100).toFixed(1) + "%" : "N/A"}`,
    );
    if (v.targetPrice) {
      console.log(
        `목표주가 3밴드: 보수 ${won(v.targetPrice.conservative)} / ` +
          `기본 ${won(v.targetPrice.base)} / 낙관 ${won(v.targetPrice.optimistic)}`,
      );
      console.log(`상승여력(기본): ${v.upsidePct!.toFixed(1)}%  →  투자의견: ${v.opinion}`);
    } else {
      console.log(`목표주가: 미제시  →  투자의견: ${v.opinion}`);
    }
    console.log("방법론:");
    for (const m of v.methods) {
      const band = m.band
        ? `${won(m.band.conservative)}~${won(m.band.optimistic)} (기본 ${won(m.band.base)})`
        : "밴드 없음";
      console.log(`  - ${m.method} (가중 ${m.weight}): ${band}`);
      console.log(`      ${m.note}`);
    }
    console.log("가정:");
    for (const a of v.assumptions) console.log(`  · ${a}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
