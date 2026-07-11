/**
 * 종목 원자재 데이터 병합(lib/company.ts) end-to-end 검증 — Phase 1 완료 기준.
 *
 * 사용법: npx tsx scripts/verify-company.ts [6자리 종목코드 ...]
 *   기본값 005930(삼성전자). DART_API_KEY·KRX_OPENAPI_KEY 필요(.env.local).
 *   프록시 환경의 Node 22에서는 NODE_USE_ENV_PROXY=1 필요.
 *
 * 사전 조건: npm run master 로 data/stock-master.json 생성.
 *
 * ⚠️ KRX 시세 스냅샷은 52주 밴드 산출로 콜드 캐시 시 종목당 수 분 소요된다.
 *   그래서 기본값은 1종목이다. 여러 종목을 넘기려면 인자로 코드를 나열하라.
 *
 * 검증 항목:
 *  1. 기업개황(profile)의 필수 필드가 채워지는가
 *  2. 연간 재무가 최신 연도 우선으로 1개 이상 수집되고 매출/자본이 채워지는가
 *  3. 시세 스냅샷의 현재가·시총이 양수인가
 *  4. 병합 JSON이 CompanyReportData 형태로 완성되는가
 */
import { fetchCompanyReport } from "../lib/company";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

async function verifyOne(stockCode: string): Promise<boolean> {
  console.log(`\n${"=".repeat(60)}\n종목 원자재 병합 검증: ${stockCode}\n${"=".repeat(60)}`);
  const data = await fetchCompanyReport(stockCode);
  let ok = true;

  console.log("[profile]", data.profile);
  const p = data.profile;
  const profileOk = Boolean(p.name && p.ceo && p.indutyCode);
  console.log(profileOk ? "✅ 기업개황 필수 필드 확보" : "❌ 기업개황 필드 누락");
  ok &&= profileOk;

  console.log(`\n[annualFinancials] ${data.annualFinancials.length}개 연도`);
  console.table(data.annualFinancials);
  const finOk =
    data.annualFinancials.length >= 1 &&
    data.annualFinancials[0].revenue !== null &&
    data.annualFinancials[0].totalEquity !== null;
  console.log(
    finOk
      ? "✅ 최신 연도 재무에 매출·자본총계 존재"
      : "❌ 최신 연도 재무의 핵심 계정 누락(금융업이면 매핑 확장 필요 — Phase 5)",
  );
  ok &&= finOk;

  const yearsDesc = data.annualFinancials.every(
    (f, i) => i === 0 || data.annualFinancials[i - 1].period > f.period,
  );
  console.log(yearsDesc ? "✅ 최신 연도 우선 정렬" : "❌ 연도 정렬 이상");
  ok &&= yearsDesc;

  console.log(`\n[market]`, data.market);
  const marketOk = data.market.close > 0 && data.market.marketCap > 0;
  console.log(marketOk ? "✅ 시세 현재가·시총 양수" : "❌ 시세 이상");
  ok &&= marketOk;

  console.log(`\n[disclosures] 최근 ${data.disclosures.length}건`);
  console.table(data.disclosures.slice(0, 5));

  console.log(`\n[fetchedAt] ${data.fetchedAt}`);
  return ok;
}

async function main() {
  const codes = process.argv.slice(2).length ? process.argv.slice(2) : ["005930"];
  for (const c of codes) {
    if (!/^\d{6}$/.test(c)) {
      console.error(`6자리 종목코드가 아닙니다: ${c}`);
      process.exit(1);
    }
  }

  const failed: string[] = [];
  for (const code of codes) {
    if (!(await verifyOne(code))) failed.push(code);
  }

  console.log(`\n${"=".repeat(60)}`);
  if (failed.length) {
    console.error(`❌ 검증 실패 종목: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`✅ 전체 통과: ${codes.join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
