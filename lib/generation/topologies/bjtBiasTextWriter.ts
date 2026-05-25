import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { BjtBiasGeneration, BjtBiasSingleGeneration, BjtBiasMirrorDiffGeneration } from "./bjtBias";

const log = createLogger("lib/generation/topologies/bjtBiasTextWriter");

export type BjtBiasTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeBjtBiasText(args: {
  generation: BjtBiasGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<BjtBiasTextOutput> {
  if (args.generation.kind === "mirror_diff") {
    return writeBjtMirrorDiffText({ ...args, generation: args.generation });
  }
  return writeBjtSingleBiasText({ ...args, generation: args.generation });
}

async function writeBjtSingleBiasText(args: {
  generation: BjtBiasSingleGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<BjtBiasTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const a = generation.answer;
  const rhoSci = v.rho.toExponential();
  const aSci = v.A_m2.toExponential();
  const lSci = v.L_m.toExponential();

  const userPrompt = `다음은 임용 7번 형식의 "직류 바이어스된 BJT 회로" 문제이다.
회로는 코드가 이미 결정 — 너는 문제 문장과 단계별 풀이만 작성.

[회로]
직류 전압원 V_CC = ${v.V_CC} V.
R_A(점선 박스, 베이스 위 placeholder) + R_B(베이스 아래) 분압기.
R_C(컬렉터 위) + BJT + R_E(이미터 아래).
V_BE = 0.7 V, I_E ≈ I_C 가정.

[주어진 값]
R_A = ${v.R_A_kohm} kΩ (단계 1)
R_C = ${v.R_C_kohm} kΩ, R_E = ${v.R_E_kohm} kΩ
단계 1 이미터 전압 V_E = ${v.V_E_given} V
단계 2 저항률 ρ = ${rhoSci} Ω·m, 단면적 A = ${aSci} m², 길이 ℓ = ${lSci} m

[솔버 결과 — 변경 금지]
[단계 1] V_B = V_E + V_BE = ${(v.V_E_given + v.V_BE).toFixed(2)} V → R_B = R_A · V_B / (V_CC − V_B) = ${a.R_B_kohm} kΩ
[단계 2] R_A' = ρ · ℓ / A = ${a.R_A_prime_kohm} kΩ
[단계 3] R_A → R_A' 교체 후 새 V_B → I_C = ${a.I_C_mA} mA, V_O = ${a.V_O} V

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림은 직류 바이어스된 쌍극성 접합 트랜지스터(BJT: Bipolar Junction Transistor) 회로이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 해석상 베이스단의 부하 효과는 무시하고, I_E = I_C, V_BE = 0.7 V로 한다. 또한, 저항률(resistivity) ρ는 온도에 의한 영향이 없다고 가정한다.)",
  "conditions": ["V_BE = 0.7 V, I_E = I_C 가정", "베이스단 부하 효과 무시", "저항률 ρ는 온도 무관", "V_CC = ${v.V_CC} V, R_C = ${v.R_C_kohm} kΩ, R_E = ${v.R_E_kohm} kΩ"],
  "question":   "[단계 1] 점선 내부의 저항 R_A = ${v.R_A_kohm} [kΩ]일 때, 이미터 전압 V_E = ${v.V_E_given} [V]이다. 이때의 저항 R_B [kΩ]를 구하시오.\\n[단계 2] 저항률 ρ = ${rhoSci} [Ω·m], 단면적은 ${aSci} [m²], 길이는 ${lSci} [m]인 저항 R_A' [kΩ]을 구하시오.\\n[단계 3] R_A를 [단계 2]에서 구한 R_A'으로 교체한 후, [단계 1]에서 구한 R_B를 이용하여 컬렉터 전류 I_C [mA]와 출력 전압 V_O [V]를 각각 구하시오.",
  "answer":     "[단계1] R_B = ${a.R_B_kohm} kΩ\\n[단계2] R_A' = ${a.R_A_prime_kohm} kΩ\\n[단계3] I_C = ${a.I_C_mA} mA, V_O = ${a.V_O} V",
  "solution":   "[단계1] 베이스 전류 무시 시 베이스 전위 V_B = V_E + V_BE = ${v.V_E_given} + 0.7 = ${(v.V_E_given + v.V_BE).toFixed(2)} V. 분압기 공식 V_B = V_CC · R_B/(R_A + R_B) → R_B = R_A · V_B / (V_CC − V_B) = ${v.R_A_kohm} · ${(v.V_E_given + v.V_BE).toFixed(2)} / (${v.V_CC} − ${(v.V_E_given + v.V_BE).toFixed(2)}) ≈ ${a.R_B_kohm} kΩ.\\n[단계2] R_A' = ρ · ℓ / A = ${rhoSci} · ${lSci} / ${aSci} = ${(v.rho * v.L_m / v.A_m2).toFixed(0)} Ω = ${a.R_A_prime_kohm} kΩ.\\n[단계3] R_A → R_A' 후 새 V_B = V_CC · R_B/(R_A' + R_B). 새 V_E = V_B − 0.7. I_C ≈ V_E / R_E = ${a.I_C_mA} mA. V_O = V_CC − I_C · R_C = ${a.V_O} V."
}

[규칙]
- 솔버 값 그대로. R_B, R_A', I_C, V_O 수치를 다른 값으로 바꾸지 마라.
- 회로 figure 다시 만들지 마라. 코드가 처리.
- small signal hybrid-π 모델 사용 금지 (DC bias 분석만).
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
  let parsed: Partial<BjtBiasTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<BjtBiasTextOutput>; }
  catch (e) { throw new Error(`BjtBias text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계1] R_B = ${a.R_B_kohm} kΩ\n[단계2] R_A' = ${a.R_A_prime_kohm} kΩ\n[단계3] I_C = ${a.I_C_mA} mA, V_O = ${a.V_O} V`;
  if (parsed.answer && !parsed.answer.includes(String(a.R_B_kohm))) {
    log.warn("bjt_bias_answer_mismatch", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "직류 바이어스된 BJT 회로 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "단계 1·2·3을 풀이하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

/**
 * 전류미러 + 차동증폭기 (multi-BJT) 문제 텍스트 생성.
 *
 * 임용 7번 multi-BJT 형식 — Q1·Q5 mirror + Q2·Q3 diff pair.
 * 솔버가 강제한 수치(I_1·I_5·V_O_balanced·V_O_perturbed)는 변경 금지.
 */
async function writeBjtMirrorDiffText(args: {
  generation: BjtBiasMirrorDiffGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<BjtBiasTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const a = generation.answer;

  const userPrompt = `다음은 임용 7번 형식의 "전류미러로 바이어스된 BJT 차동증폭기" 문제이다.
회로는 코드가 이미 결정 — 너는 문제 문장과 단계별 풀이만 작성.

[회로]
NPN BJT 4개로 구성: Q1·Q5(전류미러, 두 emitter는 V_2에 공통), Q2·Q3(차동쌍, 두 emitter는 V_tail에 공통, Q5.C에 연결).
직류 전원 V_CC = ${v.V_CC} V (위쪽), V_2 = ${v.V_2} V (전류미러 양 emitter 공통전원).
저항: R_1 = ${v.R_1_kohm} kΩ(V_CC→Q1.C), R_2 = ${v.R_2_kohm} kΩ(V_CC→Q2.C), R_3 = ${v.R_3_kohm} kΩ(V_CC→Q3.C=V_o).
Q1은 diode-connected (C·B 단락) — 전류미러 reference.
입력: V_1 = Q2.B 전위 (가변), Q3.B = GND (접지 기준).
가정: 모든 트랜지스터 동일 특성, V_BE = ${v.V_BE} V, β = ${v.beta}, Early(V_A) 무시.

[솔버 결과 — 변경 금지, 소수점 셋째자리 이하 절사]
[단계 1] V_B1 = V_2 + V_BE = ${(v.V_2 + v.V_BE).toFixed(2)} V (Q1 diode-connected).
         I_1 = (V_CC − V_B1) / R_1 = (${v.V_CC} − ${(v.V_2 + v.V_BE).toFixed(2)}) / ${v.R_1_kohm} = ${a.I_1_mA} mA
[단계 2] Q5 mirror 1:1 → I_5 = I_1 = ${a.I_5_mA} mA (차동쌍 tail 전류)
[단계 3] V_1 = ${v.V_1_initial} V (balanced, V_1 = Q3.B = 0): I_3 = I_5/2 = ${a.I_3_balanced_mA} mA, V_O = ${v.V_CC} − I_3·R_3 = ${a.V_O_balanced} V
         V_1 = ${v.V_1_perturbed} V (perturbed): |V_B2 − V_B3| = ${Math.abs(v.V_1_perturbed)} V ≫ 4·V_T(≈0.1V) → 차동쌍 완전 switch.
         Q2 off, Q3가 tail 전체 carry → I_3 = I_5 = ${a.I_3_perturbed_mA} mA, V_O = ${v.V_CC} − I_5·R_3 = ${a.V_O_perturbed} V

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림은 전류미러(current mirror) Q_1, Q_5로 바이어스된 차동증폭기 회로이다. 회로에서 입력전압 V_1[V]의 변화에 따른 직류 전류 I_5[mA]와 전압 V_o[V]를 구하려고 한다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 모든 트랜지스터는 동일한 특성을 가지며, V_BE = ${v.V_BE} V, β = ${v.beta}, Early 전압은 무시한다. 각 단계에서의 결과는 소수점 셋째자리 이하를 절사한다.)",
  "conditions": ["모든 트랜지스터 동일 특성", "V_BE = ${v.V_BE} V, β = ${v.beta}", "Early(V_A) 무시", "소수점 셋째자리 이하 절사", "V_CC = ${v.V_CC} V, V_2 = ${v.V_2} V", "R_1 = ${v.R_1_kohm} kΩ, R_2 = ${v.R_2_kohm} kΩ, R_3 = ${v.R_3_kohm} kΩ"],
  "question":   "[단계 1] 저항 R_1에 흐르는 전류 I_1 [mA]을 구하시오.\\n[단계 2] [단계 1]에서 구한 I_1을 이용하여 전류미러 출력(차동쌍 tail) 전류 I_5 [mA]를 구하시오.\\n[단계 3] [단계 2]에서 구한 I_5를 이용하여 V_1 = ${v.V_1_initial} V일 때 Q_3의 컬렉터 전류 I_3 [mA]와 출력전압 V_o [V]를 구하고, V_1의 값이 ${v.V_1_perturbed} V로 바뀌었을 때 V_o [V]를 구하시오.",
  "answer":     "[단계1] I_1 = ${a.I_1_mA} mA\\n[단계2] I_5 = ${a.I_5_mA} mA\\n[단계3] V_1=${v.V_1_initial}V일 때 I_3 = ${a.I_3_balanced_mA} mA, V_o = ${a.V_O_balanced} V; V_1=${v.V_1_perturbed}V일 때 V_o = ${a.V_O_perturbed} V",
  "solution":   "[단계1] Q_1은 다이오드 접속(C·B 단락)이므로 V_B1 = V_E1 + V_BE = V_2 + V_BE = ${v.V_2} + ${v.V_BE} = ${(v.V_2 + v.V_BE).toFixed(2)} V. R_1을 흐르는 전류 I_1 = (V_CC − V_B1) / R_1 = (${v.V_CC} − ${(v.V_2 + v.V_BE).toFixed(2)}) / ${v.R_1_kohm} = ${a.I_1_mA} mA.\\n[단계2] 전류미러는 V_BE1 = V_BE5이므로 I_C5 = I_C1 = I_1. 따라서 I_5 = ${a.I_5_mA} mA (차동쌍 tail 전류).\\n[단계3] V_1 = ${v.V_1_initial} V일 때 V_B2 = V_B3 = 0 (균형) → I_C2 = I_C3 = I_5/2 = ${a.I_3_balanced_mA} mA. V_o = V_CC − I_C3·R_3 = ${v.V_CC} − ${a.I_3_balanced_mA}·${v.R_3_kohm} = ${a.V_O_balanced} V. 한편 V_1 = ${v.V_1_perturbed} V일 때 |V_B2 − V_B3| = ${Math.abs(v.V_1_perturbed)} V는 열전압 V_T(≈0.025 V)의 수배보다 훨씬 커 차동쌍이 완전히 한쪽으로 switch된다. Q_2는 cutoff, Q_3가 tail 전류 전체를 흘리므로 I_C3 = I_5 = ${a.I_3_perturbed_mA} mA. V_o = V_CC − I_5·R_3 = ${v.V_CC} − ${a.I_3_perturbed_mA}·${v.R_3_kohm} = ${a.V_O_perturbed} V."
}

[규칙]
- 솔버 값 그대로. I_1, I_5, I_3, V_o 수치를 다른 값으로 바꾸지 마라.
- 회로 figure 다시 만들지 마라. 코드가 처리.
- 소수점 셋째자리 이하 절사 규칙 유지.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2200,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<BjtBiasTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<BjtBiasTextOutput>; }
  catch (e) { throw new Error(`BjtBias mirror_diff text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계1] I_1 = ${a.I_1_mA} mA\n[단계2] I_5 = ${a.I_5_mA} mA\n[단계3] V_1=${v.V_1_initial}V일 때 I_3 = ${a.I_3_balanced_mA} mA, V_o = ${a.V_O_balanced} V; V_1=${v.V_1_perturbed}V일 때 V_o = ${a.V_O_perturbed} V`;
  if (parsed.answer && !parsed.answer.includes(String(a.I_1_mA))) {
    log.warn("bjt_mirror_diff_answer_mismatch", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "전류미러 + BJT 차동증폭기 회로 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "단계 1·2·3을 풀이하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
