/**
 * 리포트 화면 — /report/[code].
 *
 * 생성에 시간이 걸리므로(§4.1 로딩 UX) 단계별 진행 표시를 두고, 완료되면 ReportView 를 렌더한다.
 * 데이터·계산·서술은 모두 /api/report/[code] 가 담당한다(클라이언트는 표시만).
 */
"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import ReportView from "@/components/report/ReportView";
import type { Report } from "@/lib/report/types";

const STAGES = ["재무·시세 수집 중", "밸류에이션 계산 중", "리포트 작성 중"];

export default function ReportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // 단일 fetch 이지만, 진행감을 위해 안내 문구를 순차 노출한다
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 8000);

    fetch(`/api/report/${code}`)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(body.error ?? "리포트 생성에 실패했습니다");
        else setReport(body as Report);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "네트워크 오류"))
      .finally(() => clearInterval(timer));

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code]);

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm opacity-70">{error}</p>
        <Link href="/" className="rounded-full border border-black/15 px-4 py-2 text-sm dark:border-white/15">
          다른 종목 조회
        </Link>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/20 border-t-foreground dark:border-white/20" />
        <div>
          <p className="text-sm font-semibold">{code} 리포트 생성 중</p>
          <p className="mt-1 text-xs opacity-60">{STAGES[stage]}…</p>
        </div>
        <ol className="flex gap-1.5">
          {STAGES.map((_, i) => (
            <li
              key={i}
              className={`h-1.5 w-6 rounded-full ${i <= stage ? "bg-foreground" : "bg-black/15 dark:bg-white/15"}`}
            />
          ))}
        </ol>
      </main>
    );
  }

  return <ReportView report={report} />;
}
