/**
 * 리포트 생성 프롬프트 조립 (DEVELOPMENT_PLAN §6.2·§6.3).
 *
 * - LLM에는 백엔드가 계산한 <데이터>만 넘기고, 서술 전용 responseSchema로 출력을 강제한다.
 * - 시스템 프롬프트에 수치 창작 금지 등 제약을 상시 포함한다(§6.3).
 * - 금액은 조/억 단위로 미리 포맷해, 서술이 인용하는 형태와 검증기 허용값이 어긋나지 않게 한다.
 */
import { Type, type Schema } from "@google/genai";
import type { CompanyReportData } from "../types";
import type { ValuationResult, ValuationBand } from "../analysis/types";

/**
 * 서술 전용 출력 스키마 (수치 필드 없음 — §6.1).
 * Gemini structured output(responseSchema)으로 이 구조를 강제한다.
 */
export const REPORT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "핵심 투자 논거 3줄 (정확히 3개)",
    },
    business: { type: Type.STRING, description: "사업 개요 서술" },
    earningsComment: { type: Type.STRING, description: "실적 추이 해석" },
    valuationComment: {
      type: Type.STRING,
      description:
        "제공된 목표주가·투자의견의 산출 논리 서술 (판단을 새로 하지 말 것). " +
        "[AI vs 시장]이 있으면 AI 독립 내재가치와 증권사 컨센서스를 함께 제시하고, 괴리율과 그 원인을 해석한다.",
    },
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "강점 3가지 (정확히 3개)",
    },
    risks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "리스크 3가지 (정확히 3개)",
    },
    analystView: { type: Type.STRING, description: "종합 애널리스트 의견" },
  },
  required: [
    "summary",
    "business",
    "earningsComment",
    "valuationComment",
    "strengths",
    "risks",
    "analystView",
  ],
  propertyOrdering: [
    "summary",
    "business",
    "earningsComment",
    "valuationComment",
    "strengths",
    "risks",
    "analystView",
  ],
};

export const SYSTEM_PROMPT = [
  "당신은 국내 주식 애널리스트다. 제공된 <데이터>만 근거로 한국어 투자 리포트의 서술 부분을 작성한다.",
  "",
  "제약:",
  "- <데이터>에 없는 수치를 절대 만들지 말 것. 수치가 필요하나 없으면 '자료 없음'으로 표기한다.",
  "- 목표주가·투자의견 같은 판단은 이미 <데이터>에 계산되어 있다. 그 값을 새로 정하지 말고, 산출 근거만 서술한다.",
  "- [AI vs 시장] 자료가 있으면 컨센서스를 단순 추종하지 말고, AI 독립 내재가치와 컨센서스의 괴리·원인(선행 실적·성장·할인율 등)을 균형 있게 해석한다.",
  "- 강점과 리스크를 동등한 비중으로 다룬다. 매수 일변도 금지.",
  "- 수치를 인용할 때는 <데이터>에 적힌 값을 그대로 쓴다(반올림은 허용).",
  "- 사업 개요는 [사업 개요] 자료를 바탕으로 서술하되, 금액·비율 수치는 재무·시세 섹션의 값만 인용한다.",
  "- 간결하고 명확하게. 불필요한 미사여구 없이 핵심부터.",
].join("\n");

function fmtWon(n: number | null): string {
  if (n == null) return "자료 없음";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(1)}조원`;
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(0)}억원`;
  return `${sign}${Math.round(a).toLocaleString("ko-KR")}원`;
}
function fmtPct(r: number | null, isRatio = true): string {
  if (r == null) return "자료 없음";
  return `${(isRatio ? r * 100 : r).toFixed(1)}%`;
}
function fmtMult(n: number | null): string {
  return n == null ? "자료 없음" : `${n.toFixed(1)}배`;
}
function fmtBand(b: ValuationBand | null): string {
  return b == null
    ? "미제시"
    : `보수 ${fmtWon(b.conservative)} / 기본 ${fmtWon(b.base)} / 낙관 ${fmtWon(b.optimistic)}`;
}

