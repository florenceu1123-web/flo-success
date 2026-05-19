import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import { formatK, type MosfetBiasGeneration } from "./mosfetBias";

const log = createLogger("lib/generation/topologies/mosfetBiasTextWriter");

export type MosfetBiasTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * NMOS DC bias 문제 텍스트 생성 (포화 영역 동작).
 *
 *  단계 절차 (단일 NMOS 단순 패턴):
 *    [단계 1] V_GS와 I_D 도출 (I_D = K·(V_GS − V_TH)²)
 *    [단계 2] V_D 도출 (V_D = V_DD − I_D·R_D)
 *    [단계 3] V_DS 도출 + 포화 동작 검증 (V_DS ≥ V_GS − V_TH)
 */
export async function writeMosfetBiasText(args: {
  generation: MosfetBiasGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<MosfetBiasTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const kLabel = formatK(v.K_uA_per_V2);
  const idMaA = round(v.I_D_mA, 4);
  const vd = round(v.V_D, 3);
  const vds = round(v.V_DS, 3);
  const vov = round(v.V_OV, 3);

  const userPrompt = `다음 정보로 포화 영역에서 동작하는 NMOS 회로 문제(임용 10번 형식)를 작성하세요.
회로도는 코드가 이미 생성 — 너는 본문·조건·단계 question·풀이만 작성.

[회로 구조 — 코드가 figure 생성, 다시 만들지 마라]
NMOS 단일 단(common source, R_S=0): V_DD ━ R_D ━ M1(D=V_D, G=V_G 외부, S=GND).
  V_DD = ${v.V_DD}V
  R_D  = ${v.R_D_kohm}kΩ
  V_G  = ${v.V_G}V  (외부 단자에 직접 인가)
  M1 NMOS — V_TH = ${v.V_TH}V, K = ${kLabel}
  포화 영역 가정. I_D = K·(V_GS − V_TH)² [A] (채널 길이 변조 무시)

[학생 풀이 단계 — 임용 10번 형식]
[단계 1] V_GS와 드레인 전류 I_D를 구한다.
[단계 2] 드레인 전압 V_D를 구한다.
[단계 3] 드레인-소스 전압 V_DS를 구하고, NMOS가 포화 영역에서 동작함을 확인한다.

[정답 — 풀이의 도착점]
  단계 1: V_GS = ${v.V_GS}V (= V_G), I_D = ${idMaA}mA
  단계 2: V_D  = ${vd}V (= V_DD − I_D·R_D = ${v.V_DD} − ${idMaA}·${v.R_D_kohm})
  단계 3: V_DS = ${vds}V (= V_D, R_S=0이므로 V_S=0).
           V_OV = V_GS − V_TH = ${vov}V.  V_DS(${vds}) ≥ V_OV(${vov}) → 포화 동작 확인.

[모드] ${mode === "exam_similar" ? "기출유사유형 — 회로·문항 구조 유지, 수치만 변경" : "기출변형유형 — 구조 유지, 수치 + 한정된 변형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림은 포화(saturation) 영역에서 동작하는 NMOS를 사용한 회로이며, 포화 영역에서 NMOS의 드레인 전류 I_D와 게이트-소스 전압 V_GS의 관계식은 I_D = K·(V_GS − V_TH)²[A]이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, K = ${kLabel}이고 V_TH = ${v.V_TH}[V]이며, 채널 길이 변조는 무시한다.)",
  "conditions": ["V_DD = ${v.V_DD}V", "R_D = ${v.R_D_kohm}kΩ", "V_G = ${v.V_G}V (게이트 단자에 직접 인가)", "M1 NMOS — V_TH = ${v.V_TH}V, K = ${kLabel}", "포화 영역 동작 (채널 길이 변조 무시)"],
  "question":   "[단계 1] V_GS와 드레인 전류 I_D[mA]를 구하시오.\\n[단계 2] 드레인 전압 V_D[V]를 구하시오.\\n[단계 3] 드레인-소스 전압 V_DS[V]를 구하고, NMOS가 포화 영역에서 동작함을 확인하시오.",
  "answer":     "단계 1: V_GS = ${v.V_GS}V, I_D = ${idMaA}mA. 단계 2: V_D = ${vd}V. 단계 3: V_DS = ${vds}V (V_OV = ${vov}V이므로 V_DS ≥ V_OV → 포화 영역 동작 확인).",
  "solution":   "[단계 1] R_S=0이므로 V_S=0, 따라서 V_GS = V_G = ${v.V_G}V. 포화 영역 식 I_D = K·(V_GS − V_TH)² = ${kLabel.split(' ')[0]}·(${v.V_GS} − ${v.V_TH})² = ${kLabel.split(' ')[0]}·${vov}² = ${idMaA}mA.\\n[단계 2] 키르히호프 전압 법칙(KVL)으로 V_D = V_DD − I_D·R_D = ${v.V_DD} − ${idMaA}mA·${v.R_D_kohm}kΩ = ${v.V_DD} − ${round(idMaA * v.R_D_kohm, 3)}V = ${vd}V.\\n[단계 3] R_S=0이므로 V_S=0 → V_DS = V_D = ${vds}V. 포화 동작 조건은 V_DS ≥ V_GS − V_TH = ${vov}V. 검산: V_DS(${vds}) ≥ V_OV(${vov}) → 만족 → NMOS는 포화 영역에서 동작."
}

[엄수 규칙]
- 회로(figure) 다시 만들지 마라 — 코드가 자동 생성.
- 모든 값은 위 그대로. 다른 값으로 바꾸지 마라.
- 단계 1·2·3 question은 위 패턴 유지. "V_GS 구하시오" "V_D 구하시오" "V_DS 구하고 포화 확인" 어구.
- solution은 자연스러운 한국어 서술. KVL·포화 식·검산 모두 포함.
- JSON 객체 하나만. 코드펜스 금지.`;

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
  let parsed: Partial<MosfetBiasTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<MosfetBiasTextOutput>;
  } catch (e) {
    throw new Error(`MosfetBias text JSON 파싱 실패: ${String(e)}`);
  }

  if (parsed.solution && !/(포화|saturation|V_GS|V_DS|I_D)/i.test(parsed.solution)) {
    log.warn("solution_missing_mosfet_keywords", { preview: parsed.solution.slice(0, 120) });
  }

  return {
    content: parsed.content ?? "NMOS 포화 영역 DC bias 회로 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1] V_GS·I_D. [단계 2] V_D. [단계 3] V_DS와 포화 확인.",
    answer: parsed.answer ?? "(풀이 미생성)",
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function round(x: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}
