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
  cascade: "2단 OPAMP cascade (첫 단 반전 증폭 → 둘째 단 가산형 반전)",
  inverting_finite_gain: "유한 개방 루프 이득 A(s)를 갖는 반전 증폭기 + 블록도 (임용 11번 형식)",
  positive_feedback: "정귀환 (positive feedback) OPAMP 응용회로 — SW step + V+ 피드백 (임용 6번 형식)",
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

  // inverting_finite_gain은 별도 prompt — 이상 OPAMP 가정이 아니라 finite-gain A(s) 풀이
  if (archetype === "inverting_finite_gain") {
    return writeFiniteGainText({ generation, mode, topicLabel, contextHint });
  }
  // positive_feedback (임용 6번) 별도 prompt
  if (archetype === "positive_feedback") {
    return writePositiveFeedbackText({ generation, mode, topicLabel, contextHint });
  }

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

/**
 * inverting_finite_gain (임용 11번) 전용 textWriter — A(s) finite-gain 회로 + 블록도 단계별 풀이.
 *  [단계1] 중첩의 원리: V- = αV_in + βV_out, α=R2/(R1+R2), β=R1/(R1+R2)
 *  [단계2] A_v = V_out/V_in = -α·A(s)/(1+β·A(s))
 *  [단계3] R_1, R_2, A_0, V_in 대입 → V_out [mV]
 */
