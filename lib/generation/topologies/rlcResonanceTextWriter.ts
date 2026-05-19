import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { RlcResonanceGeneration } from "./rlcResonance";

const log = createLogger("lib/generation/topologies/rlcResonanceTextWriter");

export type RlcResonanceTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * RLC 공진/주파수응답 문제 텍스트 생성 (임용 9번 형식).
 *
 *  ★ 단계 절차 (원본 임용 9번 패턴):
 *    [단계 1] 그림 (나)에서 주파수가 f_x[Hz](비공진점)일 때 전류의 진폭이 I_x[A]이다.
 *             이 진폭 값을 이용하여 C 정전용량과 i(t)를 각각 구한다.
 *             ↳ −3dB point 풀이: |Z(jω_x)| = V_peak/I_x = R·√2
 *                                 → (ω_xL − 1/(ω_xC))² = R² → C 도출
 *                                 i(t) = I_x·cos(ωt + φ), φ = -arctan(X/R) = -π/4
 *    [단계 2] 단계 1의 C와 그림 (나)를 이용하여 최대 전류 I_max[A]와 그때의 주파수 f_0[Hz] 도출.
 *             ↳ I_max = V_peak/R, f_0 = 1/(2π√(LC))
 *
 *  ★ 그래프 (나)는 코드가 figure로 생성 — GPT는 그래프 다시 만들지 마라.
 *  ★ 회로도 (가)도 코드가 생성 — C는 그림에서 "C" 변수로 표기됨 (수치 미표기).
 */
