import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { BjtBiasGeneration } from "./bjtBias";

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
