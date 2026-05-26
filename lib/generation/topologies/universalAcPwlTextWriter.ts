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
 * 임용 6번 형식 (SW + 다이오드 + AC 클램프) 문제 텍스트 생성 — v3.
 *
 *  v2 개선:
 *   - 클램퍼 동작 골격(D_1·D_2 ON 조건·V_C 충전 phase·정상상태) 단계별 풀이 reasoning 제공
 *   - "시뮬 결과" 톤 제거, 회로 분석 톤으로
 *   - content 템플릿 박지 않고 핵심 사실만 명시 → GPT 자연 한국어 자유
 *   - solution validation (다이오드·클램프·캐패시터 키워드 누락 시 warn)
 *
 *  v2.1 (두-phase 모델링 도입 후 정정):
 *   - SW 컨벤션 정정 (renderer의 closed_to_term1과 일관)
 *   - V_C(0⁻) (= generation.V_C_initial) narration에 반영
 *
 *  v3 (polarity 분기 — 양의 클램퍼 / 음의 클램퍼):
 *   - generation.polarity 보고 narration 골격 mirror
 *     positive (exam_similar, 원본): V_o ∈ [0, V_CC], v_i=-sin, D_2 먼저 ON
 *     negative (exam_variant, 변형): V_o ∈ [-V_CC, 0], v_i=+sin, D_2' 먼저 ON (양의 반주기에 V_o=0 클램프)
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
  const polarity = generation.polarity;
  const isNeg = polarity === "negative";

  // ── polarity별 식·라벨·골격 ────────────────────────────────────
  //   positive: v_i = -V_p sin(ωt), V_CC = +값, D_2 (V_o=0 클램프), D_1 (V_o=V_CC 클램프)
  //   negative: v_i = +V_p sin(ωt), V_CC = -값, D_2' (V_o=0 클램프), D_1' (V_o=-V_CC 클램프)
  const viExpr = isNeg ? `+${v.V_i_peak}sin(ωt) V` : `-${v.V_i_peak}sin(ωt) V`;
  const vccLabel = isNeg ? `-${v.V_CC} V` : `${v.V_CC} V`;
  const clamperKind = isNeg ? "음의 클램퍼" : "양의 클램퍼";
  const voRangeText = isNeg ? `[-${v.V_CC}, 0]` : `[0, ${v.V_CC}]`;
  const phaseAHalfDesc = isNeg ? "양의 반주기" : "음의 반주기";
  const phaseBHalfDesc = isNeg ? "음의 반주기" : "양의 반주기";

  // D 방향 — polarity별
  const d1Desc = isNeg
    ? "D_1': anode = V_CC 단자(-), cathode = 클램프 노드 → V_clamp ≤ V_CC(=-값) 일 때 ON, V_o = V_CC(-값)"
    : "D_1: anode = 클램프 노드, cathode = V_CC 단자(+) → V_clamp ≥ V_CC 일 때 ON, V_o = V_CC";
  const d2Desc = isNeg
    ? "D_2': anode = 클램프 노드, cathode = GND → V_clamp ≥ 0 일 때 ON, V_o = 0"
    : "D_2: anode = GND, cathode = 클램프 노드 → V_clamp ≤ 0 일 때 ON, V_o = 0";

  // V_o(t) 정의 — polarity별 (음의 클램퍼는 V_C 정의 동일하지만 V_o 표현이 다름)
  //   positive: V_C = v_in - V_o (D_2 ON 시 V_o=0 → V_C=v_i). V_o = v_i + V_C는 잘못, 실제 V_o = v_i - V_C
  //   하지만 관습적으로 v_o = v_i + V_C ("커패시터 양단을 더한 출력") 표기 일관 유지를 위해
  //   양/음 클램퍼 모두 V_C(t) = v_in - V_o(t)로 두고, V_o = v_i - V_C 식으로 통일.
  //   ※ v2 prompt는 v_o = v_i + V_C로 적었지만 부호는 결과가 같음 (V_C 부호 정의 차이).
  //   v3에서는 더 명확하게 V_o = v_i - V_C로 통일.

  // Phase A 골격 (첫 반주기, |v_i|가 V_p에 도달 → V_C 충전)
  // - positive: v_i=-V_p sin → 첫 반주기에 v_i가 음수 → D_2 (a=GND,c=clamp) ON when V_o<0 → V_o=0, V_C=v_in-V_o=v_i (음수 V_C, but magnitude V_p)
  //   Actually V_C = v_i - V_o = v_i - 0 = v_i. v_i = -V_p at T/4 → V_C = -V_p.
  //   v_o(T/2) = v_i - V_C = 0 - (-V_p) = +V_p. ← step1 ≈ +V_p (양수)
  // - negative: v_i=+V_p sin → 첫 반주기에 v_i가 양수 → D_2' (a=clamp,c=GND) ON when V_o>0 → V_o=0, V_C=v_i.
  //   V_C = v_i. v_i = +V_p at T/4 → V_C = +V_p.
  //   v_o(T/2) = v_i - V_C = 0 - V_p = -V_p. ← step1 ≈ -V_p (음수)
  // 즉 polarity 따라 V_C 부호 mirror.
  const v_C_at_T_over_4 = isNeg ? `+${v.V_i_peak}` : `-${v.V_i_peak}`;
  const phaseAVoComputation = isNeg
    ? `V_o = v_i - V_C = 0 - (+${v.V_i_peak}) = -${v.V_i_peak} V → ${a.step1_Vo_at_halfT} V (셋째자리 절사)`
    : `V_o = v_i - V_C = 0 - (-${v.V_i_peak}) = +${v.V_i_peak} V → ${a.step1_Vo_at_halfT} V (셋째자리 절사)`;

  // Phase B (반대 반주기에 D_1 clamp 가능)
  // 조건: 2·V_p > V_CC (이상 다이오드 모델에서 D_1 ON 발생)
  const d1Clamps = 2 * v.V_i_peak > v.V_CC;
  const phaseBNarration = isNeg
    ? (d1Clamps
        ? `v_i가 -${v.V_i_peak}로 하강하면 V_o = v_i - V_C가 -V_CC(=-${v.V_CC})V 아래로 내려가려 하므로 D_1'(a=V_CC, c=클램프)가 ON되어 V_o = -${v.V_CC}V로 클램프되고, V_C = v_i - V_o = v_i - (-${v.V_CC}) = v_i + ${v.V_CC}로 재충전된다 (t=3T/4에서 V_C = ${-v.V_i_peak + v.V_CC}V). 이후 v_i가 0으로 복귀하면 D_1' OFF, V_C는 ${-v.V_i_peak + v.V_CC}V로 유지되어 t=T에서 V_o = 0 - ${-v.V_i_peak + v.V_CC} = ${a.step2_Vo_at_T}V.`
        : `v_i가 -${v.V_i_peak}로 하강해도 V_o = v_i - V_C의 최솟값 ${-2 * v.V_i_peak}V가 -V_CC(=-${v.V_CC})V 이상이므로 D_1' OFF 유지, V_C = +${v.V_i_peak}V 그대로. t=T에서 v_i=0이므로 V_o = 0 - ${v.V_i_peak} = ${a.step2_Vo_at_T}V.`)
    : (d1Clamps
        ? `v_i가 +${v.V_i_peak}로 상승하면 V_o = v_i - V_C가 V_CC = ${v.V_CC}V를 초과하려 하므로 D_1(a=클램프, c=V_CC)가 ON되어 V_o = V_CC로 클램프되고, V_C = v_i - V_CC로 재충전된다 (t=3T/4에서 V_C = ${v.V_i_peak - v.V_CC}V). 이후 v_i가 0으로 복귀하면 D_1 OFF, V_C는 ${v.V_i_peak - v.V_CC}V로 유지되어 t=T에서 V_o = 0 - (${v.V_i_peak - v.V_CC}) = ${a.step2_Vo_at_T}V.`
        : `v_i가 +${v.V_i_peak}로 상승해도 V_o = v_i - V_C의 최댓값 ${2 * v.V_i_peak}V가 V_CC = ${v.V_CC}V 이하이므로 D_1 OFF 유지, V_C = -${v.V_i_peak}V 그대로. t=T에서 v_i=0이므로 V_o = 0 - (-${v.V_i_peak}) = ${a.step2_Vo_at_T}V.`);

  // Phase C — 정상상태 양쪽 클램프
  const phaseCDesc = isNeg
    ? (d1Clamps
        ? `음의 반주기에 D_1'이, 양의 반주기에 D_2'가 교대로 ON되어 V_o가 [-${v.V_CC}, 0] 범위에서 양쪽 클램프`
        : `양의 반주기에 D_2'만 ON되어 V_o ≤ 0의 한쪽 클램프 (D_1' 미발생)`)
    : (d1Clamps
        ? `양의 반주기에 D_1이, 음의 반주기에 D_2가 교대로 ON되어 V_o가 [0, ${v.V_CC}] 범위에서 양쪽 클램프`
        : `음의 반주기에 D_2만 ON되어 V_o ≥ 0의 한쪽 클램프 (D_1 미발생)`);

  const userPrompt = `다음 정보로 임용 6번 형식의 "스위치 + 다이오드 + 교류 입력 클램프 회로" 문제를 작성하세요.
회로도와 v_i(t)·v_o(t) 파형은 코드가 이미 생성 — 너는 본문·조건·단계 question·풀이만 작성.

[클램퍼 종류] ${clamperKind} (V_o 범위 ${voRangeText} V)
[모드] ${mode === "exam_similar" ? "기출유사유형 (회로·문항 동일, 수치만 변경)" : "기출변형유형 (구조·원리 동일, 다이오드 방향 + V_CC 부호 + v_i 부호 mirror 변형)"}

[회로 구조 — 그림은 이미 결정, 다시 만들지 마라]
교류 전원: v_i(t) = ${viExpr} (주기 T = ${v.T_ms} ms, ω = 2π/T)
SW: SPDT, common 단자가 C 측. 단자1 = v_i(t) 측 (신호선), 단자2 = GND 측 (공통 그라운드).
  t<0: SW가 단자2에 있음 → C 좌측이 GND에 접지 → V_C(0⁻) = ${generation.V_C_initial} V (전하 없음, 정상상태).
  t=0: SW가 단자1로 이동 → C 좌측이 v_i(t)에 연결 → 교류 신호가 C를 통해 클램프 노드에 전달.
직류 전원: V_CC = ${vccLabel}
캐패시터: C = ${v.C_uF} μF (SW common → 클램프 노드 직렬)
다이오드 (이상적, V_F=0):
  ${d1Desc}
  ${d2Desc}
부하저항: R_L = ${v.R_L_kohm} kΩ (클램프 노드 → GND, V_o 측정점)

[클램퍼 동작 골격 — 풀이 reasoning]
정의: V_C(t) = v_in(t) - V_o(t)  (C 양단 전압, v_in 측 = SW common 측, post-switch 기준)
      → V_o(t) = v_i(t) - V_C(t)
가정 (문제에 명시): 다이오드 V_F = 0, R_L에 의한 C 방전 무시 → 다이오드 OFF 구간에서 V_C 일정.
초기조건: V_C(0⁻) = ${generation.V_C_initial} V (t<0 SW=단자2 정상상태에서 자동 결정).

─ Phase A (0 ≤ t ≤ T/2, v_i ${phaseAHalfDesc}) ─
${isNeg
    ? `v_i가 0→+${v.V_i_peak}→0 (양수). V_o = v_i - V_C가 양수로 향함.`
    : `v_i가 0→-${v.V_i_peak}→0 (음수). V_o = v_i - V_C가 음수로 향함.`}
${isNeg
    ? `V_o ≥ 0 이면 D_2'(a=클램프, c=GND) ON → V_o = 0으로 강제 → V_C = v_i로 충전됨.`
    : `V_o ≤ 0 이면 D_2(a=GND, c=클램프) ON → V_o = 0으로 강제 → V_C = v_i로 충전됨 (음수 값).`}
