import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { RlcResonanceMaxPowerGeneration } from "./rlcResonanceMaxPower";

const log = createLogger("lib/generation/topologies/rlcResonanceMaxPowerTextWriter");

export type RlcResonanceMaxPowerTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeRlcResonanceMaxPowerText(args: {
  generation: RlcResonanceMaxPowerGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<RlcResonanceMaxPowerTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const a = generation.answer;

  const enforcedAnswer =
    `[단계 1] C = ${a.Clabel}\n` +
    `[단계 2] r_S = ${a.rS}Ω\n` +
    `[단계 3] R_L = ${a.RL}Ω, P_max = ${a.PmaxLabel}`;

  const enforcedSolution =
    `[단계 1] 공진 시 X_L = X_C → ω_0·L = 1/(ω_0·C) → C = 1/(ω_0²·L) = 1/((${v.omega0Label})² · ${v.Llabel}) = ${a.Clabel}.\n` +
    `[단계 2] 점선 박스의 5저항 Wheatstone 등가저항 r_S 계산: R1=${v.Rlabels[0]}, R2=${v.Rlabels[1]} (상단 직렬); R3=${v.Rlabels[2]}, R4=${v.Rlabels[3]} (하단 직렬); R5=${v.Rlabels[4]} (중앙 bridge). delta-Y 변환 또는 mesh 해석으로 r_S = ${a.rS}Ω.\n` +
    `[단계 3] 공진 시 LC 직렬 임피던스 0 → 전원이 보는 임피던스는 r_S + R_L (실수). 최대 전력 전달 조건 R_L = r_S = ${a.RL}Ω. 최대 평균전력 P_max = V_rms²/(4·R_L) = (V_peak/√2)²/(4·R_L) = ${v.Vpeak}²/(8·${a.RL}) = ${a.PmaxLabel}.`;

  const userPrompt = `다음은 임용 7번 형식 — "RLC 공진 + Wheatstone 5저항 등가 + R_L 최대전력" 문제이다.
회로 figure는 코드가 결정 — 너는 문제 문장과 풀이만 작성.

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[회로 정보]
- 입력 v(t) = ${v.Vpeak}·sin(ω₀·t) V, 공진주파수 ω₀ = ${v.omega0Label} rad/s
- 점선 박스 r_S: 5저항 Wheatstone (R1=${v.Rlabels[0]} 상단왼쪽, R2=${v.Rlabels[1]} 상단오른쪽, R3=${v.Rlabels[2]} 하단왼쪽, R4=${v.Rlabels[3]} 하단오른쪽, R5=${v.Rlabels[4]} 중앙)
- C: 학생 도출 변수 (수치 미표기)
- R_L: 점선 박스, 학생 도출 변수
- L = ${v.Llabel}

[솔버 결과 — 변경 금지]
${enforcedAnswer}

[출력 JSON]
{
  "content":    "그림은 공진주파수 ω₀ = ${v.omega0Label} [rad/sec]에서 최대 평균전력을 R_L에 전달하기 위한 회로이다. 입력 신호가 v(t) = ${v.Vpeak}sin(ω₀t) [V]일 때, 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오.",
  "conditions": ["회로는 공진 상태에서 동작 (ω = ω₀)", "이상 소자 가정", "v(t) = ${v.Vpeak}sin(ω₀t) [V], ω₀ = ${v.omega0Label} rad/sec", "L = ${v.Llabel}", "점선 박스 5저항: R1=${v.Rlabels[0]}, R2=${v.Rlabels[1]}, R3=${v.Rlabels[2]}, R4=${v.Rlabels[3]}, R5=${v.Rlabels[4]}"],
  "question":   "[단계 1] 공진 시 커패시터 용량 C [μF]를 구한다.\\n[단계 2] 점선 부분의 등가저항 r_S [Ω]를 구한다.\\n[단계 3] 공진 시 부하저항 R_L [Ω]를 구하고, R_L에 전달된 최대 평균전력[W]를 구한다.",
  "answer":     "(솔버 강제 — 너의 출력은 무시)",
  "solution":   "(솔버 강제 — 너의 출력은 무시)"
}

[규칙]
- 회로 figure 재생성 금지.
- conditions·question은 원본 임용 7번 양식 그대로.
- JSON 객체 하나만, 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1600,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<RlcResonanceMaxPowerTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<RlcResonanceMaxPowerTextOutput>;
  } catch (e) {
    throw new Error(`RlcResonanceMaxPower text JSON 파싱 실패: ${String(e)}`);
  }

  log.info("rlc_resonance_max_power_text_generated", {
    rS: a.rS,
    C: a.Clabel,
    RL: a.RL,
    Pmax: a.PmaxLabel,
  });

  return {
    content: parsed.content ?? "RLC 공진 + 최대전력전달 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1·2·3] C·r_S·R_L+P_max 도출",
    answer: enforcedAnswer,
    solution: enforcedSolution,
  };
}
