/**
 * 애널리스트 리포트 렌더러 — 세로 1열 카드 스크롤 (DEVELOPMENT_PLAN §4.1).
 *
 * 모든 수치는 백엔드 계산값(Report.valuation·data)에서 온다. 이 컴포넌트는 표시만 한다.
 * 색상 관례: 상승 빨강 / 하락 파랑.
 */
import type { Report } from "@/lib/report/types";
import type { FinancialSnapshot } from "@/lib/types";
import PrintButton from "./PrintButton";
import {
  won,
  price,
  pct,
  mult,
  multOrNA,
  signed,
  changeColor,
  opinionStyle,
  companyTypeLabel,
} from "@/lib/report/format";

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-2xl border border-black/10 bg-black/[0.015] p-4 dark:border-white/10 dark:bg-white/[0.02]">
      {title && <h2 className="mb-3 text-sm font-bold tracking-tight opacity-80">{title}</h2>}
      {children}
    </section>
  );
}

function HeaderCard({ report }: { report: Report }) {
  const { data, valuation: v } = report;
  const m = data.market;
  const badge = opinionStyle(v.opinion);
  return (
    <section className="break-inside-avoid rounded-2xl border border-black/10 p-5 dark:border-white/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{data.profile.name}</h1>
          <p className="text-xs opacity-60">
            {data.profile.stockCode} · {m.market}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums">{price(m.close)}</span>
        <span className={`text-sm font-semibold tabular-nums ${changeColor(m.change)}`}>
          {signed(m.change, "won")} ({signed(m.changePct, "pct")})
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
          <p className="text-xs opacity-60">목표주가 (기본)</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">
            {v.targetPrice ? price(v.targetPrice.base) : "미제시"}
          </p>
        </div>
        <div className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
          <p className="text-xs opacity-60">상승여력</p>
          <p className={`mt-0.5 text-lg font-bold tabular-nums ${changeColor(v.upsidePct)}`}>
            {v.upsidePct == null ? "-" : signed(v.upsidePct, "pct")}
          </p>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ points }: { points: string[] }) {
  return (
    <Card title="투자 요약">
      <ul className="space-y-2">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <span className="mt-0.5 font-bold opacity-40">{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Range52w({ low, close, high }: { low: number; close: number; high: number }) {
  const span = high - low;
  const posPct = span > 0 ? ((close - low) / span) * 100 : 50;
  const clamped = Math.min(100, Math.max(0, posPct));
  return (
    <Card title="52주 가격 범위">
      <div className="relative mt-1 h-2 rounded-full bg-gradient-to-r from-blue-500/40 to-red-500/40">
        <div
          className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: `${clamped}%` }}
          aria-label="현재가 위치"
        />
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums opacity-70">
        <span>{price(low)}</span>
        <span className="font-semibold opacity-100">현재 {price(close)}</span>
        <span>{price(high)}</span>
      </div>
    </Card>
  );
}

function yoy(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev <= 0) return null;
  return (cur - prev) / prev;
}