t = T/4: v_i = ${isNeg ? "+" : "-"}${v.V_i_peak} (${isNeg ? "최대" : "최소"}), V_C = ${v_C_at_T_over_4} V로 충전.
t ∈ [T/4, T/2]: v_i가 ${isNeg ? `+${v.V_i_peak}` : `-${v.V_i_peak}`}→0으로 변화. D_2${isNeg ? "'" : ""} OFF (방전 무시 가정), V_C는 ${v_C_at_T_over_4} V 유지.
t = T/2: v_i = 0, ${phaseAVoComputation}.

─ Phase B (T/2 ≤ t ≤ T, v_i ${phaseBHalfDesc}) ─
${phaseBNarration}

─ Phase C (t ≥ T, 정상상태) ─
${phaseCDesc}.
정상상태 V_o:
  최댓값 = ${a.step3_Vo_max} V (${isNeg ? "D_2' clamp 시점, ≈ 0" : `D_1 clamp 시점, ≈ V_CC = ${v.V_CC}`})
  최솟값 = ${a.step3_Vo_min} V (${isNeg ? `D_1' clamp 시점, ≈ -V_CC = -${v.V_CC}` : "D_2 clamp 시점, ≈ 0"})

[학생 단계 — 원본 임용 6번 패턴]
[단계 1] t = T/2에서 V_o(t) [V] 도출 → ${a.step1_Vo_at_halfT} V
[단계 2] t = T에서 V_o(t) [V] 도출 → ${a.step2_Vo_at_T} V
[단계 3] t ≥ T 정상상태에서 V_o(t)의 최댓값·최솟값 [V] → 최댓값 ${a.step3_Vo_max} V, 최솟값 ${a.step3_Vo_min} V

