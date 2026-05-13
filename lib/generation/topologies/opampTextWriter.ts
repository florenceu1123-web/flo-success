import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { OpampGeneration } from "./opamp";

const log = createLogger("lib/generation/topologies/opampTextWriter");

const ARCHETYPE_LABEL: Record<OpampGeneration["archetype"], string> = {
  inverting: "반전 증폭기 (inverting amplifier)",
  non_inverting: "비반전 증폭기 (non-inverting amplifier)",
  summing: "가산 증폭기 (summing amplifier)",
  difference: "차동 증폭기 (difference amplifier, 균형형)",
  voltage_follower: "전압 추종기 (voltage follower / unity-gain buffer)",
};

export type OpampTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeOpampText(args: {
  generation: OpampGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<OpampTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { netlist, Vout, Vminus, Vplus, targetLabel, archetype, gainFormula, values } = generation;

  const componentListText = netlist.components.map((c) => {
    const valStr = c.value !== undefined ? ` = ${c.value}` : "";
    return `  - ${c.id} (${c.type})${valStr}`;
  }).join("\n");

  const connectionsText = netlist.components.map((c) => {
    const nodes = c.pins.map((p) => p.node).join(" ↔ ");
    return `  - ${c.id}: ${nodes}`;
  }).join("\n");

  const valuesText = Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(", ");

  const userPrompt = `다음 회로 정보로 임용 시험 스타일의 OPAMP 회로 분석 문제 텍스트를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 archetype] ${archetype} (${ARCHETYPE_LABEL[archetype]})
[소자]
${componentListText}
[연결]
${connectionsText}
ground = ${netlist.ground ?? "GND"}

[사용 값] ${valuesText}
※ OPAMP는 이상 (open-loop gain 무한대, 입력 임피던스 무한대, 출력 임피던스 0)
※ 가상단락: V_+ = V_-, 입력 단자 전류 = 0

[솔버 결과 — 절대 변경 금지]
V_+ = ${Vplus} V
V_- = ${Vminus} V
V_out = ${Vout} V
질문 대상: ${targetLabel} = ${Vout} V

[이득 식]
${gainFormula}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명 (한국어). archetype에 맞는 OPAMP 구성 명시 (반전/비반전/가산).",
  "conditions": ["소자 값들", "OPAMP는 이상적 (open-loop gain 무한대)", "V_+ = V_- (가상단락), 입력 전류 = 0"],
  "question":   "${targetLabel}을 구하시오 (한 문장)",
  "answer":     "${targetLabel} = ${Vout} V",
  "solution":   "단계별 풀이:\\n  1) 이상 OPAMP 가정 — V_+ = V_-, 입력 전류 0\\n  2) V_+ 결정 (V_+ = ${Vplus} V — ${archetype === "non_inverting" ? "V_in에 직접 연결" : "GND에 직접 연결"})\\n  3) 가상단락으로 V_- = ${Vminus} V\\n  4) V_- 노드에 KCL 적용 (입력 전류 0이므로 R로 들어오는 전류 = R_f로 나가는 전류)\\n  5) ${gainFormula}"
}

[규칙]
- answer는 솔버 값 그대로. 다른 값으로 바꾸지 마라.
- solution은 가상단락 + KCL 적용 절차 명시. LaTeX inline 가능.
- 회로 도식 다시 만들지 마라. 코드가 처리.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<OpampTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<OpampTextOutput>; }
  catch (e) { throw new Error(`Opamp text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `${targetLabel} = ${Vout} V`;
  if (parsed.answer && !looksLikeSameAnswer(parsed.answer, Vout)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 OPAMP 회로의 출력 전압을 구하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? `${targetLabel}을 구하시오.`,
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function looksLikeSameAnswer(text: string, expected: number): boolean {
  const m = text.match(/-?\d+(?:\.\d+)?/);
  if (!m) return false;
  return Math.abs(parseFloat(m[0]) - expected) < 0.01;
}
