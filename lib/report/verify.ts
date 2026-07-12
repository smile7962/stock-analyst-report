/**
 * 프로그램적 수치 검증기 (DEVELOPMENT_PLAN §6.4).
 *
 * LLM 서술에서 재무 수치 표현을 추출해, 백엔드가 계산한 값과 코드로 대조한다.
 * 프롬프트 제약만으로는 수치 창작을 막지 못하므로(§6.4), 여기서 한 번 더 검증한다.
 *
 * 설계(CLAUDE.md 규칙 2 — 최소 구현):
 *  - 재무 단위(원·조·억·%·배)가 붙은 토큰만 추출한다. 연도(2025)·개수(3년)·주(52주) 등
 *    단위 없는 정수는 검증 대상이 아니다(오탐 방지).
 *  - 토큰을 종류(money/percent/multiple)로 나눠 같은 종류의 허용값하고만 대조한다.
 *  - 반올림·부호를 감안해 절댓값 + 허용오차로 비교한다.
 *  - 허용값에 없는 수치가 있으면 그 문장을 finding으로 보고한다(재생성/섹션 플래그용).
 */
import type { CompanyReportData } from "../types";
import type { ValuationResult } from "../analysis/types";
import { growthScenarios, REQUIRED_RETURN } from "../analysis/valuation";
import type { ReportNarrative, VerificationFinding } from "./types";

type Kind = "money" | "percent" | "multiple";
interface AllowedNumbers {
  money: number[];
  percent: number[];
  multiple: number[];
}

const abs = Math.abs;

/** 백엔드 계산값에서 서술이 인용해도 되는 수치 집합을 만든다 (절댓값으로 저장) */
export function buildAllowedNumbers(
  data: CompanyReportData,
  v: ValuationResult,
): AllowedNumbers {
  const money = new Set<number>();
  const percent = new Set<number>();
  const multiple = new Set<number>();
  const addMoney = (n: number | null) => n != null && money.add(abs(n));
  const addPct = (r: number | null, isRatio = true) =>
    r != null && percent.add(abs(isRatio ? r * 100 : r));
  const addMult = (n: number | null) => n != null && multiple.add(abs(n));

  // 시세
  const m = data.market;
  [m.close, m.change, m.marketCap, m.listedShares, m.high52w, m.low52w].forEach(addMoney);
  addPct(m.changePct, false); // changePct 는 이미 % 단위

  // 재무(연도별)
  for (const f of data.annualFinancials) {
    [
      f.revenue,
      f.operatingProfit,
      f.netIncome,
      f.totalAssets,
      f.totalLiabilities,
      f.totalEquity,
      f.operatingCashFlow,
    ].forEach(addMoney);
  }

  // 지표
  const met = v.metrics;
  addMoney(met.eps);
  addMoney(met.bps);
  addMult(met.per);
  addMult(met.pbr);
  [met.roe, met.roa, met.opMargin, met.netMargin, met.debtRatio, met.equityRatio].forEach((r) =>
    addPct(r),
  );
  [met.revenueGrowth, met.opGrowth, met.niGrowth, met.revenueCagr, met.niCagr].forEach((r) =>
    addPct(r),
  );

  // 제공된 연도 간 파생 성장률(YoY): 다년치 실적을 주므로 LLM이 연도별 YoY를 인용할 수 있다.
  // 창작이 아니라 데이터에서 유도되는 값이므로 허용값에 포함한다.
  const fins = data.annualFinancials;
  for (let i = 0; i + 1 < fins.length; i++) {
    for (const k of ["revenue", "operatingProfit", "netIncome"] as const) {
      const cur = fins[i][k];
      const prev = fins[i + 1][k];
      if (cur != null && prev != null && prev > 0) percent.add(abs(((cur - prev) / prev) * 100));
    }
  }

  // 밸류에이션 산출값
  addPct(v.upsidePct, false);
  if (v.targetPrice) {
    [v.targetPrice.conservative, v.targetPrice.base, v.targetPrice.optimistic].forEach(addMoney);
  }
  for (const method of v.methods) {
    if (method.band) {
      [method.band.conservative, method.band.base, method.band.optimistic].forEach(addMoney);
    }
  }

  // 공개 가정(리포트에 표기되는 상수): 요구수익률 r, 성장 시나리오 g, 투자의견 임계 ±15%
  addPct(REQUIRED_RETURN);
  const g = growthScenarios(met);
  [g.conservative, g.base, g.optimistic].forEach((x) => addPct(x));
  percent.add(15);

  return {
    money: [...money],
    percent: [...percent],
    multiple: [...multiple],
  };
}

