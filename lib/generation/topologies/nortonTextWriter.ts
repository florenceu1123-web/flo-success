import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { NortonGeneration } from "./norton";

const log = createLogger("lib/generation/topologies/nortonTextWriter");

export type NortonTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * Norton 등가회로 문제의 텍스트(문제·조건·질문·답·풀이)를 GPT에게 작성시킨다.
 * 정답(I_n, R_n)은 솔버가 결정 — GPT는 그 값을 그대로 사용하고 풀이 과정만 서술.
 */
export async function writeNortonText(args: {
  generation: NortonGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<NortonTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { netlist, terminalA, terminalB, answer, values, archetype } = generation;

  const componentListText = netlist.components.map((c) => {
    const valStr = c.value !== undefined ? ` = ${c.value}` : "";
    return `  - ${c.id} (${c.type})${valStr}`;
  }).join("\n");

  const connectionsText = netlist.components.map((c) => {
    const nodes = c.pins.map((p) => p.node).join(" ↔ ");
    return `  - ${c.id}: ${nodes}`;
  }).join("\n");

  const valuesText = Object.entries(values)
    .map(([k, v]) => `${k} = ${v}`)
    .join(", ");

  const userPrompt = `다음 회로 정보로 임용 시험 스타일의 Norton 등가회로 문제 텍스트를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 archetype] ${archetype}
[소자] ${componentListText}
[연결]
${connectionsText}
ground = ${netlist.ground ?? "GND"}
단자 A = ${terminalA}, 단자 B = ${terminalB}

[사용 값] ${valuesText}

[정답 (코드가 계산 — 절대 변경 금지)]
I_n = ${answer.In} A
R_n = ${answer.Rn} Ω

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명 (한국어)",
  "conditions": ["주어진 조건들"],
  "question":   "단자 a-b에서 본 Norton 등가회로의 I_n과 R_n을 구하시오",
  "answer":     "I_n = ${answer.In} A, R_n = ${answer.Rn} Ω",
  "solution":   "단계별 풀이:\\n  1) 단락회로 전류법으로 I_n 계산 (또는 V_th/R_th 변환)\\n  2) 독립전원 zero out 후 R_n 계산\\n  3) 최종 I_n=${answer.In}A, R_n=${answer.Rn}Ω 도출"
}

[규칙]
- answer는 위의 I_n, R_n 숫자를 그대로 사용. 다른 값으로 바꾸지 마라.
- 풀이는 그 숫자에 도달하는 합리적 과정. LaTeX inline \\(...\\) 사용 가능.
- 회로 도식 생성 금지 (figureVariants 출력 금지). 코드가 처리.
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
  let parsed: Partial<NortonTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<NortonTextOutput>; }
  catch (e) {
    throw new Error(`Norton text JSON 파싱 실패: ${String(e)}`);
  }

  const enforcedAnswer = `I_n = ${answer.In} A, R_n = ${answer.Rn} Ω`;
  if (parsed.answer && !looksLikeSameAnswer(parsed.answer, answer.In, answer.Rn)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 회로에서 단자 a-b의 Norton 등가회로를 구하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "Norton 등가전류 I_n과 등가저항 R_n을 구하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function looksLikeSameAnswer(text: string, In: number, Rn: number): boolean {
  const inRe = new RegExp(`${In}\\s*A`, "i");
  const rnRe = new RegExp(`${Rn}\\s*[Ω\\u03a9ohm]`, "i");
  return inRe.test(text) && rnRe.test(text);
}
