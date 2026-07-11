/**
 * 리포트 생성 오케스트레이터 (DEVELOPMENT_PLAN §6).
 *
 * 흐름:
 *  1. 백엔드 계산값으로 <데이터> 블록을 만든다.
 *  2. Claude API(tool use, 서술 전용 스키마)로 서술을 생성한다.
 *  3. 수치 검증기로 서술 속 숫자를 <데이터>와 대조한다.
 *  4. 불일치가 있으면 문장을 지적해 1회 재생성한다.
 *  5. 재실패해도 리포트는 반환하되 verification.passed=false 로 플래그를 남긴다(§6.4).
 *
 * 수치·투자의견은 항상 백엔드 계산값(valuation)을 그대로 병합한다 — LLM은 서술만 담당한다.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { CompanyReportData } from "../types";
import type { ValuationResult } from "../analysis/types";
import { REPORT_TOOL, SYSTEM_PROMPT, buildDataBlock } from "./prompt";
import { buildAllowedNumbers, verifyNarrative } from "./verify";
import { DISCLAIMER } from "./types";
import type { Report, ReportNarrative, VerificationFinding } from "./types";

const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 8000;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY 가 설정되지 않았습니다 (.env.local). 리포트 서술 생성에는 Claude API 키가 필요합니다",
    );
  }
  if (!client) client = new Anthropic();
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
  const content =
    dataBlock + (retry && retry.length ? `\n\n${retryInstruction(retry)}` : "");
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: REPORT_TOOL.name },
  });
  const block = res.content.find((b) => b.type === "tool_use" && b.name === REPORT_TOOL.name);
  if (!block || block.type !== "tool_use") {
    throw new Error(`리포트 생성 실패: tool_use 응답이 없습니다 (stop_reason=${res.stop_reason})`);
  }
  return block.input as ReportNarrative;
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
