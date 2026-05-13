import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { RlStepGeneration } from "./rlStep";

const log = createLogger("lib/generation/topologies/rlStepTextWriter");

export type RlStepTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeRlStepText(args: {
  generation: RlStepGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<RlStepTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { netlist, answer, values, archetype } = generation;

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

  const userPrompt = `다음 회로 정보로 임용 시험 스타일의 RL 과도응답 문제 텍스트를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 archetype] ${archetype} (I_L(0)=0, t=0에 V1 인가)
[소자]
${componentListText}
[연결]
${connectionsText}
ground = ${netlist.ground ?? "GND"}

[사용 값] ${valuesText}

[솔버 결과 — 절대 변경 금지]
시정수 τ = ${answer.tauMs} ms
정상상태 I_L(∞) = ${answer.Iinf} A
질문 시각 t = ${answer.tQueryMs} ms (= ${values.N_multiplier}τ)
I_L(t = ${answer.tQueryMs}ms) = ${answer.IlAtQuery} A

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명 (한국어). '아래 그림과 같은 RL 회로에서 t=0에 V_1이 인가된다…'식.",
  "conditions": ["V_1 = ...V", "R_1 = ...Ω", "L_1 = ...mH", "I_L(0) = 0A"],
  "question":   "시정수 τ와 t=${answer.tQueryMs} ms에서의 I_L을 구하시오 (한 문장)",
  "answer":     "τ = ${answer.tauMs} ms, I_L(${answer.tQueryMs} ms) = ${answer.IlAtQuery} A",
  "solution":   "단계별 풀이:\\n  1) τ = L/R 계산\\n  2) I_L(t) = I_∞(1 - e^(-t/τ)), I_∞ = V/R 적용\\n  3) 최종 값 도출"
}

[규칙]
- answer는 솔버 값 그대로 사용. 다른 값으로 바꾸지 마라.
- solution은 그 값에 도달하는 합리적 과정. LaTeX inline \\(...\\) 사용 가능 (\\\\(...\\\\)).
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
  let parsed: Partial<RlStepTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<RlStepTextOutput>; }
  catch (e) {
    throw new Error(`RlStep text JSON 파싱 실패: ${String(e)}`);
  }

  const enforcedAnswer = `τ = ${answer.tauMs} ms, I_L(${answer.tQueryMs} ms) = ${answer.IlAtQuery} A`;
  if (parsed.answer && !containsExpectedValues(parsed.answer, answer.tauMs, answer.IlAtQuery)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 RL 회로에서 시정수와 I_L을 구하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? `시정수 τ와 t=${answer.tQueryMs} ms에서의 I_L을 구하시오.`,
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function containsExpectedValues(text: string, tauMs: number, il: number): boolean {
  const tauRe = new RegExp(`${tauMs}\\s*ms`, "i");
  const ilRe = new RegExp(`${il}\\s*A`, "i");
  return tauRe.test(text) && ilRe.test(text);
}
