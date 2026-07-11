/**
 * 종목 마스터(data/stock-master.json) 로더 — 종목코드 → DART 고유번호(corp_code) 해석.
 *
 * 마스터는 scripts/build-stock-master.ts(`npm run master`)가 월 단위로 재생성한다.
 * ⚠️ data/ 는 .gitignore 대상이라 배포 환경(Vercel)에서는 빌드 단계에 재생성이 필요하다
 *   (Phase 6 배포 과제). 로컬 dev/검증에서는 디스크에서 그대로 읽는다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface StockMasterEntry {
  /** 6자리 종목코드 (예: 005930) */
  stockCode: string;
  /** DART 고유번호 8자리 */
  corpCode: string;
  /** 회사명 */
  name: string;
}

/** 마스터에 없는 종목(상장폐지·비상장·마스터 미갱신) — 라우트에서 404로 매핑한다 */
export class StockNotFoundError extends Error {
  constructor(stockCode: string) {
    super(
      `종목 마스터에 ${stockCode} 가 없습니다 ` +
        `(상장폐지·비상장이거나 npm run master 갱신이 필요합니다)`,
    );
    this.name = "StockNotFoundError";
  }
}

let index: Map<string, StockMasterEntry> | null = null;

function loadIndex(): Map<string, StockMasterEntry> {
  if (index) return index;
  const path = join(process.cwd(), "data", "stock-master.json");
  let entries: StockMasterEntry[];
  try {
    entries = JSON.parse(readFileSync(path, "utf8")).entries as StockMasterEntry[];
  } catch {
    throw new Error(`${path} 을 읽지 못했습니다. 먼저 npm run master 를 실행하세요`);
  }
  index = new Map(entries.map((e) => [e.stockCode, e]));
  return index;
}

export function resolveStockEntry(stockCode: string): StockMasterEntry {
  const hit = loadIndex().get(stockCode);
  if (!hit) throw new StockNotFoundError(stockCode);
  return hit;
}
