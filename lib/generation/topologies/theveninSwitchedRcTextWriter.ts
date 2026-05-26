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
 * 임용 9번 정보과 (Thevenin + Switched RC/RL) — 3 단계 풀이 textWriter.
 *
 *  componentMode === "RC" (exam_similar):
 *    [단계 1] t<0 SS → v_o(0⁻) = V_s·C_2/(C_1+C_2) (직렬 cap 전압분배)
 *    [단계 2] V_Th, R_Th
 *    [단계 3] t≥0 → v_o(t) RC step
 *
 *  componentMode === "RL" (exam_variant):
 *    [단계 1] t<0 SS → i_o(0⁻) = V_s/R_top (L short, closed loop current)
 *    [단계 2] V_Th, R_Th
 *    [단계 3] t≥0 → i_o(t) RL step
 */
export async function writeTheveninSwitchedRcText(args: {
  generation: TheveninSwitchedRcGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<TheveninSwitchedRcTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { values: v, answer: a, componentMode } = generation;

  // mode별 라벨/단위/측정변수
  const isRL = componentMode === "RL";
  const reactiveUnit = isRL ? "H" : "F";
  const reactiveSym1 = isRL ? "L_1" : "C_1";
  const reactiveSym2 = isRL ? "L_2" : "C_2";
  const measureSym = isRL ? "i_o" : "v_o";
  const measureUnit = isRL ? "A" : "V";
  const circuitType = isRL ? "RL" : "RC";
  const stepEqualityT0 = isRL
    ? `i_o(0⁻) = V_s/R_top = ${a.v_o_0minus} A  (t<0 closed loop, L 모두 short)`
    : `v_o(0⁻) = V_s·C_2/(C_1+C_2) = ${a.v_o_0minus} V  (V_s+C_2 직렬, 캐패시터 전압분배)`;
  const stepFormalDynamics = isRL
    ? `τ = L_1/R_Th = ${a.tau} sec, i_o(∞) = V_Th/R_Th = ${a.v_o_inf} A`
    : `τ = R_Th·C_1 = ${a.tau} sec, v_o(∞) = V_Th = ${a.v_o_inf} V`;

  const userPrompt = `다음 정보로 임용 9번 정보과 형식의 "스위치 + ${circuitType} + Thevenin 등가" 회로 문제를 작성하세요.
2개 figure는 코드가 결정 — 너는 본문+조건+질문+풀이만 작성.

[회로 (가) — 코드가 figure 생성]
- V_s = ${v.V_s} V (좌측 DC 전압원)
- R_top = ${v.R_top} Ω (V_s ↔ 노드 a 사이 직렬)
- ${reactiveSym1} = ${v.C_1} ${reactiveUnit} (노드 a → GND, ${measureSym} 측정 위치)
- ${reactiveSym2} = ${v.C_2} ${reactiveUnit} (V_s와 직렬, bottom rail에 위치)
- SW (SPDT, common = node a): 단자1=R_top측, 단자2=점선박스측
  · t<0: SW=단자1 (V_s + R_top + ${reactiveSym1} loop 활성)
  · t=0: SW=단자2로 이동 (Thevenin 활성, V_s 측 분리)
- 점선박스 내부:
  · R_a = ${v.R_a} Ω (b ↔ n_mid horizontal bridge)
  · R_b = ${v.R_b} Ω (b → GND vertical)
  · R_c = ${v.R_c} Ω (n_mid → GND vertical)
  · I_s = ${v.I_s} A (current source, n_mid로 유입)

[(나) Thevenin 등가회로]
좌측 (가)와 동일 + 우측 R_Th + V_Th 직렬 (점선박스 대체).

[솔버 결과 — 변경 금지]
  R_Th = R_b ‖ (R_a+R_c) = ${a.R_Th} Ω
  V_Th = I_s · R_b · R_c / (R_a+R_b+R_c) = ${a.V_Th} V
  ${stepEqualityT0}
  ${stepFormalDynamics}
  ${measureSym}(t) = ${a.v_o_t_expr}  for t ≥ 0  [${measureUnit}]

[모드] ${mode === "exam_similar" ? "기출유사유형 (RC 회로)" : "기출변형유형 (2 캐패시터를 2 인덕터로 교체한 RL 회로)"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "본문 한 단락. (1) '그림 (가)는 스위치로 연결되는 2개의 직류 전원이 포함된 ${circuitType} 응용 회로이고, 그림 (나)는 (가)의 점선 부분을 테브난 등가회로로 나타낸 것이다' 류로 시작, (2) <해석 절차>에 따라 단계별 풀이 지시. 자연스러운 한국어 한 단락.",
  "conditions": ["V_s = ${v.V_s} V, R_top = ${v.R_top} Ω", "${reactiveSym1} = ${v.C_1} ${reactiveUnit}, ${reactiveSym2} = ${v.C_2} ${reactiveUnit}", "점선박스: R_a = ${v.R_a} Ω, R_b = ${v.R_b} Ω, R_c = ${v.R_c} Ω, I_s = ${v.I_s} A", "SW: 단자1↔단자2 (t<0 단자1, t=0 단자2)", "t<0 직류 정상상태"],
  "question":   "[단계 1] 스위치가 단자1에 연결된 상태에서 정상상태에 도달했을 때, ${isRL ? "인덕터" : "커패시터"} ${reactiveSym1}의 ${isRL ? "전류" : "전압"} ${measureSym}(0⁻) [${measureUnit}]을 구하시오.\\n[단계 2] (나)에서 테브난 등가전압 V_Th [V]와 테브난 등가저항 R_Th [Ω]를 각각 구하시오.\\n[단계 3] 시각 t=0일 때, 스위치가 단자1에서 단자2로 이동했다. t≥0에서 ${reactiveSym1}의 ${isRL ? "전류" : "전압"} ${measureSym}(t) [${measureUnit}]를 구하시오.",
  "answer":     "[단계 1] ${measureSym}(0⁻) = ${a.v_o_0minus} ${measureUnit}\\n[단계 2] V_Th = ${a.V_Th} V, R_Th = ${a.R_Th} Ω\\n[단계 3] ${measureSym}(t) = ${a.v_o_t_expr} [${measureUnit}]",
  "solution":   "[단계 1] (자연스러운 한국어로 다음 골격 풀어주기): ${isRL ? `t<0에서 SW=단자1이므로 V_s → R_top → SW → ${reactiveSym1} → GND → ${reactiveSym2} → V_s closed loop. 직류 정상상태에서 인덕터는 short (di/dt=0이라 V_L=0). KVL로 V_s = i·R_top → i_o(0⁻) = V_s/R_top = ${a.v_o_0minus}A.` : `t<0에서 SW=단자1이므로 V_s → R_top → SW → ${reactiveSym1} → GND ← ${reactiveSym2} ← V_s closed loop. 직류 정상상태에서 캐패시터에 흐르는 전류 0 (i=0)이므로 R_top 양단 전압강하 0. KVL: V_s = V_${reactiveSym1} + V_${reactiveSym2}. 직렬 cap은 같은 charge로 V_${reactiveSym1}/V_${reactiveSym2} = ${reactiveSym2}/${reactiveSym1}. → v_o(0⁻) = V_s·${reactiveSym2}/(${reactiveSym1}+${reactiveSym2}) = ${a.v_o_0minus}V.`}\\n[단계 2] (나)의 점선박스 자리에 단자 b에서 본 Thevenin. R_a horizontal과 R_c vertical 직렬 가지(R_a+R_c=${v.R_a + v.R_c}Ω), R_b 다른 vertical 가지. I_s가 n_mid로 유입. 개방 b: 분배로 V_b = I_s · R_b · R_c / (R_a+R_b+R_c) = ${a.V_Th}V = V_Th. I_s OFF시 b↔GND 등가: R_b ‖ (R_a+R_c) = ${a.R_Th}Ω = R_Th.\\n[단계 3] t≥0 SW=단자2 → ${reactiveSym1}이 Thevenin과 closed loop (R_top측 분리, ${reactiveSym2}는 frozen). ${isRL ? `i_o(∞) = V_Th/R_Th = ${a.v_o_inf}A, τ = ${reactiveSym1}/R_Th = ${a.tau}sec. RL step: i_o(t) = i_o(∞) + [i_o(0⁻) − i_o(∞)]·exp(−t/τ) = ${a.v_o_t_expr} [A].` : `v_o(∞) = V_Th = ${a.v_o_inf}V, τ = R_Th·${reactiveSym1} = ${a.tau}sec. RC step: v_o(t) = v_o(∞) + [v_o(0⁻) − v_o(∞)]·exp(−t/τ) = ${a.v_o_t_expr} [V].`}"
}

[엄수 규칙]
- figure 다시 만들지 마라. 코드가 처리.
- 솔버 값 그대로. 다른 수치 금지.
- solution은 자연스러운 한국어. ${isRL ? "RL transient·인덕터 short(SS)·di/dt" : "RC transient·캐패시터 개방(SS)·전압분배"} 키워드 포함.
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

  const enforcedAnswer = `[단계 1] ${measureSym}(0⁻) = ${a.v_o_0minus} ${measureUnit}\n[단계 2] V_Th = ${a.V_Th} V, R_Th = ${a.R_Th} Ω\n[단계 3] ${measureSym}(t) = ${a.v_o_t_expr} [${measureUnit}]`;

  if (parsed.solution) {
    const sol = parsed.solution;
    const missing: string[] = [];
    if (!/V_?Th|R_?Th|테브난|테브닌/i.test(sol)) missing.push("thevenin");
    if (!/정상상태|steady state|short|개방/i.test(sol)) missing.push("steady_state");
    if (!/τ|시정수|시상수|time constant|RC|RL/i.test(sol)) missing.push("time_constant");
    if (missing.length > 0) {
      log.warn("thevenin_switched_rc_solution_keywords", { componentMode, missing, preview: sol.slice(0, 160) });
    }
  }

  return {
    content: parsed.content ?? `스위치 + ${circuitType} + Thevenin 등가 회로 문제 (임용 9번 정보과)`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? `[단계 1] ${measureSym}(0⁻). [단계 2] V_Th, R_Th. [단계 3] ${measureSym}(t).`,
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