${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "본문 한 단락. (1) '그림은 스위치와 다이오드가 포함된 응용 회로이다' 류로 시작, (2) v_i(t) = ${viExpr}·주기 T = ${v.T_ms} ms 명시, (3) <해석 절차>에 따라 단계별로 풀이 과정과 결과를 서술하라는 지시, (4) 단서 괄호: t<0에서 SW는 단자2(GND)에 있어 정상상태(V_C=0), t=0에 SW가 단자1로 이동, D_1·D_2 이상적(V_F=0), R_L에 의한 C 방전 무시. 자연스러운 한국어 한 단락으로.${isNeg ? " ★ 기출변형유형이므로 'V_CC = -${v.V_CC} V'로 표기하고 ${clamperKind}임을 명시할 것." : ""}",
  "conditions": ["v_i(t) = ${viExpr} (주기 T = ${v.T_ms} ms)", "V_CC = ${vccLabel}", "C = ${v.C_uF} μF", "R_L = ${v.R_L_kohm} kΩ", "다이오드 D_1·D_2 이상적 (순방향 전압 강하 0V)", "R_L에 의한 C의 방전 무시", "각 단계 결과는 소수점 셋째자리 이하 절사"],
  "question":   "[단계 1] t = T/2일 때, V_o(t) [V]를 구하시오.\\n[단계 2] t = T일 때, V_o(t) [V]를 구하시오.\\n[단계 3] t ≥ T 정상상태에서 V_o(t)의 최댓값과 최솟값 [V]를 각각 구하시오.",
  "answer":     "[단계 1] V_o(T/2) = ${a.step1_Vo_at_halfT} V\\n[단계 2] V_o(T) = ${a.step2_Vo_at_T} V\\n[단계 3] 최댓값 = ${a.step3_Vo_max} V, 최솟값 = ${a.step3_Vo_min} V",
  "solution":   "[단계 1]에서 (Phase A 골격을 자연스러운 한국어로): t<0에서 SW가 단자2(GND)에 있어 C 좌측이 접지되고 클램프 노드에는 AC 입력이 없으므로 V_C(0⁻) = ${generation.V_C_initial}V (정상상태). t=0에 SW가 단자1로 이동하면 v_i가 C를 통해 클램프 노드에 전달된다. 0≤t≤T/2 동안 v_i가 ${isNeg ? "양수" : "음수"}이므로 V_o = v_i - V_C가 ${isNeg ? "양" : "음"}으로 향해 ${isNeg ? "D_2'(a=클램프, c=GND)" : "D_2(a=GND, c=클램프)"}가 ON되어 V_o=0이 되고, V_C = v_i로 충전된다. t=T/4에서 V_C = ${v_C_at_T_over_4}V로 최대 충전, 이후 ${isNeg ? "D_2'" : "D_2"} OFF되고 R_L에 의한 방전을 무시하므로 V_C는 ${v_C_at_T_over_4}V로 유지된다. t=T/2에서 v_i=0이므로 ${phaseAVoComputation.replace(" → " + a.step1_Vo_at_halfT + " V (셋째자리 절사)", " = " + a.step1_Vo_at_halfT + "V")}.\\n[단계 2]에서 (Phase B 골격): T/2≤t≤T 동안 v_i가 ${isNeg ? "음수로 하강" : "양수로 상승"}. ${phaseBNarration}\\n[단계 3]에서 (Phase C 골격): t≥T 정상상태에서는 ${phaseCDesc}된다. 따라서 최댓값 = ${a.step3_Vo_max}V, 최솟값 = ${a.step3_Vo_min}V."
}

