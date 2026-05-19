import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { SwitchedRlcStepGeneration } from "./switchedRlcStep";

const log = createLogger("lib/generation/topologies/switchedRlcStepTextWriter");

export type SwitchedRlcStepTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * Switched RLC step response 문제 텍스트 생성 (임용 9번 switched 버전).
 *
 *  단계 1: t<0 DC SS → v_C(0⁻), i_L(0⁻)
 *  단계 2: t≥0 KCL → dv_C(0⁺)/dt
 *  단계 3: 2차 미방 + v_C(t)
 */
export async function writeSwitchedRlcStepText(args: {
  generation: SwitchedRlcStepGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<SwitchedRlcStepTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const dampingKo = v.damping === "under" ? "부족 감쇠(under-damped)" : v.damping === "critical" ? "임계 감쇠(critical-damped)" : "과 감쇠(over-damped)";

  const userPrompt = `다음 정보로 임용 9번(스위치 t=0 전환 RLC) 형식의 회로이론 문제를 작성하세요.
회로도(t=0에 SW가 A→B 전환되는 RLC 회로)와 v_C(t) 시간응답 곡선은 코드가 이미 생성 — 너는 본문·조건·단계 question·풀이만 작성.

[회로 구조 — 코드가 figure 생성, 다시 만들지 마라]
  좌측 leg (SW=A 시 활성): V_s = ${v.V_s}V → R_a = ${v.R_a}Ω → 단자 A
  우측 leg (SW=B 시 활성): I_s = ${v.I_s}A 전류원 → R_b = ${v.R_b}Ω → 단자 B
  가운데 core (항상): SW 가운데 ↔ 가운데 노드 ━ C = ${formatFracStr(v.C)}F (v_C 측정) || R_c = ${v.R_c}Ω + L = ${formatFracStr(v.L)}H (직렬, i_L 측정)
  SW SPDT — t<0: A, t≥0: B (t=0에 A→B 전환)
  t<0에서 회로는 직류 정상 상태 (C는 개방, L은 단락).

[학생이 풀어야 할 단계 — 원본 임용 9번 패턴]
[단계 1] t<0일 때, 커패시터 양단 전압 v_C(0⁻)[V]와 인덕터 L에 흐르는 전류 i_L(0⁻)[A]를 구한다.
[단계 2] t≥0일 때, 키르히호프의 전류 법칙을 이용하여, dv_C(0⁺)/dt [V/sec]를 구한다.
[단계 3] t≥0일 때, v_C(t)에 대한 2차 미분방정식과 커패시터 양단 전압 v_C(t)[V]를 순서대로 구한다.

[정답 — 풀이의 도착점]
  단계 1: v_C(0⁻) = ${v.v_C_0minus}V, i_L(0⁻) = ${v.i_L_0minus}A
  단계 2: dv_C(0⁺)/dt = ${v.dvC_dt_0plus} V/sec
  단계 3: 미방 — d²v_C/dt² + ${v.alpha}·dv_C/dt + ${v.beta}·v_C = ${v.gamma}
           v_C(t) = ${v.solutionForm}   (${dampingKo}, ω_0=${v.omega0}, ζ=${v.zeta}${v.omegaD !== undefined ? `, ω_d=${v.omegaD}` : ""})
           v_C(∞) = ${v.v_C_infty}V

[풀이 식 — 참고 골격 (solution에 자연스러운 한국어로 풀어쓸 것)]
  ─ 단계 1 (t<0 DC SS, SW=A) ─
    C는 개방, L은 단락 → 좌측 leg(V_s, R_a)와 가운데 R_c+L 가지가 직렬.
    i_L(0⁻) = V_s/(R_a+R_c) = ${v.V_s}/(${v.R_a}+${v.R_c}) = ${v.i_L_0minus}A
    v_C(0⁻) = i_L(0⁻)·R_c = ${v.i_L_0minus}·${v.R_c} = ${v.v_C_0minus}V
  ─ 단계 2 (t=0⁺ KCL, SW=B 직후) ─
    가운데 노드 KCL: I_s = v_C(0⁺)/R_b + i_L(0⁺) + C·dv_C(0⁺)/dt
    v_C, i_L 연속 → v_C(0⁺) = v_C(0⁻) = ${v.v_C_0minus}V, i_L(0⁺) = i_L(0⁻) = ${v.i_L_0minus}A
    C·dv_C(0⁺)/dt = I_s − v_C(0⁻)/R_b − i_L(0⁻) = ${v.I_s} − ${v.v_C_0minus}/${v.R_b} − ${v.i_L_0minus} = ${v.dvC_dt_0plus * v.C}
    → dv_C(0⁺)/dt = ${v.dvC_dt_0plus} V/sec
  ─ 단계 3 (2차 미방 + v_C(t)) ─
    KVL+KCL로 v_C 단일변수 2차 미방:
    L·C·d²v_C/dt² + (R_c·C + L/R_b)·dv_C/dt + (1 + R_c/R_b)·v_C = R_c·I_s
    → d²v_C/dt² + ${v.alpha}·dv_C/dt + ${v.beta}·v_C = ${v.gamma}
    특성방정식: s² + ${v.alpha}·s + ${v.beta} = 0
    ω_0 = √${v.beta} = ${v.omega0}, ζ = ${v.alpha}/(2·${v.omega0}) = ${v.zeta} → ${dampingKo}
    강제응답: v_C(∞) = ${v.gamma}/${v.beta} = ${v.v_C_infty}V
    초기조건(v_C(0⁻)=${v.v_C_0minus}, dv_C/dt(0⁺)=${v.dvC_dt_0plus})로 자연응답 상수 결정:
    ${v.solutionForm}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림은 t=0에서 스위치가 단자 A에서 단자 B로 이동하는 RLC 회로이다. t≥0에서의 커패시터 양단 전압 v_C(t)를 제시된 <해석 절차>에 따라 단계별로 구하여 서술하시오. (단, t<0에서 회로는 직류 정상 상태이다.)",
  "conditions": ["V_s = ${v.V_s}V (좌측 전압원)", "I_s = ${v.I_s}A (우측 전류원)", "R_a = ${v.R_a}Ω, R_b = ${v.R_b}Ω, R_c = ${v.R_c}Ω", "L = ${formatFracStr(v.L)}H, C = ${formatFracStr(v.C)}F", "SW는 SPDT, t=0에 A→B 전환", "t<0에서 회로는 직류 정상 상태"],
  "question":   "[단계 1] t<0일 때, 커패시터 양단 전압 v_C(0⁻)[V]와 인덕터 L에 흐르는 전류 i_L(0⁻)[A]를 구하시오.\\n[단계 2] t≥0일 때, 키르히호프의 전류 법칙을 이용하여 dv_C(0⁺)/dt[V/sec]를 구하시오.\\n[단계 3] t≥0일 때, v_C(t)에 대한 2차 미분방정식과 커패시터 양단 전압 v_C(t)[V]를 순서대로 구하시오.",
  "answer":     "단계 1: v_C(0⁻) = ${v.v_C_0minus}V, i_L(0⁻) = ${v.i_L_0minus}A. 단계 2: dv_C(0⁺)/dt = ${v.dvC_dt_0plus} V/sec. 단계 3: 미방 d²v_C/dt²+${v.alpha}·dv_C/dt+${v.beta}·v_C=${v.gamma}, ${v.solutionForm} (${dampingKo}).",
  "solution":   "[단계 1] (위 풀이 식 단계 1을 자연스러운 한국어로. t<0 DC 정상상태에서 C는 개방, L은 단락임을 명시. SW=A 위치이므로 좌측 V_s leg 활성, 회로 V_s→R_a→가운데→R_c→L→GND 직렬. i_L(0⁻)=${v.i_L_0minus}A, v_C(0⁻)=${v.v_C_0minus}V.)\\n[단계 2] (t≥0 SW=B 직후. 가운데 노드 KCL 식으로 dv_C(0⁺)/dt 풀이. v_C·i_L 연속 사용. 답 ${v.dvC_dt_0plus} V/sec.)\\n[단계 3] (KVL+KCL 결합으로 v_C 2차 미방 d²v+${v.alpha}dv+${v.beta}v=${v.gamma} 도출. 특성방정식 → ${dampingKo}. 강제응답 v_C(∞)=${v.v_C_infty}. 초기조건으로 자연응답 상수 결정. 최종: ${v.solutionForm}.)"
}

[엄수 규칙]
- 회로(figure)와 곡선(figure) 다시 만들지 마라 — 코드 자동 생성.
- 모든 값은 위 그대로. 정답값은 코드 결정값 사용.
- 단계 1·2·3 question은 위 패턴 유지. "v_C(0⁻)·i_L(0⁻)" / "키르히호프 전류 법칙으로 dv_C(0⁺)/dt" / "2차 미분방정식 + v_C(t)" 어구.
- solution은 자연스러운 한국어. DC SS·KCL·KVL·미방 도출·강제응답·초기조건 모두 풀이에 포함.
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
  let parsed: Partial<SwitchedRlcStepTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<SwitchedRlcStepTextOutput>;
  } catch (e) {
    throw new Error(`SwitchedRlcStep text JSON 파싱 실패: ${String(e)}`);
  }

  if (parsed.solution && !/(v_C\(0|vc\(0|미분|KCL|KVL)/i.test(parsed.solution)) {
    log.warn("solution_missing_keywords", { preview: parsed.solution.slice(0, 120) });
  }

  return {
    content: parsed.content ?? "Switched RLC step response 회로 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1] v_C(0⁻)·i_L(0⁻). [단계 2] dv_C(0⁺)/dt. [단계 3] 2차 미방 + v_C(t).",
    answer: parsed.answer ?? "(풀이 미생성)",
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function formatFracStr(x: number): string {
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  for (const denom of [2, 3, 4, 5, 6, 7, 8, 10]) {
    const numer = Math.round(x * denom);
    if (numer > 0 && Math.abs(x - numer / denom) < 1e-9) return `${numer}/${denom}`;
  }
  return String(Math.round(x * 1000) / 1000);
}