/** <데이터> 블록 — LLM이 인용할 모든 계산값을 사람이 읽는 형태로 담는다 */
export function buildDataBlock(data: CompanyReportData, v: ValuationResult): string {
  const p = data.profile;
  const m = data.market;
  const met = v.metrics;
  const lines: string[] = [];

  lines.push("<데이터>");
  lines.push(`[기업] ${p.name} (${p.stockCode}) · 대표 ${p.ceo} · DART업종코드 ${p.indutyCode}`);
  if (data.businessOverview) {
    lines.push(`[사업 개요(DART 사업보고서)] ${data.businessOverview}`);
  }
  lines.push(
    `[시세] 현재가 ${fmtWon(m.close)} · 전일대비 ${fmtWon(m.change)} (${fmtPct(m.changePct, false)}) · ` +
      `시가총액 ${fmtWon(m.marketCap)} · 상장주식수 ${Math.round(m.listedShares).toLocaleString("ko-KR")}주 · ` +
      `52주 ${fmtWon(m.low52w)}~${fmtWon(m.high52w)} · 시장 ${m.market}`,
  );
  lines.push(
    `[밸류에이션 지표] PER ${fmtMult(met.per)} · PBR ${fmtMult(met.pbr)} · ROE ${fmtPct(met.roe)} · ` +
      `ROA ${fmtPct(met.roa)} · EPS ${fmtWon(met.eps)} · BPS ${fmtWon(met.bps)}`,
  );
  // 금융·지주는 부채 대부분이 예수금 등 금융부채라, 일반 제조업식 부채비율/자기자본비율을
  // 그대로 제시하면 레버리지가 과대해 보인다(§5.1). 유형별로 다르게 표기한다.
  if (v.companyType === "financial" || v.companyType === "holding") {
    lines.push(
      `[안정성·수익성] 순이익률 ${fmtPct(met.netMargin)} · ROE ${fmtPct(met.roe)} 중심으로 수익성을 본다. ` +
        `부채비율·자기자본비율은 예수금 등 금융부채 특성상 일반 제조업과 직접 비교가 부적합하여 제시하지 않는다`,
    );
  } else {
    lines.push(
      `[안정성·수익성] 영업이익률 ${fmtPct(met.opMargin)} · 순이익률 ${fmtPct(met.netMargin)} · ` +
        `부채비율 ${fmtPct(met.debtRatio)} · 자기자본비율 ${fmtPct(met.equityRatio)}`,
    );
  }
  lines.push(
    `[성장성] 매출성장률(YoY) ${fmtPct(met.revenueGrowth)} · 영업이익성장률 ${fmtPct(met.opGrowth)} · ` +
      `매출CAGR ${fmtPct(met.revenueCagr)}`,
  );

  // 증권사 컨센서스 — 외부 출처(네이버 금융 집계) 사실. 선행 실적을 반영하므로 목표주가 산정에 쓰인다
  const cons = v.consensus;
  if (cons && (cons.targetMean != null || cons.forwardEps != null)) {
    const parts: string[] = [];
    if (cons.targetMean != null) parts.push(`목표주가 컨센서스 ${fmtWon(cons.targetMean)}`);
    if (cons.forwardEps != null) parts.push(`선행 EPS ${fmtWon(cons.forwardEps)}`);
    if (cons.forwardPer != null) parts.push(`선행 PER ${fmtMult(cons.forwardPer)}`);
    if (cons.recommMean != null) parts.push(`투자의견 평균 ${cons.recommMean.toFixed(2)}/5(5=매수)`);
    lines.push(
      `[시장 컨센서스] ${parts.join(" · ")} — 네이버 금융이 집계한 증권사 컨센서스` +
        `${cons.asOf ? ` (기준일 ${cons.asOf})` : ""}. 외부 출처값이며 후행 실적 대비 선행 관점을 담는다`,
    );
  }

  lines.push("[연간 실적] (최신 연도 우선)");
  for (const f of data.annualFinancials) {
    lines.push(
      `  ${f.period}(${f.fsDiv}): 매출 ${fmtWon(f.revenue)} · 영업이익 ${fmtWon(f.operatingProfit)} · ` +
        `순이익 ${fmtWon(f.netIncome)} · 자본총계 ${fmtWon(f.totalEquity)} · 부채총계 ${fmtWon(f.totalLiabilities)}`,
    );
  }

  lines.push(
    `[투자판단] 기업유형 ${v.companyType} · 목표주가 ${fmtBand(v.targetPrice)} · ` +
      `상승여력(기본) ${v.upsidePct == null ? "N/A" : fmtPct(v.upsidePct, false)} · 투자의견 ${v.opinion}`,
  );
  // AI 독립 산출 vs 시장 컨센서스 비교 — 컨센서스를 따라가지 말고 괴리를 해석하게 한다(§5.2 v3 ⑤)
  if (v.intrinsicTarget != null) {
    const gap =
      v.consensusGapPct == null
        ? ""
        : ` · 괴리 ${v.consensusGapPct >= 0 ? "+" : ""}${v.consensusGapPct.toFixed(1)}%(컨센서스가 AI 대비)`;
    const consLine = v.consensus?.targetMean != null ? fmtWon(v.consensus.targetMean) : "미제공";
    lines.push(
      `[AI vs 시장] AI 독립 내재가치(RIM+선행이익력, 컨센서스 제외) ${fmtWon(v.intrinsicTarget)} · ` +
        `증권사 컨센서스 ${consLine}${gap} · 최종 목표주가 ${fmtWon(v.targetPrice?.base ?? null)}`,
    );
  }
  lines.push("[방법론]");
  for (const method of v.methods) {
    lines.push(`  ${method.method}(가중 ${method.weight}): ${fmtBand(method.band)} — ${method.note}`);
  }
  lines.push("[산출 가정]");
  for (const a of v.assumptions) lines.push(`  - ${a}`);

  if (data.disclosures.length) {
    lines.push("[최근 공시]");
    for (const d of data.disclosures.slice(0, 8)) lines.push(`  ${d.date} ${d.title} (${d.submitter})`);
  }
  lines.push("</데이터>");
  return lines.join("\n");
}
