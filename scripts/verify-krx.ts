/**
 * KRX 공식 Open API 시세 클라이언트 실응답 검증 스크립트.
 *
 * 사용법: npx tsx scripts/verify-krx.ts [6자리 종목코드 ...]
 *   기본값: 005930(삼성전자·일반) 055550(신한지주·금융) 035720(카카오·성장주)
 *   KRX_OPENAPI_KEY 필요 (.env.local). 프록시 환경의 Node 22에서는 NODE_USE_ENV_PROXY=1 필요.
 *
 * API가 (기준일자 × 시장 전체) 단위라 52주 구간을 일자별로 호출한다 — 종목당 최초 수 분
 * 소요되며, 같은 시장의 후속 종목은 인스턴스 캐시로 즉시 처리된다.
 *
 * 검증 항목 (종목별):
 *  1. 종목코드 → 소속 시장·최신 거래일 해석이 되는가
 *  2. 스냅샷(현재가·전일대비·시총·상장주식수·52주 밴드)이 채워지는가
 *  3. 코드가 계산한 등락률(changePct)이 API의 FLUC_RT와 일치하는가 (±0.01%p)
 *  4. 일별 시세가 날짜 오름차순 OHLCV로 정규화되고, high ≥ max(open,close) ≥ min(open,close) ≥ low 인가
 */
import { KrxOpenApiClient } from "../lib/krx";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

/**
 * 클라이언트를 거치지 않는 독립 호출로 해당 종목의 원본 행을 가져온다.
 * (계산 로직 자체를 그 로직으로 검증하지 않기 위한 교차검증용)
 */
async function fetchRawRow(
  market: string,
  basDd: string,
  stockCode: string,
): Promise<Record<string, string> | null> {
  const api = { KOSPI: "stk_bydd_trd", KOSDAQ: "ksq_bydd_trd", KONEX: "knx_bydd_trd" }[market];
  if (!api) return null;
  const res = await fetch(`https://data-dbg.krx.co.kr/svc/apis/sto/${api}?basDd=${basDd}`, {
    headers: { AUTH_KEY: process.env.KRX_OPENAPI_KEY ?? "" },
  });
  if (!res.ok) return null;
  const rows = ((await res.json()) as { OutBlock_1?: Record<string, string>[] }).OutBlock_1;
  return rows?.find((r) => r.ISU_CD === stockCode) ?? null;
}

async function verifyOne(client: KrxOpenApiClient, stockCode: string): Promise<boolean> {
  console.log(`\n${"=".repeat(60)}\n검증 대상: ${stockCode}\n${"=".repeat(60)}`);
  let ok = true;

  const snapshot = await client.fetchSnapshot(stockCode);
  console.log(snapshot);

  const missing = Object.entries(snapshot).filter(([, v]) => v === null);
  if (missing.length) {
    console.log(
      `⚠️ 미확보 필드: ${missing.map(([k]) => k).join(", ")} ` +
        `(sector 는 공식 Open API 미제공 — lib/krx.ts 상단 주석 참고)`,
    );
  }

  const raw = await fetchRawRow(snapshot.market, snapshot.date, stockCode);
  if (raw) {
    const flucRt = Number(raw.FLUC_RT);
    const pctMatch = Math.abs(snapshot.changePct - flucRt) <= 0.01;
    console.log(
      pctMatch
        ? `✅ 등락률 교차검증: 계산 ${snapshot.changePct.toFixed(2)}% = API FLUC_RT ${flucRt}%`
        : `❌ 등락률 불일치: 계산 ${snapshot.changePct}% vs API FLUC_RT ${flucRt}%`,
    );
    ok &&= pctMatch;
  } else {
    console.log("⚠️ FLUC_RT 교차검증용 원본 행 조회 실패 — 건너뜀");
  }

  const end = snapshot.date;
  const start = String(Number(end.slice(0, 4)) - 1) + end.slice(4);
  const prices = await client.fetchDailyPrices(stockCode, start, end);
  console.log(`1년 거래일 수: ${prices.length}`);
  console.table(prices.slice(-5));

  if (prices.length < 200) {
    console.log(`❌ 1년 거래일 수가 비정상적으로 적습니다: ${prices.length}`);
    ok = false;
  }

  const sorted = prices.every((p, i) => i === 0 || prices[i - 1].date < p.date);
  console.log(sorted ? "✅ 날짜 오름차순 정렬 확인" : "❌ 날짜 정렬 이상");
  ok &&= sorted;

  const ohlcSane = prices.every(
    (p) => p.high >= Math.max(p.open, p.close) && p.low <= Math.min(p.open, p.close),
  );
  console.log(ohlcSane ? "✅ OHLC 정합성(high/low 범위) 확인" : "❌ OHLC 정합성 이상");
  ok &&= ohlcSane;

  const latest = prices[prices.length - 1];
  const closeMatch = latest.date === snapshot.date && latest.close === snapshot.close;
  console.log(
    closeMatch
      ? "✅ 스냅샷 종가 = 일별 시세 최종일 종가"
      : `❌ 스냅샷(${snapshot.date}/${snapshot.close}) ≠ 일별 최종(${latest.date}/${latest.close})`,
  );
  ok &&= closeMatch;

  const bandSane = snapshot.low52w <= snapshot.close && snapshot.close <= snapshot.high52w;
  console.log(
    bandSane
      ? `✅ 52주 밴드 [${snapshot.low52w} ~ ${snapshot.high52w}] 안에 현재가 위치`
      : `❌ 52주 밴드 이상: close=${snapshot.close}, band=[${snapshot.low52w}, ${snapshot.high52w}]`,
  );
  ok &&= bandSane;

  return ok;
}

async function main() {
  const codes = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["005930", "055550", "035720"];
  for (const c of codes) {
    if (!/^\d{6}$/.test(c)) {
      console.error(`6자리 종목코드가 아닙니다: ${c}`);
      process.exit(1);
    }
  }

  const client = new KrxOpenApiClient();
  const failed: string[] = [];
  for (const code of codes) {
    if (!(await verifyOne(client, code))) failed.push(code);
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
