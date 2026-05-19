import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { AcParallelBranchesGeneration } from "./acParallelBranches";

const log = createLogger("lib/generation/topologies/acParallelBranchesTextWriter");

export type AcParallelBranchesTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeAcParallelBranchesText(args: {
  generation: AcParallelBranchesGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<AcParallelBranchesTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const phasor = (mag: number, ang: number) => `${mag}∠${ang}°`;

  // 시간영역 표기 (페이저 magnitude = rms이므로 peak = mag·√2)
  const i_L1_t = `${v.I_L1_mag}√2·cos(${v.omega}t${v.I_L1_ang >= 0 ? "+" : ""}${v.I_L1_ang}°)`;
  const i_C_t = `${v.I_C_mag}√2·cos(${v.omega}t${v.I_C_ang >= 0 ? "+" : ""}${v.I_C_ang}°)`;
  const i_R1_t = `${v.I_R1_mag}√2·cos(${v.omega}t${v.I_R1_ang >= 0 ? "+" : ""}${v.I_R1_ang}°)`;

  const userPrompt = `다음 정보로 임용 5번 형식의 "AC 다중 가지 phasor 회로" 문제를 작성하세요.
회로도는 코드가 이미 생성 — 너는 본문·조건·단계 question·풀이만 작성.

[회로 구조 — 코드가 figure 생성, 다시 만들지 마라]
교류 전원 + R + L_1 + I_S + L_2 + R + C 병렬 회로.
  V_s (AC), R_top = ${v.R_top}Ω (I_R1 흐름), 노드 N_L 분기
  N_L → L_1 (= ${fmtFr(v.L1)}H) → GND  (I_L1 측정)
  N_L → I_S (전류원, 미지) → N_R
  N_R → L_2 (= ${fmtFr(v.L2)}H) || R (= ${v.R}Ω) || C (= ${fmtFr(v.C)}F) → GND
  V_C는 C 양단 (= N_R-GND) 페이저.

[주어진 정보]
  ω = ${v.omega} [rad/s]
  i_L1(t) = ${i_L1_t} [A]  →  페이저 I_L1 = ${phasor(v.I_L1_mag, v.I_L1_ang)} [A] (rms)
  i_C(t)  = ${i_C_t} [A]   →  페이저 I_C  = ${phasor(v.I_C_mag, v.I_C_ang)} [A] (rms)

[학생 단계 — 임용 5번 패턴]
[단계 1] 커패시터 양단의 페이저 전압 V_C[V]를 구한다.
[단계 2] [단계 1]의 결과를 이용하여, ${fmtFr(v.L2)}[H] 인덕터에 흐르는 페이저 전류 I_L2[A]와 전류원의 페이저 전류 I_S[A]를 구한다.
[단계 3] [단계 2]의 결과를 이용하여, ${v.R_top}[Ω] 저항에 흐르는 전류 i_R1(t)[A]를 구한다.

[정답]
  단계 1: V_C = ${phasor(v.V_C_mag, v.V_C_ang)}V
  단계 2: I_L2 = ${phasor(v.I_L2_mag, v.I_L2_ang)}A, I_S = ${phasor(v.I_S_mag, v.I_S_ang)}A
  단계 3: I_R1 = ${phasor(v.I_R1_mag, v.I_R1_ang)}A  →  i_R1(t) = ${i_R1_t}[A]

[풀이 식 — 참고 골격]
─ 단계 1 ─
  C의 임피던스: Z_C = 1/(jωC) = 1/(j·${v.omega}·${fmtFr(v.C)}) = -j/${v.omega * v.C} = ${(1/(v.omega*v.C)).toFixed(4)}∠-90°Ω
  V_C = I_C · Z_C = ${phasor(v.I_C_mag, v.I_C_ang)} · ${phasor(1/(v.omega*v.C), -90)} = ${phasor(v.V_C_mag, v.V_C_ang)}V

─ 단계 2 ─
  L_2 임피던스: Z_L2 = jωL_2 = j·${v.omega}·${fmtFr(v.L2)} = ${v.omega * v.L2}∠90°Ω
  I_L2 = V_C / Z_L2 = ${phasor(v.V_C_mag, v.V_C_ang)} / ${phasor(v.omega*v.L2, 90)} = ${phasor(v.I_L2_mag, v.I_L2_ang)}A
  I_R = V_C / R = ${phasor(v.V_C_mag, v.V_C_ang)} / ${v.R} = ${phasor(v.I_R_mag, v.I_R_ang)}A
  KCL at N_R: I_S(들어옴) = I_L2 + I_R + I_C(나감)
  I_S = ${phasor(v.I_L2_mag, v.I_L2_ang)} + ${phasor(v.I_R_mag, v.I_R_ang)} + ${phasor(v.I_C_mag, v.I_C_ang)} = ${phasor(v.I_S_mag, v.I_S_ang)}A

─ 단계 3 ─
  KCL at N_L: I_R1(들어옴) = I_L1 + I_S(N_R로 나감)
  I_R1 = ${phasor(v.I_L1_mag, v.I_L1_ang)} + ${phasor(v.I_S_mag, v.I_S_ang)} = ${phasor(v.I_R1_mag, v.I_R1_ang)}A
  i_R1(t) = ${i_R1_t}A  (rms·√2 = peak)

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림은 교류 전원이 포함된 RLC 회로이다. 회로에서 ${fmtFr(v.L1)}[H] 인덕터에 흐르는 전류가 i_L1(t) = ${i_L1_t}[A]이고, 커패시터 전류가 i_C(t) = ${i_C_t}[A]일 때, i_R1(t)[A]를 제시된 <해석 절차>에 따라 단계별로 구하여 순서대로 서술하시오. (단, I_R1, I_L1, I_C는 각각 i_R1(t), i_L1(t), i_C(t)의 페이저 표현이고 페이저의 크기는 실효값이다.)",
  "conditions": ["ω = ${v.omega}[rad/s]", "R_top(I_R1 흐름) = ${v.R_top}Ω", "L_1 = ${fmtFr(v.L1)}H, L_2 = ${fmtFr(v.L2)}H", "R = ${v.R}Ω, C = ${fmtFr(v.C)}F", "i_L1(t) = ${i_L1_t}[A] (페이저 I_L1 = ${phasor(v.I_L1_mag, v.I_L1_ang)})", "i_C(t) = ${i_C_t}[A] (페이저 I_C = ${phasor(v.I_C_mag, v.I_C_ang)})"],
  "question":   "[단계 1] 커패시터 양단의 페이저 전압 V_C[V]를 구하시오.\\n[단계 2] [단계 1]의 결과를 이용하여, ${fmtFr(v.L2)}[H] 인덕터에 흐르는 페이저 전류 I_L2[A]와 전류원의 페이저 전류 I_S[A]를 구하시오.\\n[단계 3] [단계 2]의 결과를 이용하여, ${v.R_top}[Ω] 저항에 흐르는 전류 i_R1(t)[A]를 구하시오.",
  "answer":     "단계 1: V_C = ${phasor(v.V_C_mag, v.V_C_ang)}V. 단계 2: I_L2 = ${phasor(v.I_L2_mag, v.I_L2_ang)}A, I_S = ${phasor(v.I_S_mag, v.I_S_ang)}A. 단계 3: I_R1 = ${phasor(v.I_R1_mag, v.I_R1_ang)}A → i_R1(t) = ${i_R1_t}[A].",
  "solution":   "[단계 1] (위 풀이 식 단계 1을 자연스러운 한국어 서술로. Z_C 계산 → V_C = I_C·Z_C = ${phasor(v.V_C_mag, v.V_C_ang)}V.)\\n[단계 2] (위 풀이 식 단계 2. Z_L2 → I_L2 = V_C/Z_L2. I_R = V_C/R. KCL at N_R → I_S = I_L2+I_R+I_C.)\\n[단계 3] (위 풀이 식 단계 3. KCL at N_L → I_R1 = I_L1+I_S. 시간영역 변환 i_R1(t) = ${i_R1_t}A.)"
}

[엄수 규칙]
- 회로(figure) 다시 만들지 마라.
- 모든 값은 위 그대로. 정답은 코드 결정값 (V_C·I_L2·I_S·I_R1).
- 단계 1·2·3 question 패턴 유지.
- solution은 자연스러운 한국어. phasor 계산 (Z_C, Z_L2, KCL) 모두 풀이에 포함.
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
  let parsed: Partial<AcParallelBranchesTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<AcParallelBranchesTextOutput>;
  } catch (e) {
    throw new Error(`AcParallelBranches text JSON 파싱 실패: ${String(e)}`);
  }
  if (parsed.solution && !/(V_C|페이저|KCL)/i.test(parsed.solution)) {
    log.warn("solution_missing_keywords", { preview: parsed.solution.slice(0, 120) });
  }
  return {
    content: parsed.content ?? "AC 다중 가지 phasor 회로 문제 (임용 5번)",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1] V_C. [단계 2] I_L2·I_S. [단계 3] i_R1(t).",
    answer: parsed.answer ?? "(풀이 미생성)",
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function fmtFr(x: number): string {
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  for (const denom of [2, 4, 5, 10]) {
    const numer = Math.round(x * denom);
    if (numer > 0 && Math.abs(x - numer / denom) < 1e-9) return `${numer}/${denom}`;
  }
  return String(Math.round(x * 1000) / 1000);
}
