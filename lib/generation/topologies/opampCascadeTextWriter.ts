import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { OpampCascadeGeneration } from "./opampCascade";

const log = createLogger("lib/generation/topologies/opampCascadeTextWriter");

export type OpampCascadeTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * 임용 10번 (2-OPAMP cascade) 3 단계 textWriter.
 *
 *   [단계 1] V_s/V_o = -R_5/R_4
 *   [단계 2] V_o/V_i = -R_3/R_1
 *   [단계 3] V_s/V_i = (R_3·R_5)/(R_1·R_4)
 */
export async function writeOpampCascadeText(args: {
  generation: OpampCascadeGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<OpampCascadeTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { values: v, answer: a } = generation;

  const userPrompt = `다음 정보로 임용 10번 형식의 "2-OPAMP cascade 응용 회로" 문제를 작성하세요.
회로도는 코드가 결정 — 너는 본문+조건+질문+풀이만 작성.

[회로 — (가) 단일 figure]
- V_i: 좌측 AC 전압원 (입력)
- U_1·U_2: 2개 연산증폭기, 안정한 선형영역에서 동작. 입력 임피던스 무한대, 출력 임피던스 영(0).
- R_1 = ${v.R_1} kΩ: V_i → V⁻(U_1)
- R_2 = ${v.R_2} kΩ: V⁻(U_1) → GND (bias)
- R_3 = ${v.R_3} kΩ: V⁻(U_1) → V_o (U_1 feedback)
- R_4 = ${v.R_4} kΩ: V_o → V⁻(U_2)
- R_5 = ${v.R_5} kΩ: V⁻(U_2) → V_s (U_2 feedback)
- R_6 = ${v.R_6} kΩ: V⁻(U_2) → GND (bias)
- V⁺(U_1)·V⁺(U_2): 모두 GND
- V_o: U_1 출력 (중간 노드), V_s: U_2 출력 (최종 출력)

[솔버 결과 — 변경 금지]
  [단계 1] V_s/V_o = -R_5/R_4 = ${a.Vs_over_Vo}
  [단계 2] V_o/V_i = -R_3/R_1 = ${a.Vo_over_Vi}
  [단계 3] V_s/V_i = (V_s/V_o)·(V_o/V_i) = (R_3·R_5)/(R_1·R_4) = ${a.Vs_over_Vi}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "본문 한 단락. '그림은 연산증폭기 응용 회로이다. 제시된 <해석 절차>에 따라 단계별로 풀이 과정과 결과를 서술하시오. (단, 연산증폭기는 안정한 선형영역에서 동작하며 입력 임피던스는 무한대, 출력 임피던스는 영(0)이다.)' 류로 자연스러운 한국어.",
  "conditions": ["R_1 = ${v.R_1} kΩ, R_2 = ${v.R_2} kΩ", "R_3 = ${v.R_3} kΩ, R_4 = ${v.R_4} kΩ", "R_5 = ${v.R_5} kΩ, R_6 = ${v.R_6} kΩ", "OPAMP 이상적 (linear region, R_in=∞, R_out=0)", "V⁺(U_1)·V⁺(U_2) 모두 GND"],
  "question":   "[단계 1] 회로의 V_s/V_o를 R_4와 R_5의 값을 이용하여 구하시오.\\n[단계 2] 회로의 V_o/V_i를 R_1과 R_3의 값을 이용하여 구하시오.\\n[단계 3] 단계 1과 단계 2에서 구한 결과를 이용하여 V_s/V_i를 구하시오.",
  "answer":     "[단계 1] V_s/V_o = -R_5/R_4 = ${a.Vs_over_Vo}\\n[단계 2] V_o/V_i = -R_3/R_1 = ${a.Vo_over_Vi}\\n[단계 3] V_s/V_i = (R_3·R_5)/(R_1·R_4) = ${a.Vs_over_Vi}",
  "solution":   "[단계 1] U_2 단계 분석. 이상 OPAMP는 V⁻=V⁺=GND (virtual ground). V⁻(U_2)에 KCL: (V_o − 0)/R_4 + (V_s − 0)/R_5 = 0 → V_s = -(R_5/R_4)·V_o → V_s/V_o = -R_5/R_4 = ${a.Vs_over_Vo}. (R_2, R_6는 이상 OPAMP에서 영향 없음 — V⁻=0이므로 R_2·R_6 양단 전압 모두 0)\\n[단계 2] U_1 단계 동일 분석. V⁻(U_1) = 0 virtual ground. KCL: (V_i − 0)/R_1 + (V_o − 0)/R_3 = 0 → V_o = -(R_3/R_1)·V_i → V_o/V_i = -R_3/R_1 = ${a.Vo_over_Vi}.\\n[단계 3] V_s/V_i = (V_s/V_o)·(V_o/V_i) = (-R_5/R_4)·(-R_3/R_1) = (R_3·R_5)/(R_1·R_4) = ${a.Vs_over_Vi}."
}

[엄수 규칙]
- 회로도 다시 만들지 마라. 코드가 처리.
- 솔버 값 그대로. 다른 수치 금지.
- solution은 자연스러운 한국어. virtual ground (V⁻=V⁺=GND), KCL, ideal OPAMP 키워드 포함.
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
  let parsed: Partial<OpampCascadeTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<OpampCascadeTextOutput>; }
  catch (e) { throw new Error(`OpampCascade text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계 1] V_s/V_o = -R_5/R_4 = ${a.Vs_over_Vo}\n[단계 2] V_o/V_i = -R_3/R_1 = ${a.Vo_over_Vi}\n[단계 3] V_s/V_i = (R_3·R_5)/(R_1·R_4) = ${a.Vs_over_Vi}`;

  if (parsed.solution) {
    const sol = parsed.solution;
    const missing: string[] = [];
    if (!/virtual ground|가상 ?접지|V[⁻−]=V[⁺+]|V⁻=0/i.test(sol)) missing.push("virtual_ground");
    if (!/KCL|키르히호프|키.프히호프/i.test(sol)) missing.push("kcl");
    if (!/OPAMP|연산증폭기|U_?1|U_?2/i.test(sol)) missing.push("opamp");
    if (missing.length > 0) {
      log.warn("opamp_cascade_solution_keywords", { missing, preview: sol.slice(0, 160) });
    }
  }

  return {
    content: parsed.content ?? "2-OPAMP cascade 응용 회로 문제 (임용 10번)",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1] V_s/V_o. [단계 2] V_o/V_i. [단계 3] V_s/V_i.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