function EarningsTable({ financials }: { financials: FinancialSnapshot[] }) {
  return (
    <Card title="연간 실적">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm tabular-nums">
          <thead>
            <tr className="border-b border-black/10 text-xs opacity-60 dark:border-white/10">
              <th className="py-2 text-left font-medium">연도</th>
              <th className="py-2 font-medium">매출액</th>
              <th className="py-2 font-medium">영업이익</th>
              <th className="py-2 font-medium">순이익</th>
              <th className="py-2 font-medium">매출 YoY</th>
            </tr>
          </thead>
          <tbody>
            {financials.map((f, i) => {
              const g = yoy(f.revenue, financials[i + 1]?.revenue ?? null);
              return (
                <tr key={f.period} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 text-left font-semibold">{f.period}</td>
                  <td className="py-2">{won(f.revenue)}</td>
                  <td className="py-2">{won(f.operatingProfit)}</td>
                  <td className="py-2">{won(f.netIncome)}</td>
                  <td className={`py-2 ${changeColor(g)}`}>{g == null ? "-" : signed(g * 100, "pct")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs opacity-50">CFS=연결, OFS=별도 기준 · 단위 자동 환산(조/억)</p>
    </Card>
  );
}

function ValuationCard({ report }: { report: Report }) {
  const v = report.valuation;
  const m = report.valuation.metrics;
  return (
    <Card title="밸류에이션">
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        {(["conservative", "base", "optimistic"] as const).map((k) => (
          <div key={k} className="rounded-xl bg-black/[0.03] p-2 dark:bg-white/[0.04]">
            <p className="text-xs opacity-60">
              {k === "conservative" ? "보수" : k === "base" ? "기본" : "낙관"}
            </p>
            <p className="mt-0.5 font-bold tabular-nums">
              {v.targetPrice ? price(v.targetPrice[k]) : "-"}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1 text-sm tabular-nums">
        <span className="opacity-60">PER</span>
        <span className="opacity-60">PBR</span>
        <span className="opacity-60">ROE</span>
        <span>{multOrNA(m.per)}</span>
        <span>{mult(m.pbr)}</span>
        <span>{pct(m.roe, true)}</span>
      </div>

      <div className="mt-3 space-y-1.5 border-t border-black/10 pt-3 text-xs opacity-70 dark:border-white/10">
        <p className="font-semibold opacity-90">
          산출 방법론 ({companyTypeLabel(report.valuation.companyType)})
        </p>
        {v.methods.map((mth) => (
          <p key={mth.method}>· {mth.note}</p>
        ))}
        <p className="mt-2 font-semibold opacity-90">가정</p>
        {v.assumptions.map((a, i) => (
          <p key={i}>· {a}</p>
        ))}
      </div>
    </Card>
  );
}

function StrengthsRisks({ strengths, risks }: { strengths: string[]; risks: string[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Card title="강점">
        <ul className="space-y-2 text-sm leading-relaxed">
          {strengths.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-red-600 dark:text-red-400">▲</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="리스크">
        <ul className="space-y-2 text-sm leading-relaxed">
          {risks.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-blue-600 dark:text-blue-400">▼</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function VerificationNote({ report }: { report: Report }) {
  if (report.verification.passed) return null;
  return (
    <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
      ⚠️ 일부 서술의 수치가 계산값과 자동 대조되지 않아 검증에 실패했습니다({report.verification.findings.length}건).
      해당 문장은 신뢰도가 낮을 수 있습니다.
    </p>
  );
}

export default function ReportView({ report }: { report: Report }) {
  const n = report.narrative;
  const m = report.data.market;
  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-24 pt-4">
        <div className="no-print flex justify-end">
          <PrintButton />
        </div>
        <HeaderCard report={report} />
        <VerificationNote report={report} />
        <SummaryCard points={n.summary} />
        <Range52w low={m.low52w} close={m.close} high={m.high52w} />
        <EarningsTable financials={report.data.annualFinancials} />
        <Card title="사업 개요">
          <p className="text-sm leading-relaxed">{n.business}</p>
          <p className="mt-3 text-sm leading-relaxed">{n.earningsComment}</p>
        </Card>
        <ValuationCard report={report} />
        <Card title="밸류에이션 해설">
          <p className="text-sm leading-relaxed">{n.valuationComment}</p>
        </Card>
        <StrengthsRisks strengths={n.strengths} risks={n.risks} />
        <Card title="애널리스트 종합 의견">
          <p className="text-sm leading-relaxed">{n.analystView}</p>
        </Card>
        <p className="px-1 pt-1 text-[11px] leading-relaxed opacity-50">{report.disclaimer}</p>
      </main>

      {/* 하단 고정 바: 현재가·등락률 상시 표시 (§4.1) */}
      <div className="no-print fixed inset-x-0 bottom-0 border-t border-black/10 bg-background/95 backdrop-blur dark:border-white/10">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">{report.data.profile.name}</span>
          <span className={`text-sm font-bold tabular-nums ${changeColor(m.change)}`}>
            {price(m.close)} ({signed(m.changePct, "pct")})
          </span>
        </div>
      </div>
    </>
  );
}
