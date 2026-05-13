import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { SwitchingGeneration } from "./switchingCircuit";

const log = createLogger("lib/generation/topologies/switchingCircuitTextWriter");

export type SwitchingTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeSwitchingCircuitText(args: {
  generation: SwitchingGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<SwitchingTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const {
    netlistOpen, openSolution, closedSolution,
    target, targetLabel, targetUnit, values, archetype,
  } = generation;

  const componentListText = netlistOpen.components.map((c) => {
    const valStr = c.value !== undefined ? ` = ${c.value}` : "";
    return `  - ${c.id} (${c.type})${valStr}`;
  }).join("\n");

  const connectionsText = netlistOpen.components.map((c) => {
    const nodes = c.pins.map((p) => p.node).join(" ↔ ");
    return `  - ${c.id}: ${nodes}`;
  }).join("\n");

  const valuesText = Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(", ");

  const openVal = target === "Va" ? openSolution.Va : openSolution.Ir1;
  const closedVal = target === "Va" ? closedSolution.Va : closedSolution.Ir1;
  const delta = round3(closedVal - openVal);

  const userPrompt = `다음 회로 정보로 임용 시험 스타일의 DC 스위칭 회로(정상상태) 문제 텍스트를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 archetype] ${archetype} (SW open vs SW closed 두 정상상태 비교, RC/RL 과도 아님)
[소자]
${componentListText}
[연결]
${connectionsText}
ground = ${netlistOpen.ground ?? "GND"}

[사용 값] ${valuesText}

[솔버 결과 — 절대 변경 금지]
SW open 상태:
  V(a) = ${openSolution.Va} V, V(b) = ${openSolution.Vb} V, I_R1 = ${openSolution.Ir1} A
SW closed 상태:
  V(a) = ${closedSolution.Va} V, V(b) = ${closedSolution.Vb} V, I_R1 = ${closedSolution.Ir1} A
질문 대상: ${targetLabel} 두 상태의 값
  open:   ${openVal} ${targetUnit}
  closed: ${closedVal} ${targetUnit}
  변화량: Δ${targetLabel} = ${delta} ${targetUnit}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명 (한국어). 스위치가 열린 상태와 닫힌 상태가 별도로 정의됨을 명시. RC/RL 과도 아닌 순수 DC 정상상태 비교 문제.",
  "conditions": ["주어진 소자 값", "스위치 SW가 b와 GND 사이에 위치", "두 상태에서 정상상태 회로를 풀이"],
  "question":   "스위치가 열린 상태와 닫힌 상태 각각에서 ${targetLabel}을 구하시오 (한 문장)",
  "answer":     "SW open: ${targetLabel} = ${openVal} ${targetUnit}, SW closed: ${targetLabel} = ${closedVal} ${targetUnit}",
  "solution":   "단계별 풀이:\\n  1) SW open: b 노드가 SW로만 연결되어 R_2에 전류 0, V(b) = V(a). 회로는 V_1, R_1, R_3 직렬 단순 분배. → ${targetLabel}_open = ${openVal} ${targetUnit}\\n  2) SW closed: b가 GND에 직결. R_2가 a→GND 추가 경로로 작용. R_3 ∥ R_2 합성 후 R_1과 분배. → ${targetLabel}_closed = ${closedVal} ${targetUnit}\\n  3) Δ${targetLabel} = ${delta} ${targetUnit}"
}

[규칙]
- answer는 솔버 값 그대로. 다른 값으로 바꾸지 마라.
- solution은 두 상태를 독립 DC 회로로 풀이하는 방식 명시.
- 회로 도식 다시 만들지 마라. 코드가 두 figure(state_before, state_after) 모두 생성.
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
  let parsed: Partial<SwitchingTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<SwitchingTextOutput>; }
  catch (e) { throw new Error(`SwitchingCircuit text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `SW open: ${targetLabel} = ${openVal} ${targetUnit}, SW closed: ${targetLabel} = ${closedVal} ${targetUnit}`;
  if (parsed.answer && !containsBothValues(parsed.answer, openVal, closedVal)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "스위치가 열린·닫힌 두 상태에서의 회로 변수를 구하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? `스위치 두 상태에서 ${targetLabel}을 구하시오.`,
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function containsBothValues(text: string, a: number, b: number): boolean {
  const re = (n: number) => new RegExp(String(n).replace(/\./g, "\\."));
  return re(a).test(text) && re(b).test(text);
}
