import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { BjtSmallSignalGeneration } from "./bjtSmallSignal";

const log = createLogger("lib/generation/topologies/bjtSmallSignalTextWriter");

export type BjtSmallSignalTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeBjtSmallSignalText(args: {
  generation: BjtSmallSignalGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<BjtSmallSignalTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { Av, Vc_mV, Vb_mV, values } = generation;

  // β = g_m · r_π
  const beta = (values.g_m_mS / 1000) * (values.r_pi_kohm * 1000);

  // 분압 계수 r_π/(R_S + r_π)
  const inputDivider = values.r_pi_kohm / (values.R_S_kohm + values.r_pi_kohm);
  const inputDividerRounded = Math.round(inputDivider * 1000) / 1000;

  const userPrompt = `다음 정보로 임용 시험 스타일의 BJT 소신호 등가 회로 문제를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[BJT Common-Emitter 소신호 등가 (hybrid-π)]
주어진 값:
  v_s = ${values.v_s_mV} mV (소신호 입력)
  R_S = ${values.R_S_kohm} kΩ
  r_π = ${values.r_pi_kohm} kΩ
  g_m = ${values.g_m_mS} mA/V (= mS)
  R_C = ${values.R_C_kohm} kΩ
  β = g_m · r_π = ${beta} (전류이득)

[솔버 결과 — 절대 변경 금지]
v_b = ${Vb_mV} mV (= v_be, 분압 ${inputDividerRounded})
v_c = ${Vc_mV} mV (= v_out)
A_v = v_c / v_s = ${Av} (반전, dimensionless)

이론식: A_v = -g_m·R_C · (r_π / (R_S + r_π))

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "문제 설명. BJT CE 증폭기 소신호 등가 (hybrid-π)에서 전압 이득 A_v를 구하는 문제임을 명시.",
  "conditions": ["v_s = ${values.v_s_mV} mV, R_S = ${values.R_S_kohm} kΩ", "r_π = ${values.r_pi_kohm} kΩ, g_m = ${values.g_m_mS} mA/V (β = ${beta})", "R_C = ${values.R_C_kohm} kΩ", "BJT는 hybrid-π 소신호 등가로 모델링 (r_π + g_m·v_be VCCS)"],
  "question":   "전압 이득 A_v = v_c / v_s를 구하시오",
  "answer":     "A_v = ${Av}",
  "solution":   "단계별 풀이:\\n  1) 입력 분압: v_be = v_s · r_π / (R_S + r_π) = ${values.v_s_mV} · ${inputDividerRounded} = ${Vb_mV} mV\\n  2) 컬렉터 전류: i_c = g_m · v_be (소신호)\\n  3) 출력 전압: v_c = -i_c · R_C = -g_m · v_be · R_C\\n  4) 전압 이득: A_v = v_c / v_s = -g_m·R_C · (r_π / (R_S + r_π))\\n  5) 수치 대입: A_v = -${values.g_m_mS}·${values.R_C_kohm} · ${inputDividerRounded} = ${Av}"
}

[규칙]
- answer는 솔버 값 그대로. 다른 값으로 바꾸지 마라.
- solution은 입력 분압 + i_c 산출 + 컬렉터 전압 단계 명시. LaTeX inline 가능.
- 회로 도식 다시 만들지 마라. 코드가 소신호 등가 회로 자동 생성.
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
  let parsed: Partial<BjtSmallSignalTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<BjtSmallSignalTextOutput>; }
  catch (e) { throw new Error(`BjtSmallSignal text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `A_v = ${Av}`;
  if (parsed.answer && !looksLikeSameAnswer(parsed.answer, Av)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 BJT CE 증폭기 소신호 등가에서 전압 이득을 구하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "A_v를 구하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function looksLikeSameAnswer(text: string, expected: number): boolean {
  const m = text.match(/-?\d+(?:\.\d+)?/);
  if (!m) return false;
  return Math.abs(parseFloat(m[0]) - expected) < 0.1;
}
