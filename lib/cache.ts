/**
 * 인메모리 TTL 캐시 (Phase 1 최소 구현).
 *
 * 계획서 §3의 원칙: 시세(일)와 재무(분기)는 수명이 다르므로 반드시 조각별로
 * 다른 TTL을 적용한다. 하나로 묶으면 "어제 주가로 상승여력이 계산되는" 버그가 난다.
 *
 * ⚠️ 서버리스(Vercel)에서는 인스턴스별·휘발성이라 콜드스타트 시 비어 있다.
 *   운영(Phase 6)에서 Upstash Redis 등 공유 캐시로 교체한다 — 이 모듈만 바꾸면 된다.
 */

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

/** TTL(ms) 상수 — 데이터 수명에 맞춘 차등 값 */
export const TTL = {
  /** 재무제표·기업개황: 분기 단위 갱신 */
  financials: 90 * 24 * 60 * 60 * 1000,
  /** 시세·공시: 일 단위 갱신 */
  daily: 24 * 60 * 60 * 1000,
} as const;

/** key가 유효하면 캐시값을, 아니면 fn()을 실행해 채운 뒤 반환한다 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await fn();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
