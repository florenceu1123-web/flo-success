import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { DepSourceGeneration } from "./dcDependentSource";

const log = createLogger("lib/generation/topologies/dcDependentSourceTextWriter");

const UNIT_OF: Record<DepSourceGeneration["target"], string> = {
  Va: "V",
  Vb: "V",
  Ir3: "A",
};

export type DepSourceTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeDcDependentSourceText(args: {
  generation: DepSourceGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<DepSourceTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { netlist, Vnodes, target, targetValue, targetLabel, values, archetype } = generation;

  const componentListText = netlist.components.map((c) => {
    const valStr = c.value !== undefined ? ` = ${c.value}` : "";
    return `  - ${c.id} (${c.type})${valStr}`;
  }).join("\n");

  const connectionsText = netlist.components.map((c) => {
    const nodes = c.pins.map((p) => p.node).join(" ↔ ");
    return `  - ${c.id}: ${nodes}`;
  }).join("\n");

  const valuesText = Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(", ");
  const unit = UNIT_OF[target];

  const userPrompt = `다음 회로 정보로 임용 시험 스타일의 종속전원 회로 해석 문제를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 archetype] ${archetype}
[소자]
${componentListText}
[연결]
${connectionsText}
ground = ${netlist.ground ?? "GND"}

[사용 값] ${valuesText}
※ V_x = V(a) (제어 변수). VCCS Gx는 g_m·V_x 만큼 노드 b로 전류 inject.

[솔버 결과 — 절대 변경 금지]
V(a) = ${Vnodes.a} V
V(b) = ${Vnodes.b} V
질문 대상: ${targetLabel} = ${targetValue} ${unit}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명 (한국어). 종속전원이 V_x에 비례한다는 점 명시.",
  "conditions": ["V_1 = ...V", "R_1, R_2, R_x, R_3 = ...Ω", "VCCS: I = g_m·V_x = ${values.g_m}·V_x [A]"],
  "question":   "${targetLabel}을 구하시오 (한 문장)",
  "answer":     "${targetLabel} = ${targetValue} ${unit}",
  "solution":   "단계별 풀이:\\n  1) 노드 a, b에 KCL 적용 (종속 전류 항을 V_x = V(a)로 표기)\\n  2) 두 개의 미지수 V_a, V_b 연립방정식 수립\\n  3) 수치 대입 → V(a) = ${Vnodes.a} V, V(b) = ${Vnodes.b} V 도출\\n  4) 최종 ${targetLabel} = ${targetValue} ${unit}"
}

[규칙]
- answer는 솔버 값 그대로. 다른 값으로 바꾸지 마라.
- solution은 종속전원이 별도 미지수가 아님을 강조 (V_x의 함수로 표기).
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
  let parsed: Partial<DepSourceTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<DepSourceTextOutput>; }
  catch (e) { throw new Error(`DcDependentSource text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `${targetLabel} = ${targetValue} ${unit}`;
  if (parsed.answer && !looksLikeSameAnswer(parsed.answer, targetValue)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 종속전원 회로를 해석하시오.",
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
