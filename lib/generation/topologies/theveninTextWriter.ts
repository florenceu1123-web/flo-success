import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { TheveninGeneration } from "./thevenin";

const log = createLogger("lib/generation/topologies/theveninTextWriter");

export type TheveninTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * Thevenin 문제의 텍스트 부분(문제 본문·조건·질문·답·풀이)을 GPT에게 작성시킨다.
 *
 *  - GPT는 netlist를 *해석*만 하고 변경 금지.
 *  - 정답(V_th, R_th)은 이미 계산되어 입력으로 주어짐 → GPT는 그 숫자를 그대로 사용.
 *  - 풀이도 그 숫자를 도출하는 과정을 풀어 쓸 뿐, 다른 결과로 가지 않게 강제.
 *
 *  GPT가 회로 자체를 생성하지 않으므로 dangling/role-swap/inventory miss 등의
 *  pipeline 실패 모드가 원천 차단된다.
 */
export async function writeTheveninText(args: {
  generation: TheveninGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<TheveninTextOutput> {
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

  const userPrompt = `다음 회로 정보로 임용 시험 스타일의 Thevenin 등가회로 문제 텍스트를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 archetype]
${archetype}

[소자 목록]
${componentListText}

[연결 (node 기준)]
${connectionsText}
ground = ${netlist.ground ?? "GND"}
단자 A (Thevenin "+") = ${terminalA}
단자 B (Thevenin "-") = ${terminalB}

[사용 값]
${valuesText}

[정답 (코드가 계산 — 절대 변경 금지)]
V_th = ${answer.Vth} V
R_th = ${answer.Rth} Ω

[모드]
${mode === "exam_similar" ? "기출유사유형 — 원본과 유사한 문장 구조" : "기출변형유형 — 원본 의도 보존하며 자연스럽게"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로에 대한 짧은 설명 (한국어). '아래 그림과 같은 회로에서…'로 시작 가능.",
  "conditions": ["주어진 조건들 — 소자 값과 단자 위치 명시"],
  "question":   "단자 a-b에서 본 Thevenin 등가회로의 V_th와 R_th를 구하시오 (한 문장)",
  "answer":     "V_th = ${answer.Vth} V, R_th = ${answer.Rth} Ω",
  "solution":   "단계별 풀이 (한국어). 최소 다음 단계 모두 포함:\\n  1) 개방회로 전압법으로 V_th 계산 (KVL/KCL 또는 전압분배·중첩의 정리 등 명시)\\n  2) 독립전원 zero out 후 R_th 계산 (직병렬 합성 명시)\\n  3) 최종 V_th=${answer.Vth}V, R_th=${answer.Rth}Ω 도출"
}

[규칙]
- answer는 위의 V_th, R_th 숫자를 정확히 그대로. 다른 값으로 바꾸지 마라.
- solution은 그 숫자를 도출하는 합리적 과정. 중간 계산식 LaTeX inline \\(...\\) 사용 가능.
- 회로 도식을 다시 만들지 마라 (figureVariants 출력 금지). 코드가 직접 처리.
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
  let parsed: Partial<TheveninTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<TheveninTextOutput>; }
  catch (e) {
    throw new Error(`Thevenin text JSON 파싱 실패: ${String(e)}`);
  }

  // 안전망: 정답 문자열 강제 (GPT가 답을 다르게 적어 보내는 경우 방어)
  const enforcedAnswer = `V_th = ${answer.Vth} V, R_th = ${answer.Rth} Ω`;
  if (parsed.answer && !looksLikeSameAnswer(parsed.answer, answer.Vth, answer.Rth)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 회로에서 단자 a-b의 Thevenin 등가회로를 구하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "Thevenin 등가전압 V_th와 등가저항 R_th를 구하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function looksLikeSameAnswer(text: string, vth: number, rth: number): boolean {
  const vthRe = new RegExp(`${vth}\\s*V`, "i");
  const rthRe = new RegExp(`${rth}\\s*[Ω\\u03a9ohm]`, "i");
  return vthRe.test(text) && rthRe.test(text);
}
