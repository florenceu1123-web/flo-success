import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import { formatKLabel, type MosfetCascodeGeneration } from "./mosfetCascodeMirror";

const log = createLogger("lib/generation/topologies/mosfetCascodeMirrorTextWriter");

export type MosfetCascodeTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * NMOS cascode current mirror 문제 텍스트 생성 (임용 10번 형식).
 *
 *  단계 1: M1의 V_GS1[V] + 저항 R[kΩ]
 *  단계 2: M2의 드레인 전압 V_D2[V]
 *  단계 3: M3의 V_GS3[V] + 소스 전압 V_S3[V] (V_GS3 이용)
 */
export async function writeMosfetCascodeMirrorText(args: {
  generation: MosfetCascodeGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<MosfetCascodeTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const kLabel = formatKLabel(v.K_uA_per_V2);

  const userPrompt = `다음 정보로 임용 10번 형식의 "NMOS cascode current mirror" 회로 문제를 작성하세요.
회로도는 코드가 이미 생성 (M1 reference + M2 mirror + M3 cascode + R(학생 도출) + R_G 분압 + R_top + 전류 I_ref) — 너는 본문·조건·단계 question·풀이만 작성.

[회로 구조 — 코드가 figure 생성, 다시 만들지 마라]
3-leg cascode current mirror (모든 NMOS 동일 특성: V_TH=${v.V_TH}V, I_D=K(V_GS−V_TH)², K=${kLabel}, 채널 길이 변조 무시).
  V_DD = ${v.V_DD}V
  좌측 leg (reference): V_DD ━ R(학생 도출) ━ M1.D=M1.G ━ M1.S=GND. I_M1 = I_ref = ${v.I_ref_mA}mA.
  가운데 leg (M3 게이트 분압): V_DD ━ R_G1=${v.R_G1_kohm}kΩ ━ V_G3 ━ R_G2=${v.R_G2_kohm}kΩ ━ GND.
  우측 leg (cascode 출력): V_DD ━ R_top=${v.R_top_kohm}kΩ ━ V_D3 ━ M3.D, M3.S=V_D2 ━ M2.D, M2.S=GND.
  M2.G = M1.G (current mirror wire). M3.G = V_G3 (분압점).

[학생이 풀어야 할 단계 — 임용 10번 패턴 그대로]
[단계 1] M1의 게이트-소스 전압 V_GS1[V]을 구하고, 이때의 저항 R[kΩ]을 구한다.
[단계 2] M2의 드레인 전압 V_D2[V]을 구한다.
[단계 3] M3의 게이트-소스 전압 V_GS3[V]을 이용하여 소스 전압 V_S3[V]을 구한다.

[정답 — 풀이의 도착점]
  단계 1: V_GS1 = ${v.V_GS1}V, R = ${v.R_kohm}kΩ
  단계 2: V_D2  = ${v.V_D2}V  (= V_S3, M3 source 노드)
  단계 3: V_GS3 = ${v.V_GS3}V, V_S3 = ${v.V_S3}V

[풀이 식 — 참고 골격 (solution에 자연스러운 한국어로 풀어쓸 것)]
  ─ 단계 1 ─
    M1은 diode-connected (G=D) → V_GS1 = V_DS1, M1은 항상 포화 영역에서 동작.
    포화 영역 식: I_ref = K·(V_GS1 − V_TH)²
    → V_GS1 = V_TH + √(I_ref/K) = ${v.V_TH} + √(${v.I_ref_mA}mA / ${kLabel.split(" ")[0]})
    → V_GS1 = ${v.V_GS1}V
    R = (V_DD − V_GS1) / I_ref = (${v.V_DD} − ${v.V_GS1}) / ${v.I_ref_mA}mA = ${v.R_kohm}kΩ
  ─ 단계 2 ─
    M2는 current mirror (M2.G = M1.G, M2.S = GND) → V_GS2 = V_GS1 = ${v.V_GS1}V → I_M2 = I_ref = ${v.I_ref_mA}mA
    M3는 직렬 (cascode, I_M3 = I_M2) → V_GS3 = V_TH + √(I_ref/K) = ${v.V_GS3}V (M1과 동일)
    M3 게이트: V_G3 = V_DD · R_G2/(R_G1+R_G2) = ${v.V_DD}·${v.R_G2_kohm}/(${v.R_G1_kohm}+${v.R_G2_kohm}) = ${v.V_G3}V
    M2.D = M3.S = V_S3 = V_G3 − V_GS3 = ${v.V_G3} − ${v.V_GS3} = ${v.V_S3}V
    ∴ V_D2 = ${v.V_D2}V
  ─ 단계 3 ─
    V_GS3 = V_TH + √(I_ref/K) = ${v.V_GS3}V (단계 2와 동일한 풀이)
    V_S3 = V_G3 − V_GS3 = ${v.V_G3} − ${v.V_GS3} = ${v.V_S3}V

[모드] ${mode === "exam_similar" ? "기출유사유형 — 회로·문항 구조 유지, 수치만 변경" : "기출변형유형 — 구조 유지, 수치 + 한정된 변형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림은 포화(saturation) 영역에서 동작하는 NMOS를 사용한 회로이며, 포화 영역에서 NMOS의 드레인 전류 I_D와 게이트-소스 전압 V_GS의 관계식은 I_D = ${kLabel.split(' ')[0]}·(V_GS − ${v.V_TH})²[A]이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 모든 NMOS는 동일한 특성을 가지며, 채널 길이 변조는 무시한다.)",
  "conditions": ["V_DD = ${v.V_DD}V", "I_ref(M1에 흐르는 전류) = ${v.I_ref_mA}mA", "M1·M2·M3 모두 동일 NMOS: V_TH = ${v.V_TH}V, K = ${kLabel}", "M3 게이트 분압: R_G1 = ${v.R_G1_kohm}kΩ, R_G2 = ${v.R_G2_kohm}kΩ", "출력 leg 저항: R_top = ${v.R_top_kohm}kΩ", "M2.G = M1.G (current mirror), M3.G = V_G3 (분압점)"],
  "question":   "[단계 1] M1의 게이트-소스 전압 V_GS1[V]을 구하고, 이때의 저항 R[kΩ]을 구하시오.\\n[단계 2] M2의 드레인 전압 V_D2[V]을 구하시오.\\n[단계 3] M3의 게이트-소스 전압 V_GS3[V]을 이용하여 소스 전압 V_S3[V]을 구하시오.",
  "answer":     "단계 1: V_GS1 = ${v.V_GS1}V, R = ${v.R_kohm}kΩ. 단계 2: V_D2 = ${v.V_D2}V. 단계 3: V_GS3 = ${v.V_GS3}V, V_S3 = ${v.V_S3}V.",
  "solution":   "[단계 1] (위 풀이 식 단계 1을 자연스러운 한국어 서술로. M1 diode-connected로 항상 포화, I_ref = K(V_GS1-V_TH)² 풀이, V_GS1 = ${v.V_GS1}V, KVL로 R = ${v.R_kohm}kΩ.)\\n[단계 2] (위 풀이 식 단계 2. M2 mirror → V_GS2=V_GS1, M3 cascode → 동일 V_GS3, V_G3 분압값 계산, V_S3 = V_G3 - V_GS3, V_D2 = V_S3 = ${v.V_D2}V.)\\n[단계 3] (위 풀이 식 단계 3. V_GS3 = V_GS1 = ${v.V_GS3}V (mirror+cascode 동일 전류), V_S3 = V_G3 - V_GS3 = ${v.V_S3}V.)"
}

[엄수 규칙]
- 회로(figure) 다시 만들지 마라 — 코드가 자동 생성.
- 모든 값은 위 그대로. 다른 값으로 바꾸지 마라.
- 단계 1·2·3 question은 위 패턴 유지: "M1 V_GS1·R / M2 V_D2 / M3 V_GS3·V_S3" 어구.
- solution은 자연스러운 한국어. KVL·포화 식·current mirror·cascode 모두 풀이에 포함.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2000,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<MosfetCascodeTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<MosfetCascodeTextOutput>;
  } catch (e) {
    throw new Error(`MosfetCascodeMirror text JSON 파싱 실패: ${String(e)}`);
  }

  if (parsed.solution && !/(mirror|cascode|V_GS1|V_GS3|V_S3)/i.test(parsed.solution)) {
    log.warn("solution_missing_cascode_keywords", { preview: parsed.solution.slice(0, 120) });
  }

  return {
    content: parsed.content ?? "NMOS cascode current mirror 회로 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1] V_GS1·R. [단계 2] V_D2. [단계 3] V_GS3·V_S3.",
    answer: parsed.answer ?? "(풀이 미생성)",
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