function matches(value: number, allowed: number[], kind: Kind): boolean {
  const v = abs(value);
  return allowed.some((a) => {
    if (kind === "money") return abs(v - a) <= Math.max(a * 0.03, 1);
    if (kind === "percent") return abs(v - a) <= Math.max(0.6, a * 0.03);
    return abs(v - a) <= Math.max(0.35, a * 0.05); // multiple
  });
}

/** "1,234.5" → 1234.5 */
function parseNum(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/** 한 문장에서 (값, 종류) 재무 토큰을 추출한다 */
function extractTokens(sentence: string): { raw: string; value: number; kind: Kind }[] {
  const out: { raw: string; value: number; kind: Kind }[] = [];
  const push = (raw: string, value: number, kind: Kind) => {
    if (Number.isFinite(value)) out.push({ raw, value, kind });
  };
  const num = "([0-9][0-9,]*(?:\\.[0-9]+)?)";

  // 조/억 단위 금액
  for (const mch of sentence.matchAll(new RegExp(`${num}\\s*(조|억)\\s*원?`, "g"))) {
    const scale = mch[2] === "조" ? 1e12 : 1e8;
    push(mch[0], parseNum(mch[1]) * scale, "money");
  }
  // 배수 (PER/PBR 등)
  for (const mch of sentence.matchAll(new RegExp(`${num}\\s*배`, "g"))) {
    push(mch[0], parseNum(mch[1]), "multiple");
  }
  // 퍼센트 (%, %p, 퍼센트)
  for (const mch of sentence.matchAll(new RegExp(`${num}\\s*(?:%p|%|퍼센트)`, "g"))) {
    push(mch[0], parseNum(mch[1]), "percent");
  }
  // 원 단위 금액 (조/억이 앞에 붙지 않은 순수 원). "조/억 ... 원"과 겹치지 않게 뒤에서 처리
  for (const mch of sentence.matchAll(new RegExp(`${num}\\s*원`, "g"))) {
    // 바로 앞이 조/억이면 위에서 이미 처리됨 → 건너뜀
    const before = sentence.slice(Math.max(0, mch.index! - 1), mch.index!);
    if (before === "조" || before === "억") continue;
    push(mch[0], parseNum(mch[1]), "money");
  }
  return out;
}

/** 문장 단위 분할 (한국어 종결 + 개행) */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 서술 필드 하나를 검증해 unmatched 토큰이 있는 문장을 finding으로 반환 */
function verifyField(
  field: keyof ReportNarrative,
  text: string,
  allowed: AllowedNumbers,
): VerificationFinding[] {
  const findings: VerificationFinding[] = [];
  for (const sentence of splitSentences(text)) {
    const unmatched = extractTokens(sentence)
      .filter((t) => !matches(t.value, allowed[t.kind], t.kind))
      .map((t) => t.raw);
    if (unmatched.length) findings.push({ field, sentence, unmatched });
  }
  return findings;
}

/** 서술 전체를 검증한다. 통과면 빈 배열 */
export function verifyNarrative(
  narrative: ReportNarrative,
  allowed: AllowedNumbers,
): VerificationFinding[] {
  const findings: VerificationFinding[] = [];
  const stringFields: (keyof ReportNarrative)[] = [
    "business",
    "earningsComment",
    "valuationComment",
    "analystView",
  ];
  for (const f of stringFields) {
    findings.push(...verifyField(f, narrative[f] as string, allowed));
  }
  const arrayFields: (keyof ReportNarrative)[] = ["summary", "strengths", "risks"];
  for (const f of arrayFields) {
    for (const item of narrative[f] as string[]) {
      findings.push(...verifyField(f, item, allowed));
    }
  }
  return findings;
}