[엄수 규칙]
- 회로/파형 figure 다시 만들지 마라. 코드가 처리.
- 솔버 값(${a.step1_Vo_at_halfT}, ${a.step2_Vo_at_T}, ${a.step3_Vo_max}, ${a.step3_Vo_min})은 그대로. 다른 수치로 바꾸지 마라.
- ★ 클램퍼 종류는 ${clamperKind} (V_o ∈ ${voRangeText} V). V_o 부호·범위 혼동 금지.
- solution은 자연스러운 한국어 서술. "시뮬레이션" 단어 금지 — D_1${isNeg ? "'" : ""}·D_2${isNeg ? "'" : ""} ON 조건, V_C 충전·유지, KCL/KVL 식으로 표현.
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
      log.warn("universal_ac_pwl_solution_keywords", { polarity, missing, preview: sol.slice(0, 160) });
    }
  }
  if (parsed.answer && !parsed.answer.includes(String(a.step1_Vo_at_halfT))) {
    log.warn("universal_ac_pwl_answer_mismatch", { polarity, gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? `스위치와 다이오드가 포함된 교류 ${clamperKind} 회로 문제 (임용 6번 형식)`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1] t = T/2에서 V_o(t). [단계 2] t = T에서 V_o(t). [단계 3] t ≥ T 정상상태 V_o(t) 최댓값·최솟값.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
