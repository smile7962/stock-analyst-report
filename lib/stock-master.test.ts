import { test } from "node:test";
import assert from "node:assert/strict";
import { rankStockMatches, type StockMasterEntry } from "./stock-master";

const E = (stockCode: string, name: string): StockMasterEntry => ({
  stockCode,
  corpCode: "0",
  name,
});

const entries: StockMasterEntry[] = [
  E("005930", "삼성전자(주)"),
  E("009150", "삼성전기(주)"),
  E("006400", "삼성SDI(주)"),
  E("028260", "삼성물산(주)"),
  E("055550", "신한지주"),
  E("035720", "카카오"),
  E("035420", "NAVER"),
];

const codes = (q: string) => rankStockMatches(entries, q).map((m) => m.stockCode);

test("빈 질의는 빈 결과", () => {
  assert.deepEqual(rankStockMatches(entries, "  "), []);
});

test("부분 일치로 이름 검색 (삼성 → 삼성 계열 전부)", () => {
  const r = codes("삼성");
  assert.ok(r.includes("005930"));
  assert.ok(r.includes("009150"));
  assert.ok(r.includes("006400"));
  assert.ok(r.includes("028260"));
  assert.ok(!r.includes("055550"));
});

test("접두 일치가 부분 일치보다 우선", () => {
  // '지주'는 신한'지주' 부분 일치, '신한'은 접두 → 신한이 먼저
  assert.equal(codes("신한")[0], "055550");
});

test("정확 일치가 최상위", () => {
  assert.equal(codes("카카오")[0], "035720");
});

test("영문 티커 대소문자 무시", () => {
  assert.equal(codes("naver")[0], "035420");
});

test("숫자 질의는 코드 접두로 매칭", () => {
  assert.deepEqual(codes("0059"), ["005930"]);
  assert.equal(codes("00")[0].startsWith("00"), true);
});

test("limit 적용", () => {
  assert.equal(rankStockMatches(entries, "삼성", 2).length, 2);
});
