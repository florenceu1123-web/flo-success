import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { MaxPowerGeneration } from "./maxPowerTransfer";

const log = createLogger("lib/generation/topologies/maxPowerTransferTextWriter");

export type MaxPowerTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeMaxPowerTransferText(args: {
  generation: MaxPowerGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<MaxPowerTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { netlist, RLopt, Pmax, answer: thevAnswer, values, archetype } = generation;

  const componentListText = netlist.components.map((c) => {
    const valStr = c.value !== undefined ? ` = ${c.value}` : "";
    return `  - ${c.id} (${c.type})${valStr}`;
  }).join("\n");

  const connectionsText = netlist.components.map((c) => {
    const nodes = c.pins.map((p) => p.node).join(" ↔ ");
    return `  - ${c.id}: ${nodes}`;
  }).join("\n");

  const valuesText = Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(", ");

  const userPrompt = `다음 회로 정보로 임용 시험 스타일의 최대 전력 전달 문제 텍스트를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 archetype] ${archetype} (Thevenin 등가회로 + a-b 단자에 부하 R_L)
[소자]
${componentListText}
[연결]
${connectionsText}
ground = ${netlist.ground ?? "GND"}
단자: a (Thevenin "+"), b = GND ("-")
부하: R_L (a와 GND 사이, 미지)

[사용 값] ${valuesText}

[솔버 결과 — 절대 변경 금지]
V_th = ${thevAnswer.Vth} V
R_th = ${thevAnswer.Rth} Ω
R_L_opt = ${RLopt} Ω (= R_th)
P_max = ${Pmax} W (= V_th² / (4·R_th))

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명 (한국어). '아래 그림과 같은 회로의 a-b 단자에 부하 R_L을 연결할 때, 부하에 최대 전력이 전달되는 R_L과 그 최대 전력을 구하시오'식.",
  "conditions": ["주어진 소자 값들 (V_1 = ...V, R_1 = ...Ω 등)", "단자 a와 b 사이에 부하 R_L 연결"],
  "question":   "부하 R_L에 최대 전력이 전달되는 R_L 값과 그 때의 최대 전력 P_max를 구하시오",
  "answer":     "R_L = ${RLopt} Ω, P_max = ${Pmax} W",
  "solution":   "단계별 풀이:\\n  1) 단자 a-b에서 Thevenin 등가회로 도출 — 개방회로 전압 V_th = ${thevAnswer.Vth} V, 등가저항 R_th = ${thevAnswer.Rth} Ω\\n  2) 최대 전력 전달 조건: R_L = R_th = ${RLopt} Ω\\n  3) 최대 전력 공식: P_max = V_th² / (4·R_th) = (${thevAnswer.Vth})² / (4·${thevAnswer.Rth}) = ${Pmax} W"
}

[규칙]
- answer는 솔버 값 그대로. 다른 값으로 바꾸지 마라.
- solution은 Thevenin 도출 → 최대 전력 조건 → P_max 계산 절차 명시. LaTeX inline 가능.
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
  let parsed: Partial<MaxPowerTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<MaxPowerTextOutput>; }
  catch (e) { throw new Error(`MaxPowerTransfer text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `R_L = ${RLopt} Ω, P_max = ${Pmax} W`;
  if (parsed.answer && !looksConsistent(parsed.answer, RLopt, Pmax)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 회로의 단자 a-b에 부하를 연결할 때 최대 전력 전달 조건을 구하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "R_L_opt와 P_max를 구하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function looksConsistent(text: string, RL: number, Pmax: number): boolean {
  const re = (n: number) => new RegExp(String(n).replace(/\./g, "\\."));
  return re(RL).test(text) && re(Pmax).test(text);
}
