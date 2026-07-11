/**
 * KRX 시세 클라이언트 실응답 검증 스크립트 (Phase 1 완료 기준의 일부).
 *
 * 사용법: npx tsx scripts/verify-krx.ts [6자리 종목코드]
 *   기본값 005930(삼성전자). API 키 불필요.
 *
 * ⚠️ KRX는 클라우드 IP의 JSON 요청을 "LOGOUT" 응답으로 차단한다(2026-07 확인).
 *   차단되면 KrxBlockedError 메시지가 그대로 출력된다 — 로컬(허용된) 네트워크에서 실행할 것.
 *   프록시 환경의 Node 22에서는 NODE_USE_ENV_PROXY=1 이 필요할 수 있다.
 *
 * 검증 항목:
 *  1. 종목코드 → ISIN·시장구분 해석이 되는가
 *  2. 스냅샷(현재가·전일대비·시총·상장주식수·52주 밴드·업종)이 채워지는가
 *  3. 일별 시세가 날짜 오름차순 OHLCV로 정규화되는가
 */
import { KrxMarketClient } from "../lib/krx";

async function main() {
  const stockCode = process.argv[2] ?? "005930";
  if (!/^\d{6}$/.test(stockCode)) {
    console.error("6자리 종목코드를 입력하세요 (예: 005930)");
    process.exit(1);
  }
  const client = new KrxMarketClient();

  console.log(`=== 시세 스냅샷: ${stockCode} ===`);
  const snapshot = await client.fetchSnapshot(stockCode);
  console.log(snapshot);

  const missing = Object.entries(snapshot).filter(([, v]) => v === null);
  if (missing.length) {
    console.log(`⚠️ 미확보 필드: ${missing.map(([k]) => k).join(", ")}`);
  }

  console.log(`\n=== 최근 일별 시세 (마지막 5거래일) ===`);
  const end = snapshot.date;
  const start = String(Number(end.slice(0, 4)) - 1) + end.slice(4);
  const prices = await client.fetchDailyPrices(stockCode, start, end);
  console.log(`1년 거래일 수: ${prices.length}`);
  console.table(prices.slice(-5));

  const sorted = prices.every((p, i) => i === 0 || prices[i - 1].date < p.date);
  console.log(sorted ? "✅ 날짜 오름차순 정렬 확인" : "❌ 날짜 정렬 이상");
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