export async function writeRlcResonanceText(args: {
  generation: RlcResonanceGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<RlcResonanceTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const topo = generation.topology === "series" ? "직렬" : "병렬";

  // 그래프 표기 일관성: f_x = ω_x/(2π) (정수 ω_x), f_0는 학생 도출.
  const fxExpr = `${v.omegaX}/(2π)`;        // 정수/(2π) 표기
  const ixExpr = formatCurrent(v.Ix);
  const imaxExpr = formatCurrent(v.Imax);
  const f0Approx = v.f0.toFixed(2);
  const omega0Approx = v.omega0.toFixed(2);

  const userPrompt = `다음 정보로 임용 9번 형식의 "RLC ${topo} 공진/주파수응답" 회로이론 문제를 작성하세요.
회로도(그림 (가))와 주파수응답 곡선(그림 (나))은 코드가 이미 생성 — 너는 본문·조건·단계 question·풀이만 작성.

[회로 구조 — 코드가 figure 생성, 다시 만들지 마라]
${topo} RLC 회로. v(t) = ${v.VpeakLabel}cos(ωt)[V] 인가.
  V_peak = ${v.VpeakLabel}V  (V_rms = ${v.Vrms}V)
  R = ${v.Rlabel}
  L = ${v.Llabel}
  C = 미지수 (학생이 단계 1에서 도출)

[그림 (나) — 주파수응답 곡선 — 코드가 figure 생성]
  x축: f [Hz],  y축: I [A] (i(t) 진폭, peak)
  곡선: 종 모양 공진 곡선
  ★ 표시된 측정점 — (f_x, I_x) = (${fxExpr}[Hz], ${ixExpr}[A])  ← 주어진 정보
  ★ 정점 위치(I_max·f_0)는 dashed로 표시되지만 수치는 미표기 — 학생이 도출

[학생이 풀어야 할 단계 — 원본 임용 9번 패턴]
[단계 1] 그림 (나)에서 주파수가 ${fxExpr}[Hz]일 때, 전류의 진폭 값 (${ixExpr}[A])을 이용하여
         커패시터 C의 정전용량 [μF] 과 전류 i(t) [A] 를 각각 구한다.
[단계 2] [단계 1]에서 구한 정전용량과 그림 (나)를 이용하여
         회로에서의 최대 전류 I_max [A]와 이때의 주파수 f_0 [Hz]를 각각 구한다.

[정답 — 풀이의 도착점]
  단계 1: C = ${v.Clabel}, i(t) = ${ixExpr}·cos(ωt − π/4)[A]  (−3dB point의 위상차 -45°)
  단계 2: I_max = ${imaxExpr}[A] (peak), f_0 = ${f0Approx}[Hz] (= ω_0/(2π), ω_0 ≈ ${omega0Approx}[rad/s])

[풀이 식 — 단계 1]
  주파수 f_x에서 |Z(jω_x)| = V_peak/I_x = ${v.VpeakLabel}/${ixExpr} = ${v.Rlabel}·√2 (= R√2)
  |Z|² = R² + (ω_xL − 1/(ω_xC))²  →  (ω_xL − 1/(ω_xC))² = R²
  ω_xL − 1/(ω_xC) = ±R.  C가 "${v.cLowerBoundLabel}보다 크다" 단서로 양수 case:
  ω_xL − 1/(ω_xC) = +R  →  1/(ω_xC) = ω_xL − R = ${v.omegaX}·${stripUnit(v.Llabel)} − ${v.R} = ${v.omegaX * v.L - v.R}
  →  C = 1/(${v.omegaX} · ${v.omegaX * v.L - v.R}) = ${v.Clabel}
  위상차 φ = -arctan(X/R) = -arctan(1) = -π/4
  i(t) = (V_peak/|Z|)·cos(ωt + φ) = ${ixExpr}·cos(ωt − π/4)[A]

[풀이 식 — 단계 2]
  공진 조건: X_L = X_C  →  ω_0L = 1/(ω_0C)  →  ω_0² = 1/(LC)
  ω_0 = 1/√(L·C) = 1/√(${stripUnit(v.Llabel)}·${v.Clabel.replace(/[μmF]/g, '')}·10⁻⁶) ≈ ${omega0Approx}[rad/s]
  f_0 = ω_0/(2π) ≈ ${f0Approx}[Hz]
  공진 시 |Z| = R  →  I_max = V_peak/R = ${v.VpeakLabel}/${v.R} = ${imaxExpr}[A]

[모드] ${mode === "exam_similar" ? "기출유사유형 — 회로·문항 구조 유지, 수치만 변경됨" : "기출변형유형 — 구조 유지, 수치 + 한정된 변형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림 (가)는 RLC ${topo}회로이고, 그림 (나)는 v(t)의 주파수에 따른 전류 i(t)의 진폭 I[A] 관계를 나타낸 것이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, v(t) = ${v.VpeakLabel}cos(ωt)[V]이고, v(t)의 페이저 표현은 ${v.Vrms}∠0°[V]이다. 커패시터 C의 정전용량(capacitance)은 ${v.cLowerBoundLabel}보다 크다.)",
  "conditions": ["R = ${v.Rlabel}", "L = ${v.Llabel}", "v(t) = ${v.VpeakLabel}cos(ωt)[V]", "그림 (나)에서 주파수가 ${fxExpr}[Hz]일 때 전류의 진폭 = ${ixExpr}[A]", "최대 전류 I_max는 주파수 f_0에서 발생 (수치 미표기)"],
  "question":   "[단계 1] 그림 (나)에서 주파수가 ${fxExpr}[Hz]일 때, 전류의 진폭 값(${ixExpr}[A])을 이용하여 커패시터 C의 정전용량[μF]과 전류 i(t)[A]를 각각 구하시오.\\n[단계 2] [단계 1]에서 구한 정전용량과 그림 (나)를 이용하여 회로에서의 최대 전류 I_max[A]와 이때의 주파수 f_0[Hz]를 각각 구하시오.",
  "answer":     "단계 1: C = ${v.Clabel}, i(t) = ${ixExpr}cos(ωt − π/4)[A]. 단계 2: I_max = ${imaxExpr}[A], f_0 ≈ ${f0Approx}[Hz] (= 1/(2π√(LC))).",
  "solution":   "[단계 1] (위 풀이 식 — 단계 1을 자연스러운 한국어 서술로 풀어쓸 것. R√2 도출, ω_xL − 1/(ω_xC) = ±R, 단서로 + case 선택, C = ${v.Clabel}, i(t) = ${ixExpr}cos(ωt − π/4)[A].)\\n[단계 2] (위 풀이 식 — 단계 2를 자연스러운 한국어 서술로 풀어쓸 것. 공진 조건 X_L=X_C, ω_0 = 1/√(LC) 계산, f_0 ≈ ${f0Approx}[Hz], 공진 시 |Z|=R이므로 I_max = V_peak/R = ${imaxExpr}[A].)"
}

[엄수 규칙]
- 회로(figure)와 그래프(figure) 모두 다시 만들지 마라 — 코드가 자동 생성.
- 모든 값(V_peak, R, L, f_x, I_x, C, I_max, f_0)은 위 그대로. 다른 값으로 바꾸지 마라.
- 단계 1 question은 반드시 "주파수가 ${fxExpr}[Hz]일 때, 전류의 진폭 값(${ixExpr}[A])을 이용하여 C 정전용량과 i(t)를 구한다" 패턴 유지.
- 단계 2 question은 반드시 "단계 1의 정전용량과 그림 (나)를 이용하여 I_max와 f_0를 구한다" 패턴 유지.
- 단계 1의 C는 학생이 도출하므로 question에는 "C는 ${v.Clabel}" 같은 정답 노출 금지. answer/solution에만.
- solution은 자연스러운 한국어 서술. 위 [풀이 식] 블록은 참고용 골격.
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
  let parsed: Partial<RlcResonanceTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<RlcResonanceTextOutput>;
  } catch (e) {
    throw new Error(`RlcResonance text JSON 파싱 실패: ${String(e)}`);
  }

  if (parsed.question && !parsed.question.includes(ixExpr)) {
    log.warn("question_missing_Ix_value", { ixExpr, preview: parsed.question.slice(0, 200) });
  }
  if (parsed.answer && !parsed.answer.includes(v.Clabel)) {
    log.warn("answer_missing_C", { Clabel: v.Clabel, preview: parsed.answer.slice(0, 200) });
  }

  return {
    content: parsed.content ?? `RLC ${topo} 공진/주파수응답 회로이론 문제`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1] C와 i(t)를 구하시오. [단계 2] I_max와 f_0를 구하시오.",
    answer: parsed.answer ?? "(풀이 미생성)",
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function formatCurrent(I: number): string {
  if (Math.abs(I) >= 0.001) {
    const rounded = Math.round(I * 10000) / 10000;
    return rounded.toString();
  }
  return I.toExponential(2);
}

/** "2H" → "2", "100mH" → "0.1", "500mH" → "0.5" — solution 식에서 SI 수치만 추출 */
function stripUnit(label: string): string {
  const m = label.match(/^([\d.]+)\s*(mH|H|μF|nF|kΩ|Ω)?$/);
  if (!m) return label;
  const n = parseFloat(m[1]);
  const u = m[2];
  if (u === "mH") return String(n * 1e-3);
  if (u === "μF") return String(n * 1e-6);
  if (u === "nF") return String(n * 1e-9);
  if (u === "kΩ") return String(n * 1e3);
  return String(n);
}
