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
 * 임용 6번 형식 (SW + 다이오드 + AC 클램프) 문제 텍스트 생성 — v2.1.
 *
 *  v2 개선:
 *   - 클램퍼 동작 골격(D_1·D_2 ON 조건·V_C 충전 phase·정상상태) 단계별 풀이 reasoning 제공
 *   - "시뮬 결과" 톤 제거, 회로 분석 톤으로
 *   - content 템플릿 박지 않고 핵심 사실만 명시 → GPT 자연 한국어 자유
 *   - solution validation (다이오드·클램프·캐패시터 키워드 누락 시 warn)
 *
 *  v2.1 (두-phase 모델링 도입 후 정정):
 *   - SW 컨벤션 정정 (renderer의 closed_to_term1과 일관):
 *       단자1 = V_i (signal line) 측 — POST-switch
 *       단자2 = GND (common ground rail) 측 — PRE-switch
 *       common = C 좌측
 *     → t<0 SW=단자2 (C 좌측 GND), t=0에 단자1로 이동 (V_i 전달)
 *   - V_C(0⁻) (= generation.V_C_initial) narration에 반영
 *
 *  솔버가 강제한 수치(V_o@T/2·V_o@T·min/max)는 enforcedAnswer로 변경 금지.
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

  // Phase B 클램프 여부 (2·V_p > V_CC면 D_1 clamp, 아니면 free swing)
  const d1Clamps = 2 * v.V_i_peak > v.V_CC;
  const phaseBNarration = d1Clamps
    ? `v_i가 +${v.V_i_peak}로 상승하면 v_o = v_i + V_C가 V_CC = ${v.V_CC}V를 초과하므로 D_1(a=클램프, c=V_CC)이 ON되어 V_o = V_CC로 클램프되고, V_C = V_CC - v_i로 재충전된다 (t=3T/4에서 V_C = ${v.V_CC - v.V_i_peak}V). 이후 v_i가 0으로 복귀하면 D_1 OFF, V_C는 ${v.V_CC - v.V_i_peak}V로 유지되어 t=T에서 V_o = 0 + ${v.V_CC - v.V_i_peak} = ${a.step2_Vo_at_T}V.`
    : `v_i가 +${v.V_i_peak}로 상승해도 v_o = v_i + V_C의 최댓값 ${2 * v.V_i_peak}V가 V_CC = ${v.V_CC}V 이하이므로 D_1 OFF 유지, V_C = ${v.V_i_peak}V 그대로. t=T에서 v_i=0이므로 V_o = 0 + ${v.V_i_peak} = ${a.step2_Vo_at_T}V.`;

  const userPrompt = `다음 정보로 임용 6번 형식의 "스위치 + 다이오드 + 교류 입력 클램프 회로" 문제를 작성하세요.
회로도와 v_i(t)·v_o(t) 파형은 코드가 이미 생성 — 너는 본문·조건·단계 question·풀이만 작성.

[회로 구조 — 그림은 이미 결정, 다시 만들지 마라]
교류 전원: v_i(t) = -${v.V_i_peak}sin(ωt) V (주기 T = ${v.T_ms} ms, ω = 2π/T)
SW: SPDT, common 단자가 C 측. 단자1 = v_i(t) 측 (신호선), 단자2 = GND 측 (공통 그라운드).
  t<0: SW가 단자2에 있음 → C 좌측이 GND에 접지 → V_C(0⁻) = ${generation.V_C_initial} V (전하 없음, 정상상태).
  t=0: SW가 단자1로 이동 → C 좌측이 v_i(t)에 연결 → 교류 신호가 C를 통해 클램프 노드에 전달.
직류 전원: V_CC = ${v.V_CC} V (+극이 D_1 cathode 측)
캐패시터: C = ${v.C_uF} μF (SW common → 클램프 노드 직렬)
다이오드 (이상적, V_F=0):
  D_1: anode = 클램프 노드, cathode = V_CC 단자 → V_clamp ≥ V_CC 일 때 ON, V_o = V_CC
  D_2: anode = GND, cathode = 클램프 노드 → V_clamp ≤ 0 일 때 ON, V_o = 0
부하저항: R_L = ${v.R_L_kohm} kΩ (클램프 노드 → GND, V_o 측정점)

[클램퍼 동작 골격 — 풀이 reasoning]
정의: v_o(t) = v_i(t) + V_C(t)  (V_C = v_in 측 - 클램프 측, C 양단 전압. t≥0 SW=단자1 기준)
가정 (문제에 명시): 다이오드 V_F = 0, R_L에 의한 C 방전 무시 → 다이오드 OFF 구간에서 V_C 일정.
초기조건: V_C(0⁻) = ${generation.V_C_initial} V (t<0 SW=단자2 정상상태에서 자동 결정).

─ Phase A (0 ≤ t ≤ T/2, v_i 음의 반주기) ─
v_i가 0→-V_p→0 (음수). v_o = v_i + V_C가 음수로 향함.
v_o ≤ 0 이면 D_2 ON → V_o = 0으로 강제 → V_C = -v_i(t) 따라 충전됨.
t = T/4: v_i = -${v.V_i_peak} (최소), V_C = ${v.V_i_peak} V로 충전.
t ∈ [T/4, T/2]: v_i가 -${v.V_i_peak}→0으로 증가. D_2 OFF (방전 무시 가정), V_C는 ${v.V_i_peak} V 유지.
  → v_o(t) = v_i(t) + ${v.V_i_peak}.
t = T/2: v_i = 0, v_o = 0 + ${v.V_i_peak} = ${v.V_i_peak} V → ${a.step1_Vo_at_halfT} V (셋째자리 절사).

─ Phase B (T/2 ≤ t ≤ T, v_i 양의 반주기) ─
v_i가 0→+V_p→0. v_o = v_i + V_C이 +V_C 위로 상승.
v_o ≥ V_CC 이면 D_1 ON → V_o = V_CC로 강제 → V_C = V_CC - v_i(t)로 재충전 (감소).
2·V_p > V_CC ${2 * v.V_i_peak > v.V_CC ? "→ Phase B 중에 D_1 ON 구간 존재" : "→ 양의 반주기에서 D_1 clamp 안 함 (V_CC 한계 미도달)"}.
t = 3T/4: v_i = +${v.V_i_peak}, ${2 * v.V_i_peak > v.V_CC ? `V_o = ${v.V_CC} (D_1 clamp), V_C = ${v.V_CC - v.V_i_peak}` : `V_o = v_i + V_C, V_C = ${v.V_i_peak} 유지`}.
t = T: v_i = 0, v_o = 0 + V_C = ${a.step2_Vo_at_T} V (셋째자리 절사).

─ Phase C (t ≥ T, 정상상태) ─
양의 반주기에서 D_1, 음의 반주기에서 D_2가 교대로 ON → V_o가 [0, ${v.V_CC}] 범위로 양쪽 클램프.
정상상태 V_o:
  최댓값 = ${a.step3_Vo_max} V (D_1 clamp 시점, ≈ V_CC = ${v.V_CC})
  최솟값 = ${a.step3_Vo_min} V (D_2 clamp 시점, ≈ 0)

[학생 단계 — 원본 임용 6번 패턴]
[단계 1] t = T/2에서 V_o(t) [V] 도출 → ${a.step1_Vo_at_halfT} V
[단계 2] t = T에서 V_o(t) [V] 도출 → ${a.step2_Vo_at_T} V
[단계 3] t ≥ T 정상상태에서 V_o(t)의 최댓값·최솟값 [V] → 최댓값 ${a.step3_Vo_max} V, 최솟값 ${a.step3_Vo_min} V

[모드] ${mode === "exam_similar" ? "기출유사유형 (회로·문항 동일, 수치만 변경)" : "기출변형유형 (구조·원리 동일, 수치·소자 변형 가능)"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "본문 한 단락. (1) '그림은 스위치와 다이오드가 포함된 응용 회로이다' 류로 시작, (2) v_i(t) = -${v.V_i_peak}sin(ωt) V·주기 T = ${v.T_ms} ms 명시, (3) <해석 절차>에 따라 단계별로 풀이 과정과 결과를 서술하라는 지시, (4) 단서 괄호: t<0에서 SW는 단자2(GND)에 있어 정상상태(V_C=0), t=0에 SW가 단자1로 이동, D_1·D_2 이상적(V_F=0), R_L에 의한 C 방전 무시. 자연스러운 한국어 한 단락으로.",
  "conditions": ["v_i(t) = -${v.V_i_peak}sin(ωt) V (주기 T = ${v.T_ms} ms)", "V_CC = ${v.V_CC} V", "C = ${v.C_uF} μF", "R_L = ${v.R_L_kohm} kΩ", "다이오드 D_1·D_2 이상적 (순방향 전압 강하 0V)", "R_L에 의한 C의 방전 무시", "각 단계 결과는 소수점 셋째자리 이하 절사"],
  "question":   "[단계 1] t = T/2일 때, V_o(t) [V]를 구하시오.\\n[단계 2] t = T일 때, V_o(t) [V]를 구하시오.\\n[단계 3] t ≥ T 정상상태에서 V_o(t)의 최댓값과 최솟값 [V]를 각각 구하시오.",
  "answer":     "[단계 1] V_o(T/2) = ${a.step1_Vo_at_halfT} V\\n[단계 2] V_o(T) = ${a.step2_Vo_at_T} V\\n[단계 3] 최댓값 = ${a.step3_Vo_max} V, 최솟값 = ${a.step3_Vo_min} V",
  "solution":   "[단계 1]에서 (Phase A 골격을 자연스러운 한국어로): t<0에서 SW가 단자2(GND)에 있어 C 좌측이 접지되고 클램프 노드에는 AC 입력이 없으므로 V_C(0⁻) = ${generation.V_C_initial}V (정상상태). t=0에 SW가 단자1로 이동하면 v_i가 C를 통해 클램프 노드에 전달된다. 0≤t≤T/2 동안 v_i가 음수이므로 v_o = v_i + V_C가 음으로 향해 D_2(a=GND, c=클램프)가 ON되어 V_o=0이 되고, V_C = -v_i로 충전된다. t=T/4에서 V_C = ${v.V_i_peak}V로 최대 충전, 이후 D_2 OFF되고 R_L에 의한 방전을 무시하므로 V_C는 ${v.V_i_peak}V로 유지된다. t=T/2에서 v_i=0이므로 V_o = 0 + ${v.V_i_peak} = ${a.step1_Vo_at_halfT}V.\\n[단계 2]에서 (Phase B 골격): T/2≤t≤T 동안 v_i가 양수로 상승. ${phaseBNarration}\\n[단계 3]에서 (Phase C 골격): t≥T 정상상태에서는 양의 반주기에서 D_1${d1Clamps ? ", 음의 반주기에서 D_2가 교대로 ON되어 V_o가 [0, V_CC] 범위에서 양쪽 클램프" : "는 ON되지 않고, 음의 반주기에서 D_2만 ON되어 V_o ≥ 0 한쪽 클램프"}된다. 따라서 최댓값 = ${a.step3_Vo_max}V${d1Clamps ? " (D_1 clamp)" : ""}, 최솟값 = ${a.step3_Vo_min}V (D_2 clamp)."
}

[엄수 규칙]
- 회로/파형 figure 다시 만들지 마라. 코드가 처리.
- 솔버 값(${a.step1_Vo_at_halfT}, ${a.step2_Vo_at_T}, ${a.step3_Vo_max}, ${a.step3_Vo_min})은 그대로. 다른 수치로 바꾸지 마라.
- solution은 자연스러운 한국어 서술. "시뮬레이션" 단어 금지 — D_1·D_2 ON 조건, V_C 충전·유지, KCL/KVL 식으로 표현.
- 단계 1·2·3 question 패턴 유지: "t = T/2 V_o" / "t = T V_o" / "t ≥ T 최댓값·최솟값".
- 셋째자리 절사 규칙 conditions에 명시 (이미 답에 적용됨).
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
  let parsed: Partial<UniversalAcPwlTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<UniversalAcPwlTextOutput>; }
  catch (e) { throw new Error(`UniversalAcPwl text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계 1] V_o(T/2) = ${a.step1_Vo_at_halfT} V\n[단계 2] V_o(T) = ${a.step2_Vo_at_T} V\n[단계 3] 최댓값 = ${a.step3_Vo_max} V, 최솟값 = ${a.step3_Vo_min} V`;

  if (parsed.solution) {
    const sol = parsed.solution;
    const missing: string[] = [];
    if (!/D_?1|D_?2|다이오드/.test(sol)) missing.push("diode");
    if (!/클램프|clamp/i.test(sol)) missing.push("clamp");
    if (!/V_?C|캐패시터|커패시터|콘덴서/.test(sol)) missing.push("capacitor");
    if (/시뮬레이션|시뮬\b/.test(sol)) missing.push("simulation_word");
    if (missing.length > 0) {
      log.warn("universal_ac_pwl_solution_keywords", { missing, preview: sol.slice(0, 160) });
    }
  }
  if (parsed.answer && !parsed.answer.includes(String(a.step1_Vo_at_halfT))) {
    log.warn("universal_ac_pwl_answer_mismatch", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "스위치와 다이오드가 포함된 교류 클램프 회로 문제 (임용 6번 형식)",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1] t = T/2에서 V_o(t). [단계 2] t = T에서 V_o(t). [단계 3] t ≥ T 정상상태 V_o(t) 최댓값·최솟값.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
