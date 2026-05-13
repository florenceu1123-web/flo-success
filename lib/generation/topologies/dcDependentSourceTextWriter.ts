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

[회로 archetype] ${archetype} (종속전원 타입: ${generation.depSourceType})
[소자]
${componentListText}
[연결]
${connectionsText}
ground = ${netlist.ground ?? "GND"}

[사용 값] ${valuesText}
※ 제어 변수: ${generation.controlLabel} — ${generation.controlDescription}
※ 종속전원 식: ${generation.depFormula}

[솔버 결과 — 절대 변경 금지]
V(a) = ${Vnodes.a} V
V(b) = ${Vnodes.b} V
질문 대상: ${targetLabel} = ${targetValue} ${unit}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명 (한국어). 종속전원이 ${generation.controlLabel}에 비례한다는 점 명시.",
  "conditions": ["소자 값들", "${generation.depSourceType}: ${generation.depFormula}", "${generation.controlDescription}"],
  "question":   "${targetLabel}을 구하시오 (한 문장)",
  "answer":     "${targetLabel} = ${targetValue} ${unit}",
  "solution":   "단계별 풀이:\\n  1) KCL/KVL 적용 — 종속 항을 ${generation.controlLabel}의 함수로 표기 (별도 미지수 아님)\\n  2) ${generation.controlLabel}를 노드 전압의 식으로 전개\\n  3) 연립방정식 풀이 → V(a) = ${Vnodes.a} V, V(b) = ${Vnodes.b} V\\n  4) 최종 ${targetLabel} = ${targetValue} ${unit}"
}

[규칙]
- answer는 솔버 값 그대로. 다른 값으로 바꾸지 마라.
- solution은 종속전원이 별도 미지수가 아님을 강조 (${generation.controlLabel}의 함수로 표기).
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
