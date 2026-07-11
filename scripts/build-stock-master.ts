/**
 * DART corpCode.xml을 내려받아 상장 종목 마스터(data/stock-master.json)를 생성한다.
 *
 * 사용법: DART_API_KEY=<키> npm run master
 * 갱신 주기: 월 1회 권장 (신규 상장/상장폐지 반영)
 *
 * 응답 확인 근거: OpenDART 공식 문서 "고유번호" API — ZIP 안의 CORPCODE.xml이
 * <result><list><corp_code/><corp_name/><stock_code/><modify_date/></list>...</result>
 * 구조를 가지며, 비상장사는 stock_code가 공백이다. 인증키 오류 시 ZIP 대신
 * <result><status/><message/></result> XML이 그대로 온다.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

export interface StockMasterEntry {
  /** 6자리 종목코드 (예: 005930) */
  stockCode: string;
  /** DART 고유번호 8자리 */
  corpCode: string;
  /** 회사명 */
  name: string;
}

const CORP_CODE_URL = "https://opendart.fss.or.kr/api/corpCode.xml";

async function main() {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    console.error(
      "DART_API_KEY 환경변수가 필요합니다. https://opendart.fss.or.kr 에서 발급 후\n" +
        "  DART_API_KEY=<키> npm run master\n" +
        "형태로 실행하세요.",
    );
    process.exit(1);
  }

  console.log("corpCode.xml 다운로드 중...");
  const res = await fetch(`${CORP_CODE_URL}?crtfc_key=${apiKey}`);
  if (!res.ok) {
    throw new Error(`다운로드 실패: HTTP ${res.status}`);
  }
  const body = new Uint8Array(await res.arrayBuffer());

  // 정상 응답은 ZIP(매직바이트 "PK"), 키 오류 등은 XML 에러 메시지가 그대로 온다
  if (!(body[0] === 0x50 && body[1] === 0x4b)) {
    const errText = strFromU8(body.slice(0, 500));
    throw new Error(`ZIP이 아닌 응답 수신 (키 오류 가능성): ${errText}`);
  }

  const files = unzipSync(body);
  const xmlName = Object.keys(files).find((n) => n.toLowerCase().endsWith(".xml"));
  if (!xmlName) throw new Error("ZIP 안에 XML 파일이 없습니다");
  const xml = strFromU8(files[xmlName]);

  const parser = new XMLParser({ ignoreAttributes: true });
  const parsed = parser.parse(xml);
  const list: Record<string, unknown>[] = parsed?.result?.list;
  if (!Array.isArray(list)) {
    throw new Error("XML 구조가 예상과 다릅니다: result.list 배열이 없음");
  }

  const entries: StockMasterEntry[] = [];
  for (const row of list) {
    const stockCode = String(row.stock_code ?? "").trim();
    const corpCode = String(row.corp_code ?? "").padStart(8, "0");
    const name = String(row.corp_name ?? "").trim();
    if (/^\d{6}$/.test(stockCode) && name) {
      entries.push({ stockCode, corpCode, name });
    }
  }

  if (entries.length < 1000) {
    // 국내 상장사는 약 2,600개 이상 — 그보다 훨씬 적으면 파싱/응답 이상
    throw new Error(`상장 종목이 ${entries.length}건뿐입니다. 응답을 확인하세요`);
  }

  entries.sort((a, b) => a.stockCode.localeCompare(b.stockCode));

  const outDir = join(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "stock-master.json");
  writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 1),
  );
  console.log(`완료: ${outPath} (상장 종목 ${entries.length}건)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
