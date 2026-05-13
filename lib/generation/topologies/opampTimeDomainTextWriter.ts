import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { OpampTimeDomainGeneration } from "./opampTimeDomain";

const log = createLogger("lib/generation/topologies/opampTimeDomainTextWriter");

const ARCHETYPE_LABEL: Record<OpampTimeDomainGeneration["archetype"], string> = {
  integrator_step: "적분기 (integrator) — step 입력",
  differentiator_ramp: "미분기 (differentiator) — ramp 입력",
};

export type OpampTimeDomainTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeOpampTimeDomainText(args: {
  generation: OpampTimeDomainGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<OpampTimeDomainTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { archetype, answer, values } = generation;

  const valuesText = Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(", ");

  let questionPhrase: string;
  let answerString: string;
  let solutionSteps: string;

  if (archetype === "integrator_step") {
    questionPhrase = `시정수 τ와 t = ${answer.tQueryMs} ms에서의 V_out을 구하시오`;
    answerString = `τ = ${answer.tauMs} ms, V_out(${answer.tQueryMs} ms) = ${answer.Vout} V`;
    solutionSteps = `1) 적분기 출력식: V_out(t) = -(1/RC)·∫V_in dt\\n  2) Step 입력 V_in = V_step (t ≥ 0)이므로 ∫V_in dt = V_step·t\\n  3) τ = RC = ${values.R_kohm}kΩ · ${values.C_uF}μF = ${answer.tauMs} ms\\n  4) V_out(t) = -V_step·t/τ. t = ${answer.tQueryMs} ms 대입 → V_out = -${values.V_step}·${answer.tQueryMs}/${answer.tauMs} = ${answer.Vout} V`;
  } else {
    questionPhrase = "V_out의 정상값을 구하시오";
    answerString = `V_out = ${answer.Vout} V (constant, t > 0)`;
    solutionSteps = `1) 미분기 출력식: V_out(t) = -RC·dV_in/dt\\n  2) Ramp 입력 V_in = ${values.slope_V_per_ms}·t [V] (t in ms) → dV_in/dt = ${values.slope_V_per_ms} V/ms = ${values.slope_V_per_ms * 1000} V/s\\n  3) RC = ${values.R_kohm}kΩ·${values.C_uF}μF = ${answer.tauMs}·10⁻³ s\\n  4) V_out = -RC·dV_in/dt = -${answer.tauMs}·10⁻³·${values.slope_V_per_ms * 1000} = ${answer.Vout} V`;
  }

  const userPrompt = `다음 정보로 임용 시험 스타일의 시간영역 OPAMP 회로 문제를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 archetype] ${archetype} (${ARCHETYPE_LABEL[archetype]})
[사용 값] ${valuesText}

[솔버 결과 — 절대 변경 금지]
${answerString}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명. ${ARCHETYPE_LABEL[archetype]} 임을 명시. 입력 신호 종류·소자 값을 condition에 정리.",
  "conditions": ["회로 구성: ${archetype}", "${valuesText}", "이상적 OPAMP 가정"],
  "question":   "${questionPhrase}",
  "answer":     "${answerString}",
  "solution":   "단계별 풀이:\\n  ${solutionSteps}"
}

[규칙]
- answer는 솔버 값 그대로. 다른 값으로 바꾸지 마라.
- solution은 적분/미분 공식 + 수치 대입 명시. LaTeX inline 가능.
- 회로 도식·파형 다시 만들지 마라. 코드가 logic_network 아니라 analog_netlist + waveform 자동 생성.
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
  let parsed: Partial<OpampTimeDomainTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<OpampTimeDomainTextOutput>; }
  catch (e) { throw new Error(`OpampTimeDomain text JSON 파싱 실패: ${String(e)}`); }

  if (parsed.answer && !looksLikeSameAnswer(parsed.answer, answer.Vout)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: answerString });
  }

  return {
    content: parsed.content ?? "주어진 시간영역 OPAMP 회로를 분석하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? questionPhrase,
    answer: answerString,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function looksLikeSameAnswer(text: string, expected: number): boolean {
  const m = text.match(/-?\d+(?:\.\d+)?/);
  if (!m) return false;
  return Math.abs(parseFloat(m[0]) - expected) < 0.01;
}
