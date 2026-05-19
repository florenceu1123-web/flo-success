import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { SwitchedRlc5legGeneration } from "./switchedRlc5leg";

const log = createLogger("lib/generation/topologies/switchedRlc5legTextWriter");

export type SwitchedRlc5legTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeSwitchedRlc5legText(args: {
  generation: SwitchedRlc5legGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<SwitchedRlc5legTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const dampingKo = v.damping === "under" ? "부족 감쇠(under-damped)" : v.damping === "critical" ? "임계 감쇠(critical-damped)" : "과 감쇠(over-damped)";

  const userPrompt = `다음 정보로 임용 9번 형식의 5-leg RLC switched 회로 문제를 작성하세요.
회로도와 v_C(t) 시간응답은 코드가 이미 생성 — 너는 본문·조건·단계 question·풀이만 작성.

[회로 구조 — 코드가 figure 생성, 다시 만들지 마라]
6-leg + 2 top horizontal R + SPDT SW.
  좌측 leg(reference): V_s=${v.V_s}V (vertical) → R_top_L=${v.R_top_L}Ω(top horizontal) → top rail
  Leg2: R_2v=${v.R_2v}Ω (vertical, top rail → GND)
  Leg3: R_3=${v.R_3}Ω + L_a=${fmt(v.L_a)}H 직렬 (vertical, top rail → GND, top = A 단자)
  Leg4: C=${fmt(v.C)}F 단독 (vertical, SW common → GND, v_C(t) 측정)
  R_4=${v.R_4}Ω (vertical, B 단자 → GND, L_b와 병렬)
  Leg5: L_b=${fmt(v.L_b)}H (vertical, B 단자 = top, → GND, i_L(t) 측정)
  R_top_R=${v.R_top_R}Ω (top horizontal, B 단자 → I_s top)
  Leg6: I_s=${v.I_s}A (vertical 전류원, GND → top, 위쪽 화살표)
  SW SPDT: common = leg4 top, t<0: A throw (= leg3 top = TN_b), t≥0: B throw (= leg5 top)
  t<0에서 회로는 직류 정상 상태.

[학생 단계 — 원본 임용 9번 패턴]
[단계 1] t<0일 때, 커패시터 양단 전압 v_C(0⁻)[V]와 인덕터 L_b(${fmt(v.L_b)}[H])에 흐르는 전류 i_L(0⁻)[A]를 구한다.
[단계 2] t≥0일 때, 키르히호프의 전류 법칙을 이용하여 dv_C(0⁺)/dt[V/sec]를 구한다.
[단계 3] t≥0일 때, v_C(t)에 대한 2차 미분방정식과 커패시터 양단 전압 v_C(t)[V]를 순서대로 구한다.

[정답 — 풀이의 도착점]
  단계 1: v_C(0⁻) = ${v.v_C_0minus}V, i_L(0⁻) = ${v.i_L_0minus}A
  단계 2: dv_C(0⁺)/dt = ${v.dvC_dt_0plus} V/sec
  단계 3: 미방 d²v_C/dt² + ${v.alpha}·dv_C/dt + ${v.beta}·v_C = 0
           v_C(t) = ${v.solutionForm}    (${dampingKo}${v.s1 !== undefined ? `, s₁=${v.s1}, s₂=${v.s2}` : v.omegaD !== undefined ? `, ω_d=${v.omegaD}` : ""})

[풀이 식 — 참고 골격]
─ 단계 1 (t<0 SW=A, DC SS) ─
  C 개방, L_a·L_b 단락 가정. SW=A이므로 SW common(C 위 단자)이 A 단자(=leg3 top)에 연결.
  좌측 회로 활성 (V_s, R_top_L, leg2, leg3, C — R_4·L_b·I_s는 별도 우측 회로):
    Leg3: R_3 + L_a → L_a short → R_3만 (= ${v.R_3}Ω)
    Leg4: C open → 좌측에 ∞ 임피던스
    Top rail 노드 = leg2·leg3 top 등가 = (R_2v ∥ R_3) = ${roundFmt(eqR2(v.R_2v, v.R_3))}Ω
    V_s → R_top_L → top rail → R_eq → GND
    top rail 전압 = V_s · R_eq / (R_top_L + R_eq) = ${v.V_s} · ${roundFmt(eqR2(v.R_2v, v.R_3))} / (${v.R_top_L} + ${roundFmt(eqR2(v.R_2v, v.R_3))}) = ${v.v_C_0minus}V
    v_C(0⁻) = top rail = ${v.v_C_0minus}V (C 양단 = SW common - GND)
  우측 회로 (B_node 기준, 항상 활성: I_s + R_top_R + R_4 + L_b, SW와 무관):
    L_b short → B_node = 0. KCL at TN_c: I_s = (TN_c-0)/R_top_R → TN_c = ${v.I_s * v.R_top_R}V
    KCL at B_node=0: I_s = 0/R_4 + i_L → i_L(0⁻) = I_s = ${v.i_L_0minus}A

─ 단계 2 (t=0⁺ SW=B 직후) ─
  SW=B로 전환 → SW common(C 위)이 B_node와 연결. 좌측 회로(V_s·leg1·2·3) 분리.
  v_C, i_L 연속 → v_C(0⁺) = ${v.v_C_0minus}V, i_L(0⁺) = ${v.i_L_0minus}A
  우측 회로 (C, R_4, L_b 모두 B_node에 병렬, R_top_R 통해 I_s):
    KCL at TN_c: I_s = (TN_c - v_C)/R_top_R → TN_c - v_C = I_s · R_top_R = ${v.I_s * v.R_top_R}V
    KCL at B_node(= v_C): (TN_c - v_C)/R_top_R = i_C + v_C/R_4 + i_L
    → ${v.I_s} = C·dv_C(0⁺)/dt + v_C(0⁺)/R_4 + i_L(0⁺)
    → dv_C(0⁺)/dt = (${v.I_s} − ${v.v_C_0minus}/${v.R_4} − ${v.i_L_0minus})/${fmt(v.C)} = ${v.dvC_dt_0plus} V/sec

─ 단계 3 (2차 미방 + v_C(t)) ─
  v_L_b = L_b · di_L/dt = top_Y = v_C → di_L/dt = v_C/L_b
  KCL: I_s = C·dv_C/dt + v_C/R_4 + i_L → 양변 d/dt: 0 = C·d²v_C/dt² + dv_C/dt/R_4 + di_L/dt = C·d²v_C/dt² + dv_C/dt/R_4 + v_C/L_b
  → d²v_C/dt² + (1/(R_4·C))·dv_C/dt + (1/(L_b·C))·v_C = 0
  값 대입: d²v_C/dt² + ${v.alpha}·dv_C/dt + ${v.beta}·v_C = 0
  특성: s² + ${v.alpha}·s + ${v.beta} = 0 → ω_0 = √${v.beta} = ${v.omega0}, ζ = ${v.zeta} → ${dampingKo}
  강제 v_C(∞) = 0 (L_b short → top_Y = GND).
  초기조건 v_C(0⁻)=${v.v_C_0minus}, dv_C(0⁺)/dt=${v.dvC_dt_0plus}로 일반해 결정:
  ${v.solutionForm}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림은 t=0에서 스위치가 단자 A에서 단자 B로 이동하는 RLC 회로이다. t≥0에서의 커패시터 양단 전압 v_C(t)를 제시된 <해석 절차>에 따라 단계별로 구하여 서술하시오. (단, t<0에서 회로는 직류 정상 상태이다.)",
  "conditions": ["V_s = ${v.V_s}V", "I_s = ${v.I_s}A", "R_top_L = ${v.R_top_L}Ω (좌측 top horizontal), R_top_R = ${v.R_top_R}Ω (우측 top horizontal)", "R_2v = ${v.R_2v}Ω (Leg2), R_3 = ${v.R_3}Ω (Leg3 R), R_4 = ${v.R_4}Ω (Leg4 R)", "L_a = ${fmt(v.L_a)}H (Leg3 L), L_b = ${fmt(v.L_b)}H (Leg5 L)", "C = ${fmt(v.C)}F (Leg4)", "SW SPDT, t=0에 A→B 전환", "t<0에서 회로는 직류 정상 상태"],
  "question":   "[단계 1] t<0일 때, 커패시터 양단 전압 v_C(0⁻)[V]와 인덕터 ${fmt(v.L_b)}[H]에 흐르는 전류 i_L(0⁻)[A]를 구하시오.\\n[단계 2] t≥0일 때, 키르히호프의 전류 법칙을 이용하여 dv_C(0⁺)/dt[V/sec]를 구하시오.\\n[단계 3] t≥0일 때, v_C(t)에 대한 2차 미분방정식과 커패시터 양단 전압 v_C(t)[V]를 순서대로 구하시오.",
  "answer":     "단계 1: v_C(0⁻) = ${v.v_C_0minus}V, i_L(0⁻) = ${v.i_L_0minus}A. 단계 2: dv_C(0⁺)/dt = ${v.dvC_dt_0plus} V/sec. 단계 3: 미방 d²v_C/dt²+${v.alpha}·dv_C/dt+${v.beta}·v_C=0, ${v.solutionForm} (${dampingKo}).",
  "solution":   "[단계 1] (위 풀이 식 단계 1을 자연스러운 한국어 서술로. t<0 DC SS에서 C 개방·L_a·L_b 단락 가정 명시. SW=A 위치이므로 좌측 leg1·2·3·4 활성, 우측 leg5·6 분리. 좌측 등가 저항 계산 후 top rail 전압 도출. 우측은 L_b short으로 i_L=I_s.)\\n[단계 2] (t≥0 SW=B 직후, 좌측 분리. 가운데+우측 회로 KCL. top_Y의 식. v_C·i_L 연속 사용. 답 ${v.dvC_dt_0plus} V/sec.)\\n[단계 3] (KCL을 d/dt하고 di_L/dt = v_C/L_b 대입. v_C 2차 미방 도출 d²v+${v.alpha}dv+${v.beta}v=0. 특성방정식 → ${dampingKo}. 초기조건으로 상수 결정. 최종: ${v.solutionForm}.)"
}

[엄수 규칙]
- 회로/곡선 figure 다시 만들지 마라.
- 값은 위 그대로. 정답은 코드 결정값.
- 단계 1·2·3 question 패턴 유지: "v_C(0⁻)·i_L(0⁻)" / "키르히호프 전류 법칙 dv_C(0⁺)/dt" / "2차 미분방정식 + v_C(t)".
- solution은 자연스러운 한국어. DC SS·KCL·KVL·미방 도출·초기조건 모두 포함.
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
  let parsed: Partial<SwitchedRlc5legTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<SwitchedRlc5legTextOutput>;
  } catch (e) {
    throw new Error(`SwitchedRlc5leg text JSON 파싱 실패: ${String(e)}`);
  }
  if (parsed.solution && !/(v_C\(0|vc\(0|미분|KCL)/i.test(parsed.solution)) {
    log.warn("solution_missing_keywords", { preview: parsed.solution.slice(0, 120) });
  }
  return {
    content: parsed.content ?? "Switched RLC 5-leg 회로 문제 (임용 9번 형식)",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1] v_C(0⁻)·i_L(0⁻). [단계 2] dv_C/dt. [단계 3] 미방 + v_C(t).",
    answer: parsed.answer ?? "(풀이 미생성)",
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function eqR2(R2: number, R3: number): number {
  return 1 / (1 / R2 + 1 / R3);
}

function fmt(x: number): string {
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  for (const denom of [2, 3, 4, 5, 6, 7, 8, 10]) {
    const numer = Math.round(x * denom);
    if (numer > 0 && Math.abs(x - numer / denom) < 1e-9) return `${numer}/${denom}`;
  }
  return String(Math.round(x * 10000) / 10000);
}

function roundFmt(x: number): string {
  return fmt(Math.round(x * 10000) / 10000);
}
