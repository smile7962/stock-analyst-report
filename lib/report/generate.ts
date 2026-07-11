/**
 * 리포트 생성 오케스트레이터 (DEVELOPMENT_PLAN §6).
 *
 * 흐름:
 *  1. 백엔드 계산값으로 <데이터> 블록을 만든다.
 *  2. Gemini API(structured output, 서술 전용 responseSchema)로 서술을 생성한다.
 *  3. 수치 검증기로 서술 속 숫자를 <데이터>와 대조한다.
 *  4. 불일치가 있으면 문장을 지적해 1회 재생성한다.
 *  5. 재실패해도 리포트는 반환하되 verification.passed=false 로 플래그를 남긴다(§6.4).
 *
 * 수치·투자의견은 항상 백엔드 계산값(valuation)을 그대로 병합한다 — LLM은 서술만 담당한다.
 */
import { GoogleGenAI } from "@google/genai";
import type { CompanyReportData } from "../types";
import type { ValuationResult } from "../analysis/types";
import { cached, TTL } from "../cache";
import { REPORT_SCHEMA, SYSTEM_PROMPT, buildDataBlock } from "./prompt";
import { buildAllowedNumbers, verifyNarrative } from "./verify";
import { DISCLAIMER } from "./types";
import type { Report, ReportNarrative, VerificationFinding } from "./types";

const MODEL = "gemini-2.5-flash";

/**
 * 프롬프트/스키마/검증 로직이 바뀌면 이 값을 올려 이전 캐시를 무효화한다 (§6.5).
 */
export const REPORT_VERSION = 1;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY 가 설정되지 않았습니다 (.env.local). 리포트 서술 생성에는 Gemini API 키가 필요합니다",
    );
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

/** findings 를 재생성 지시문으로 변환 */
function retryInstruction(findings: VerificationFinding[]): string {
  const lines = findings.map(
    (f) => `- [${f.field}] "${f.sentence}" → <데이터>에 없는 수치: ${f.unmatched.join(", ")}`,
  );
  return [
    "다음 문장의 수치가 <데이터>와 일치하지 않는다. <데이터>의 값으로 고치거나, 근거 없는 수치를 빼고 다시 제출하라:",
    ...lines,
  ].join("\n");
}

async function callModel(
  dataBlock: string,
  retry?: VerificationFinding[],
): Promise<ReportNarrative> {
  const contents =
    dataBlock + (retry && retry.length ? `\n\n${retryInstruction(retry)}` : "");
  const res = await getClient().models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: REPORT_SCHEMA,
    },
  });
  const text = res.text;
  if (!text) {
    throw new Error(`리포트 생성 실패: Gemini 응답이 비어 있습니다 (finishReason=${res.candidates?.[0]?.finishReason})`);
  }
  try {
    return JSON.parse(text) as ReportNarrative;
  } catch {
    throw new Error(`리포트 생성 실패: 응답이 JSON이 아닙니다: ${text.slice(0, 200)}`);
  }
}

export async function generateReport(
  data: CompanyReportData,
  valuation: ValuationResult,
): Promise<Report> {
  const dataBlock = buildDataBlock(data, valuation);
  const allowed = buildAllowedNumbers(data, valuation);

  let narrative = await callModel(dataBlock);
  let findings = verifyNarrative(narrative, allowed);
  let regenerated = 0;

  if (findings.length) {
    narrative = await callModel(dataBlock, findings);
    findings = verifyNarrative(narrative, allowed);
    regenerated = 1;
  }

  return {
    stockCode: data.profile.stockCode,
    valuation,
    data,
    narrative,
    verification: { passed: findings.length === 0, findings, regenerated },
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 캐시 키 — 종목·거래일·리포트버전. 거래일을 포함하므로 새 거래일에는 재생성되고,
 * 같은 날 같은 종목은 재사용된다(§6.5). 거래일 키 덕에 "어제 주가로 계산" 문제도 없다(§3).
 */
export function reportCacheKey(data: CompanyReportData): string {
  return `report:${data.profile.stockCode}:${data.market.date}:v${REPORT_VERSION}`;
}

/**
 * generateReport 의 캐싱 래퍼. 같은 종목·같은 거래일 재조회 시 Gemini 재호출 없이
 * 캐시된 리포트를 돌려줘 무료 티어 할당량과 지연을 아낀다.
 */
export async function generateReportCached(
  data: CompanyReportData,
  valuation: ValuationResult,
): Promise<Report> {
  return cached(reportCacheKey(data), TTL.daily, () => generateReport(data, valuation));
}
