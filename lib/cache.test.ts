import { test } from "node:test";
import assert from "node:assert/strict";
import { cached, TTL } from "./cache";

test("같은 키는 fn을 한 번만 실행하고 캐시값을 재사용한다", async () => {
  let calls = 0;
  const key = `t:${Math.random()}`;
  const fn = async () => ++calls;
  assert.equal(await cached(key, TTL.daily, fn), 1);
  assert.equal(await cached(key, TTL.daily, fn), 1);
  assert.equal(calls, 1);
});

test("다른 키는 각각 실행된다", async () => {
  let calls = 0;
  const fn = async () => ++calls;
  const r = Math.random();
  await cached(`a:${r}`, TTL.daily, fn);
  await cached(`b:${r}`, TTL.daily, fn);
  assert.equal(calls, 2);
});

test("만료된 항목은 다시 실행된다", async () => {
  let calls = 0;
  const key = `exp:${Math.random()}`;
  const fn = async () => ++calls;
  await cached(key, -1, fn); // 즉시 만료
  await cached(key, -1, fn);
  assert.equal(calls, 2);
});

test("TTL 차등 상수: 재무 > 시세", () => {
  assert.ok(TTL.financials > TTL.daily);
});