async function writeFiniteGainText(args: {
  generation: OpampGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<OpampTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const R1k = v.R_1_kohm;
  const R2k = v.R_2_kohm;
  const A0 = v.A_0;
  const Vin = v.V_in;
  const alpha = v.alpha;
  const beta_ = v.beta;
  const Av_dc = v.Av_dc;
  const Vout = generation.Vout;
  const VoutMv = Vout * 1000;

  const userPrompt = `다음은 임용 11번 형식의 "유한 개방 루프 이득 A(s)를 갖는 OPAMP 응용 회로" 문제이다.
회로(가)·블록도(나)는 코드가 이미 결정 — 너는 문제 문장과 단계별 풀이만 작성.

[그림 (가) 회로]
V_in → R_1 → V−, V− → A(s) OPAMP → V_out, V_out → R_2 → V− (피드백). V+ = GND.
외부 입력 V_in은 단자 핀으로 표기 (전압원 박스 없음).

[그림 (나) 블록도]
V_in → α → ⊕ → A(s) → V_out, V_out → β → ⊕ (피드백)

[OPAMP 특성]
A(s) = A_0·ω_0/(s+ω_0). A_0 = ${A0} (직류 이득). 입력 임피던스 ∞, 출력 임피던스 0.

[값]
R_1 = ${R1k} kΩ, R_2 = ${R2k} kΩ, V_in = ${Vin} V

[솔버 결과 — 변경 금지]
α = R_2/(R_1+R_2) = ${alpha.toFixed(4)}
β = R_1/(R_1+R_2) = ${beta_.toFixed(4)}
A_v(DC) = -α·A_0/(1+β·A_0) = ${Av_dc.toFixed(3)}
V_out ≈ ${Vout} V (= ${VoutMv.toFixed(2)} mV)

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림 (가)는 연산 증폭기 응용 회로이며, 그림 (나)는 (가)의 블록도이다. 제시된 <해석 절차>에 따라 각 단계별 풀이 과정과 함께 결과를 서술하시오. (단, 연산 증폭기의 개방 루프 이득 A(s) = V_out/(V+ − V−) = A_0·ω_0/(s+ω_0)이며, s는 복소 주파수, A_0는 직류 이득, ω_0는 차단 주파수이다. 또한, 연산 증폭기의 입력 임피던스는 무한대, 출력 임피던스는 영(0)이라 가정한다.)",
  "conditions": ["A(s) = A_0·ω_0/(s+ω_0), 입력 임피던스 ∞, 출력 임피던스 0", "V+ = GND, R_1 입력 저항, R_2 피드백 저항", "V_in은 외부 입력 단자"],
  "question":   "[단계 1] 중첩의 원리를 적용하여 반전 입력 단자의 전압을 V− = α·V_in + β·V_out으로 쓸 때, R_1과 R_2로 표현되는 α와 β를 각각 구하시오.\\n[단계 2] A(s) = A_0·ω_0/(s+ω_0)과 단계 1에서 구한 V−를 이용해서 V_out = A_v·V_in으로 쓸 때, α, β 및 A(s)로 표현되는 A_v를 구하시오.\\n[단계 3] 회로에서 R_1 = ${R1k}[kΩ], R_2 = ${R2k}[kΩ], A_0 = ${A0.toExponential()}, V_in = ${Vin}[V]일 때, V_out[mV]를 구하시오. (단, 결과는 소수점 이하 둘째 자리에서 반올림하여 첫째 자리까지 쓰시오.)",
  "answer":     "[단계1] α = R_2/(R_1+R_2) = ${alpha.toFixed(4)}, β = R_1/(R_1+R_2) = ${beta_.toFixed(4)}\\n[단계2] A_v = -α·A(s)/(1+β·A(s))\\n[단계3] V_out ≈ ${VoutMv.toFixed(1)} [mV]",
  "solution":   "[단계1] V_in 단독(V_out 단락)일 때 V−의 V_in 기여분: V−|V_in = R_2/(R_1+R_2)·V_in = α·V_in (전압 분배). V_out 단독(V_in 단락)일 때 V−|V_out = R_1/(R_1+R_2)·V_out = β·V_out. 중첩하면 V− = α·V_in + β·V_out.\\n[단계2] V+ = 0이므로 V_out = A(s)·(V+ − V−) = -A(s)·V− = -A(s)·(α·V_in + β·V_out). 정리하면 V_out·(1 + β·A(s)) = -α·A(s)·V_in. 따라서 A_v = V_out/V_in = -α·A(s)/(1 + β·A(s)).\\n[단계3] 입력이 DC이므로 s→0, A(s) → A_0. α = ${R2k}/${R1k + R2k} = ${alpha.toFixed(4)}, β = ${R1k}/${R1k + R2k} = ${beta_.toFixed(4)}. A_v ≈ -α·A_0/(1+β·A_0) = -${alpha.toFixed(4)}·${A0.toExponential()}/(1 + ${beta_.toFixed(4)}·${A0.toExponential()}) = ${Av_dc.toFixed(3)}. V_out = A_v·V_in = ${Av_dc.toFixed(3)}·${Vin} = ${Vout} V ≈ ${VoutMv.toFixed(1)} mV."
}

[규칙]
- answer는 솔버 값 그대로. 다른 값으로 바꾸지 마라.
- 회로/블록도 figure 다시 만들지 마라. 코드가 처리.
- α, β, A_v 공식은 위 [솔버 결과] 그대로 유지.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1800,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<OpampTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<OpampTextOutput>; }
  catch (e) { throw new Error(`OpampFiniteGain text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계1] α = ${alpha.toFixed(4)}, β = ${beta_.toFixed(4)}\n[단계2] A_v = -α·A(s)/(1+β·A(s))\n[단계3] V_out ≈ ${VoutMv.toFixed(1)} [mV]`;
  if (parsed.answer && !parsed.answer.includes(VoutMv.toFixed(1))) {
    log.warn("finite_gain_answer_mismatch", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "유한 개방 루프 이득 A(s)를 갖는 OPAMP 응용 회로 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "단계 1·2·3을 풀이하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

/**
 * positive_feedback (임용 6번) 전용 textWriter — 정귀환 OPAMP, SW step 입력, K 상수 도출.
 *  [단계 1] β = R_1/(R_1+R_2)
 *  [단계 2] V_out/V−(s) = B·ω_0/(s+D·ω_0), B·D를 β·A_0로 표현
 *  [단계 3] V−(s)=1/s → V_out(s) = K·(1/s − 1/(s+D·ω_0)), K = B/D
 */
async function writePositiveFeedbackText(args: {
  generation: OpampGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<OpampTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const R1k = v.R_1_kohm;
  const R2k = v.R_2_kohm;
  const A0 = v.A_0;
  const beta_ = v.beta;
  const B = v.B;
  const D = v.D;
  const K = v.K;

  const userPrompt = `다음은 임용 6번 형식의 "정귀환(positive feedback) OPAMP 응용회로" 문제이다.
회로는 코드가 이미 결정 — 너는 문제 문장과 단계별 풀이만 작성.

[그림 (가) 회로]
입력 V_in(=1V)은 스위치 SW(t=0 닫힘)를 거쳐 V−에 인가.
V+ → R_1 → GND (V+ 전압 분배 leg).
V_out → R_2 → V+ (★ V_out이 V+로 피드백 — positive feedback).
A(s) = A_0·ω_0/(s+ω_0). 입력 임피던스 ∞, 출력 임피던스 0.

[값]
R_1 = ${R1k} kΩ, R_2 = ${R2k} kΩ, A_0 = ${A0.toExponential()}

[솔버 결과 — 변경 금지]
β = R_1/(R_1+R_2) = ${beta_.toFixed(4)}
B = −A_0 = ${B.toExponential()}
D = 1 − β·A_0 = ${D.toExponential()}
K = B/D = ${K.toFixed(3)}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림은 정귀환(positive feedback)이 가해진 연산 증폭기 응용 회로이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 연산 증폭기의 개방 루프 이득(open loop gain)은 V_out/(V+ − V−) = A(s) = A_0·ω_0/(s+ω_0)으로 나타내며, s는 복소 주파수, A_0·ω_0는 이득-대역폭 곱이고, 입력 임피던스는 무한대, 출력 임피던스는 영(0)이라 가정한다.)",
  "conditions": ["A(s) = A_0·ω_0/(s+ω_0), 입력 임피던스 ∞, 출력 임피던스 0", "R_1: V+ → GND, R_2: V_out → V+ (정귀환)", "SW가 t=0에 닫혀 V_in이 V−에 인가"],
  "question":   "[단계 1] 비반전 입력 단자의 전압을 V+ = β·V_out으로 쓸 때, R_1과 R_2로 표현되는 β를 구하시오.\\n[단계 2] A(s) = A_0·ω_0/(s+ω_0)와 [단계 1]에서 구한 V+를 이용하여 V_out/V−(s) = B·ω_0/(s + D·ω_0)로 쓸 때, B와 D를 β와 A_0로 표현하여 각각 구하시오.\\n[단계 3] 시간 t=0에 스위치 SW가 닫혀서 V−(s) = 1/s일 때, [단계 2]를 이용하여 출력을 구하는 식 V_out(s) = K·(1/s − 1/(s+D·ω_0))의 상수 K를 구하시오. (단, A_0 = ${A0.toExponential()}, D = ${D.toExponential()}로 가정한다.)",
  "answer":     "[단계1] β = R_1/(R_1+R_2) = ${beta_.toFixed(4)}\\n[단계2] B = −A_0, D = 1 − β·A_0\\n[단계3] K = B/D = ${K.toFixed(3)}",
  "solution":   "[단계1] V+ 노드에서 R_1과 R_2가 V+를 V_out와 GND 사이의 전압 분배기로 묶음. V+ = V_out · R_1/(R_1+R_2) = β·V_out, β = R_1/(R_1+R_2) = ${beta_.toFixed(4)}.\\n[단계2] V_out = A(s)·(V+ − V−) = A(s)·(β·V_out − V−). 정리하면 V_out·(1 − β·A(s)) = −A(s)·V−. V_out/V−(s) = −A(s)/(1 − β·A(s)) = −A_0·ω_0 / ((s+ω_0)·(1 − β·A_0·ω_0/(s+ω_0))) = −A_0·ω_0 / (s + (1 − β·A_0)·ω_0) = B·ω_0/(s + D·ω_0). ∴ B = −A_0, D = 1 − β·A_0.\\n[단계3] V−(s) = 1/s 대입 → V_out(s) = B·ω_0 / (s·(s + D·ω_0)) = (B/D)·(1/s − 1/(s+D·ω_0)) = K·(1/s − 1/(s+D·ω_0)). K = B/D = −A_0/(1 − β·A_0) = ${K.toFixed(3)}."
}

[규칙]
- 솔버 값 그대로. β·B·D·K 식을 다른 표현으로 바꾸지 마라.
- 회로 figure 다시 만들지 마라. 코드가 처리.
- positive feedback 핵심: V_out → V+ 피드백, ideal OPAMP 가정 금지 (open-loop gain A_0 finite).
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1800,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<OpampTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<OpampTextOutput>; }
  catch (e) { throw new Error(`OpampPositiveFeedback text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계1] β = ${beta_.toFixed(4)}\n[단계2] B = −A_0, D = 1 − β·A_0\n[단계3] K = ${K.toFixed(3)}`;
  if (parsed.answer && !parsed.answer.includes(K.toFixed(3).slice(0, 4))) {
    log.warn("positive_fb_answer_mismatch", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "정귀환 OPAMP 응용회로 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "단계 1·2·3을 풀이하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
