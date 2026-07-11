/**
 * 홈 — 종목명/코드로 검색해 리포트 화면으로 이동.
 *
 * 사용자는 6자리 코드보다 이름으로 종목을 떠올리므로 자동완성을 제공한다(§4.2).
 * 검색은 /api/search (마스터 로컬 조회)로 처리한다.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Match {
  stockCode: string;
  name: string;
}

const EXAMPLES = [
  { code: "005930", name: "삼성전자" },
  { code: "055550", name: "신한지주" },
  { code: "035720", name: "카카오" },
];

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // 디바운스 검색
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) return; // 빈 질의는 조회하지 않음 — 드롭다운은 렌더 가드로 숨긴다
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const body = await res.json();
        setResults(body.results ?? []);
        setActive(0);
      } catch {
        setResults([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function go(code: string) {
    if (/^\d{6}$/.test(code)) router.push(`/report/${code}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (results.length) go(results[active]?.stockCode ?? results[0].stockCode);
    else if (/^\d{6}$/.test(query.trim())) go(query.trim());
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">주식 애널리스트 리포트</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed opacity-70">
          종목명이나 6자리 코드를 입력하면 DART 공시와 KRX 시세를 기반으로 리포트를 생성합니다.
        </p>
      </div>

      <div ref={boxRef} className="relative w-full">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="예: 삼성전자 또는 005930"
            className="flex-1 rounded-xl border border-black/15 bg-transparent px-4 py-3 text-base outline-none focus:border-foreground dark:border-white/15"
            aria-label="종목명 또는 코드"
            autoComplete="off"
          />
          <button
            type="submit"
            className="rounded-xl bg-foreground px-5 py-3 text-base font-semibold text-background"
          >
            조회
          </button>
        </form>

        {open && query.trim().length > 0 && results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-black/10 bg-background shadow-lg dark:border-white/10">
            {results.map((r, i) => (
              <li key={r.stockCode}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.stockCode)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${
                    i === active ? "bg-black/[0.05] dark:bg-white/[0.06]" : ""
                  }`}
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="tabular-nums text-xs opacity-50">{r.stockCode}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
