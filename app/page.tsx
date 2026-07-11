/**
 * 홈 — 종목코드 입력 후 리포트 화면으로 이동.
 *
 * 이름 자동완성은 Phase 5 확장 과제. MVP는 6자리 종목코드 입력 + 대표 종목 바로가기.
 */
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  { code: "005930", name: "삼성전자" },
  { code: "055550", name: "신한지주" },
  { code: "035720", name: "카카오" },
];

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = /^\d{6}$/.test(code);

  function go(target: string) {
    if (/^\d{6}$/.test(target)) router.push(`/report/${target}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">주식 애널리스트 리포트</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed opacity-70">
          6자리 종목코드를 입력하면 DART 공시와 KRX 시세를 기반으로 리포트를 생성합니다.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(code);
        }}
        className="flex w-full gap-2"
      >
        <input
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="예: 005930"
          className="flex-1 rounded-xl border border-black/15 bg-transparent px-4 py-3 text-base tabular-nums outline-none focus:border-foreground dark:border-white/15"
          aria-label="종목코드"
        />
        <button
          type="submit"
          disabled={!valid}
          className="rounded-xl bg-foreground px-5 py-3 text-base font-semibold text-background disabled:opacity-40"
        >
          조회
        </button>
      </form>

      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((e) => (
          <button
            key={e.code}
            onClick={() => go(e.code)}
            className="rounded-full border border-black/15 px-3 py-1.5 text-sm dark:border-white/15"
          >
            {e.name}
          </button>
        ))}
      </div>

      <p className="max-w-xs text-center text-[11px] leading-relaxed opacity-50">
        본 리포트는 공시 데이터 기반 자동 생성 참고자료이며, 투자 권유가 아닙니다. 투자 판단의
        책임은 이용자 본인에게 있습니다.
      </p>
    </main>
  );
}
