/**
 * DART 데이터 레이어 실응답 검증 스크립트 (Phase 1 완료 기준의 일부).
 *
 * 사용법: DART_API_KEY=<키> npx tsx scripts/verify-dart.ts [6자리 종목코드]
 *   기본값 005930(삼성전자). 검증 대상: 005930(일반), 055550(금융), 035720(성장주)
 *
 * 사전 조건: npm run master 로 data/stock-master.json 생성 (corp_code 조회용)
 *
 * 검증 항목:
 *  1. 기업개황이 정상 조회되는가
 *  2. 최근 연간(사업보고서) 재무제표가 정규화되어 핵심 계정이 채워지는가
 *  3. 매핑 실패(null) 계정이 있으면 그대로 드러내는가
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchCompanyRaw, fetchFinancialRaw, REPRT_CODE } from "../lib/dart";
import { normalizeFinancials } from "../lib/normalize";
import type { StockMasterEntry } from "./build-stock-master";

function resolveTarget(stockCode: string): StockMasterEntry {
  const masterPath = join(process.cwd(), "data", "stock-master.json");
  let entries: StockMasterEntry[];
  try {
    entries = JSON.parse(readFileSync(masterPath, "utf8")).entries;
  } catch {
    throw new Error(`${masterPath} 이 없습니다. 먼저 npm run master 를 실행하세요`);
  }
  const hit = entries.find((e) => e.stockCode === stockCode);
  if (!hit) throw new Error(`종목 마스터에 ${stockCode} 가 없습니다`);
  return hit;
}

async function main() {
  const stockCode = process.argv[2] ?? "005930";
  if (!/^\d{6}$/.test(stockCode)) {
    console.error("6자리 종목코드를 입력하세요 (예: 005930)");
    process.exit(1);
  }
  const target = resolveTarget(stockCode);

  console.log(`=== 기업개황: ${target.name} (${target.stockCode} / ${target.corpCode}) ===`);
  const company = await fetchCompanyRaw(target.corpCode);
  console.log({
    corp_name: company.corp_name,
    stock_code: company.stock_code,
    ceo_nm: company.ceo_nm,
    induty_code: company.induty_code,
  });

  // 직전 연도 사업보고서부터 시도 (미제출이면 전전년도)
  const now = new Date();
  for (const year of [now.getFullYear() - 1, now.getFullYear() - 2]) {
    console.log(`\n=== 재무제표(연결) ${year} 사업보고서 ===`);
    const fin = await fetchFinancialRaw(
      target.corpCode,
      String(year),
      REPRT_CODE.annual,
      "CFS",
    );
    if (!fin.list?.length) {
      console.log(`데이터 없음 (status=${fin.status}) — 다음 연도로 폴백`);
      continue;
    }
    console.log(`계정 행 수: ${fin.list.length}`);
    const snapshot = normalizeFinancials(fin.list, String(year), "CFS");
    console.log(snapshot);
    const missing = Object.entries(snapshot).filter(([, v]) => v === null);
    if (missing.length) {
      console.log(`⚠️ 매핑 실패 계정: ${missing.map(([k]) => k).join(", ")}`);
      // 원인 파악용: 해당 재무제표의 계정 목록 일부 출력
      for (const sj of ["IS", "CIS", "CF"]) {
        const names = fin.list
          .filter((r) => r.sj_div === sj)
          .slice(0, 8)
          .map((r) => `${r.account_id} | ${r.account_nm}`);
        if (names.length) console.log(`  [${sj}]\n   ${names.join("\n   ")}`);
      }
    } else {
      console.log("✅ 핵심 계정 전체 매핑 성공");
    }
    break;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
