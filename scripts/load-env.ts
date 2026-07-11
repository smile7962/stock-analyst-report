/**
 * Next.js 밖(tsx 스크립트)에서도 .env.local 의 키를 쓰기 위한 최소 로더.
 * 이미 설정된 환경변수는 덮어쓰지 않는다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadEnvLocal(): void {
  let text: string;
  try {
    text = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return; // 파일이 없으면 조용히 통과 — 키 누락은 사용처에서 검사한다
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
