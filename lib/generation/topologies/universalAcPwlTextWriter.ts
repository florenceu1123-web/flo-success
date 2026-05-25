import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { UniversalAcPwlGeneration } from "./universalAcPwl";

const log = createLogger("lib/generation/topologies/universalAcPwlTextWriter");

export type UniversalAcPwlTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * 임용 6번 형식 (SW + 다이오드 + AC 클램프) 문제 텍스트 생성.
 *
 * 솔버가 강제한 수치(V_o@T/2·V_o@T·min/max)는 변경 금지.
 */
export async function writeUniversalAcPwlText(args: {
  generation: UniversalAcPwlGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<UniversalAcPwlTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const a = generation.answer;

  const userPrompt = `다음은 임용 6번 형식의 "스위치 + 다이오드 + 교류 입력 클램프 회로" 문제이다.
회로는 코드가 이미 결정 — 너는 문제 문장과 단계별 풀이만 작성.

[회로 구조]
교류 전원 v_i(t) = ${v.V_i_peak}sin(ωt) V (주기 T = ${v.T_ms} ms).
SW(단자1↔단자2) — t<0일 때 단자1, t=0일 때 단자2로 이동.
직류 클램프 전원 V_CC = ${v.V_CC} V (양 단자, +값).
직렬 캐패시터 C = ${v.C_uF} μF (입력측 ↔ 클램프 노드).
다이오드 D_1: anode = 클램프 노드, cathode = V_CC. 클램프 노드 ≥ V_CC일 때 ON.
다이오드 D_2: anode = GND, cathode = 클램프 노드. 클램프 노드 ≤ 0V일 때 ON.
부하저항 R_L = ${v.R_L_kohm} kΩ (클램프 노드 ↔ GND, V_o 측정점).

[가정]
- 다이오드 이상적 (순방향 전압 강하 0V)
- R_L에 의한 캐패시터 C의 방전 무시
- 각 단계 결과는 소수점 셋째자리 이하 절사

[솔버 결과 — 변경 금지]
[단계 1] V_o(t = T/2) = ${a.step1_Vo_at_halfT} V
[단계 2] V_o(t = T)   = ${a.step2_Vo_at_T} V
[단계 3] t ≥ T 정상상태에서 V_o(t)의 최댓값 = ${a.step3_Vo_max} V, 최솟값 = ${a.step3_Vo_min} V

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림은 스위치와 다이오드가 포함된 응용 회로이며, 교류 전원 v_i(t) = ${v.V_i_peak}sin(ωt) V는 주기 T = ${v.T_ms} ms를 가진다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, t<0일 때 회로는 정상 상태이며, t=0일 때 스위치는 단자1에서 단자2로 이동한다. 이상적으로 동작하는 다이오드 D_1과 D_2의 순방향 전압 강하는 영(0)으로 가정한다. R_L에 의한 캐패시터 C의 방전은 무시한다.)",
  "conditions": ["v_i(t) = ${v.V_i_peak}sin(ωt) V, T = ${v.T_ms} ms", "V_CC = ${v.V_CC} V, C = ${v.C_uF} μF, R_L = ${v.R_L_kohm} kΩ", "다이오드 이상적 (V_F = 0)", "R_L에 의한 C 방전 무시", "소수점 셋째자리 이하 절사"],
  "question":   "[단계 1] t = T/2일 때, V_o(t) [V]를 구하시오.\\n[단계 2] t = T일 때, V_o(t) [V]를 구하시오.\\n[단계 3] t ≥ T일 때, V_o(t) [V]의 최댓값과 최솟값을 각각 구하시오.",
  "answer":     "[단계1] V_o(T/2) = ${a.step1_Vo_at_halfT} V\\n[단계2] V_o(T) = ${a.step2_Vo_at_T} V\\n[단계3] 최댓값 = ${a.step3_Vo_max} V, 최솟값 = ${a.step3_Vo_min} V",
  "solution":   "[단계1] t<0에서 회로 정상 상태, t=0에 SW가 단자2로 이동하므로 V_i는 분리됨. 캐패시터 C에 저장된 전하와 클램프 다이오드(D_1, D_2)에 의해 V_o가 결정된다. t = T/2일 때 시뮬레이션 결과 V_o = ${a.step1_Vo_at_halfT} V.\\n[단계2] 한 주기가 지난 t = T에서도 클램프 동작이 지속되며 V_o = ${a.step2_Vo_at_T} V.\\n[단계3] t ≥ T 정상상태에서는 V_o가 D_2 → 0 V (최솟값)과 D_1 → V_CC = ${v.V_CC} V (최댓값) 사이에서 클램프된다. 시뮬 결과 최댓값 = ${a.step3_Vo_max} V, 최솟값 = ${a.step3_Vo_min} V."
}

[규칙]
- 솔버 값 그대로. V_o 수치를 다른 값으로 바꾸지 마라.
- 회로 figure 다시 만들지 마라. 코드가 처리.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2000,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<UniversalAcPwlTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<UniversalAcPwlTextOutput>; }
  catch (e) { throw new Error(`UniversalAcPwl text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계1] V_o(T/2) = ${a.step1_Vo_at_halfT} V\n[단계2] V_o(T) = ${a.step2_Vo_at_T} V\n[단계3] 최댓값 = ${a.step3_Vo_max} V, 최솟값 = ${a.step3_Vo_min} V`;
  if (parsed.answer && !parsed.answer.includes(String(a.step1_Vo_at_halfT))) {
    log.warn("universal_ac_pwl_answer_mismatch", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "스위치와 다이오드가 포함된 교류 클램프 회로 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "단계 1·2·3을 풀이하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
