import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { TheveninSwitchedRcGeneration } from "./theveninSwitchedRc";

const log = createLogger("lib/generation/topologies/theveninSwitchedRcTextWriter");

export type TheveninSwitchedRcTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * 임용 9번 정보과 (Thevenin + Switched RC) — 3 단계 풀이 textWriter.
 *
 *   [단계 1] t<0 (SW=단자1) 정상상태 → v_o(0⁻) = V_s (C 양단)
 *   [단계 2] (나)의 V_Th, R_Th 도출
 *   [단계 3] t≥0 (SW=단자2) → v_o(t) RC step response
 */
export async function writeTheveninSwitchedRcText(args: {
  generation: TheveninSwitchedRcGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<TheveninSwitchedRcTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { values: v, answer: a } = generation;

  const userPrompt = `다음 정보로 임용 9번 정보과 형식의 "스위치 + RC + Thevenin 등가" 회로 문제를 작성하세요.
2개 figure는 코드가 결정 — 너는 본문+조건+질문+풀이만 작성.

[회로 (가) — 코드가 figure 생성]
- V_s = ${v.V_s} V (좌측 DC 전압원)
- R_top = ${v.R_top} Ω (V_s ↔ 노드 a 사이 직렬)
- C_1 = ${v.C_1} F (노드 a → GND, v_o 측정 위치)
- C_2 = ${v.C_2} F (C_1과 병렬, 노드 a 영역 → GND)
- SW (SPDT): 단자1(좌, 노드 a) ↔ 단자2(우, 점선박스 입력 b)
  · t<0: SW=단자1 (점선박스 분리)
  · t=0: SW=단자2로 이동 (점선박스 연결)
- 점선박스 내부 (Thevenin 대상):
  · R_a = ${v.R_a} Ω (가지 1의 horizontal R, b → 중간 노드)
  · R_b = ${v.R_b} Ω (가지 1의 vertical R, 중간 노드 → GND)
  · R_c = ${v.R_c} Ω (가지 2의 vertical R, b → GND 직접 병렬)
  · I_s = ${v.I_s} A (전류원, GND → b 방향)

[(나) Thevenin 등가회로]
- 좌측은 (가)와 동일 (V_s, R_top, SW, C_1, C_2)
- 우측: 점선박스 자리에 V_Th + R_Th 직렬

[솔버 결과 — 변경 금지]
  C_eq = C_1 + C_2 = ${a.C_eq} F
  V_Th = I_s · (R_a+R_b) ‖ R_c = ${a.V_Th} V
  R_Th = (R_a+R_b) ‖ R_c = ${a.R_Th} Ω
  τ = R_Th · C_eq = ${a.tau} sec
  v_o(0⁻) = V_s = ${a.v_o_0minus} V
  v_o(∞) = V_Th = ${a.v_o_inf} V
  v_o(t) = ${a.v_o_t_expr}  for t ≥ 0

[모드] ${mode === "exam_similar" ? "기출유사유형 (회로·문항 동일, 수치만 변경)" : "기출변형유형 (구조·원리 동일, 수치·소자 변형 가능)"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "본문 한 단락. (1) '그림 (가)는 스위치로 연결되는 ${v.C_1 + v.C_2 < 1 ? "직류" : ""} 전원이 포함된 RC 응용 회로이고, 그림 (나)는 (가)의 점선 부분을 테브난 등가회로로 나타낸 것이다' 류로 시작, (2) <해석 절차>에 따라 단계별로 풀이 과정과 결과 서술 지시. 자연스러운 한국어 한 단락.",
  "conditions": ["V_s = ${v.V_s} V, R_top = ${v.R_top} Ω", "C_1 = ${v.C_1} F, C_2 = ${v.C_2} F", "점선박스 내부: R_a = ${v.R_a} Ω, R_b = ${v.R_b} Ω, R_c = ${v.R_c} Ω, I_s = ${v.I_s} A", "SW: 단자1↔단자2 (t<0 단자1, t=0 단자2로 이동)", "t<0에서 회로는 직류 정상상태"],
  "question":   "[단계 1] 스위치가 단자1에 연결된 상태에서 정상상태에 도달했을 때, 커패시터 C_1의 전압 v_o(0⁻) [V]을 구하시오.\\n[단계 2] (나)에서 테브난 등가전압 V_Th [V]와 테브난 등가저항 R_Th [Ω]를 각각 구하시오.\\n[단계 3] 시각 t=0일 때, 스위치가 단자1에서 단자2로 이동했다. t≥0에서 커패시터 C_1의 전압 v_o(t) [V]를 구하시오.",
  "answer":     "[단계 1] v_o(0⁻) = ${a.v_o_0minus} V\\n[단계 2] V_Th = ${a.V_Th} V, R_Th = ${a.R_Th} Ω\\n[단계 3] v_o(t) = ${a.v_o_t_expr} [V]",
  "solution":   "[단계 1] t<0에서 SW=단자1이므로 점선박스가 분리되고 좌측 회로(V_s + R_top + C_1·C_2)만 활성화된다. 직류 정상상태에서 캐패시터는 개방(i=0)으로 동작하므로 R_top 양단 전압강하 0, 따라서 v_o(0⁻) = V_s = ${a.v_o_0minus} V.\\n[단계 2] (나)의 점선박스 자리에 단자 b에서 본 Thevenin 등가를 구한다. R_a, R_b 직렬 (R_a+R_b=${v.R_a + v.R_b}Ω) 가지와 R_c 가지가 b와 GND 사이에 병렬. I_s가 b로 유입. b의 개방전압: V_Th = I_s × [(R_a+R_b) ‖ R_c] = ${v.I_s} × ${a.R_Th} = ${a.V_Th} V. 모든 source 비활성 시 b↔GND 등가저항: R_Th = (R_a+R_b) ‖ R_c = ${a.R_Th} Ω.\\n[단계 3] t≥0에서 SW=단자2로 이동하므로 좌측 V_s+R_top과 우측 Thevenin(V_Th, R_Th) 회로가 SW를 통해 연결된다. C_eq = C_1+C_2 = ${a.C_eq} F. 좌측 분리/단순화 가정 시 v_o(∞) = V_Th = ${a.v_o_inf} V, 시정수 τ = R_Th·C_eq = ${a.tau} sec. RC step 응답: v_o(t) = v_o(∞) + [v_o(0⁻) − v_o(∞)]·exp(−t/τ) = ${a.v_o_t_expr} [V]."
}

[엄수 규칙]
- figure 다시 만들지 마라. 코드가 처리.
- 솔버 값 그대로. 다른 수치 금지.
- solution은 자연스러운 한국어. KVL·KCL·정상상태(C 개방) 키워드 포함.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2400,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<TheveninSwitchedRcTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<TheveninSwitchedRcTextOutput>; }
  catch (e) { throw new Error(`TheveninSwitchedRc text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계 1] v_o(0⁻) = ${a.v_o_0minus} V\n[단계 2] V_Th = ${a.V_Th} V, R_Th = ${a.R_Th} Ω\n[단계 3] v_o(t) = ${a.v_o_t_expr} [V]`;

  if (parsed.solution) {
    const sol = parsed.solution;
    const missing: string[] = [];
    if (!/V_?Th|R_?Th|테브난|테브닌/i.test(sol)) missing.push("thevenin");
    if (!/정상상태|steady state|i ?= ?0|개방/i.test(sol)) missing.push("steady_state");
    if (!/τ|시정수|시상수|time constant|RC/i.test(sol)) missing.push("rc_time_constant");
    if (missing.length > 0) {
      log.warn("thevenin_switched_rc_solution_keywords", { missing, preview: sol.slice(0, 160) });
    }
  }

  return {
    content: parsed.content ?? "스위치 + RC + Thevenin 등가 회로 문제 (임용 9번 정보과)",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1] v_o(0⁻). [단계 2] V_Th, R_Th. [단계 3] v_o(t).",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
