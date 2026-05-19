import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { CounterDacComparatorGeneration } from "./counterDacComparator";

const log = createLogger("lib/generation/topologies/counterDacComparatorTextWriter");

export type CounterDacComparatorTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeCounterDacComparatorText(args: {
  generation: CounterDacComparatorGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<CounterDacComparatorTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const a = generation.answer;
  const bits = v.bits;
  const labels = bits === 3 ? ["A", "B", "C"] : ["A", "B"];
  const QbarList = labels.map((l) => `Q_${l}_bar`).join("·");
  const variantNote = mode === "exam_variant" && bits === 3
    ? "\n[변형 사항] 기출유사의 2-bit JK 카운터를 3-bit (JK_A·JK_B·JK_C)로 확장. R-2R 사다리도 한 단(Q_C 입력) 추가."
    : "";

  const nStates = 1 << bits;
  const dacFormula = bits === 3
    ? "V_DAC = V_CC·(4·Q_C + 2·Q_B + Q_A)/8"
    : "V_DAC = V_CC·(2·Q_B + Q_A)/4";
  const jkRules = bits === 3
    ? "J_A=K_A=V_CC, J_B=K_B=Q_A, J_C=K_C=Q_A·Q_B (동기식 3-bit 카운터)"
    : "J_A=K_A=V_CC, J_B=K_B=Q_A (동기식 2-bit 카운터)";

  const userPrompt = `다음은 임용 8번 형식의 "${bits}-bit 동기식 JK 카운터 + R-2R DAC + 비교기" 복합형 문제이다.
회로와 파형은 코드가 이미 결정 — 너는 문제 문장과 단계별 풀이만 작성.

[시스템 구성]
(가-1) ${bits}개 JK 플립플롭 (${jkRules}).
       카운터 시퀀스: ${nStates} 상태 순환 (${bits}-bit binary).
       출력: ${QbarList}.
(가-2) R-2R 저항망 DAC: ${labels.map((l) => `Q_${l}`).join("·")} → V_DAC.
       ${dacFormula}.
       OPAMP 비교기: V_DAC vs V_REF=${v.V_REF.toFixed(2)}V → V_o (V_CC=${v.V_CC}V 또는 GND).
(나)   파형: 클럭, ${labels.map((l) => `Q_${l}'`).join(", ")}, V_o.

[값]
V_CC = ${v.V_CC} V, V_REF = ${v.V_REF.toFixed(2)} V, R unit = ${v.R_unit_kohm} kΩ.

[솔버 결과 — 변경 금지]
[단계 1] 카운터 ${bits}-bit 시퀀스 순환. ${QbarList}는 반전.
[단계 2] (나)의 ㉠ 시점에서 V+ = V_DAC = ${a.Vplus_at_marker.toFixed(2)} V.
[단계 3] V_o 시퀀스 (count 0..${nStates - 1}): [${a.Vo_sequence.map((x) => x === 0 ? "GND" : "V_CC").join(", ")}].

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}${variantNote}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림 (가)는 ${bits}비트 동기식 카운터와 D/A 변환기 및 비교기를 이용한 응용 회로이다. 그림 (나)와 같이 클럭이 인가될 때, 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 비교기와 JK 플립플롭은 이상적으로 동작하고, JK 플립플롭 출력 ${QbarList}의 초깃값은 모두 V_CC이며 비교기의 출력 V_o는 V_CC 또는 GND(ground)이다.)",
  "conditions": ["JK 플립플롭: ${jkRules}", "초기 ${QbarList} = V_CC (count=${"1".repeat(bits)}에서 출발)", "DAC: R-2R 저항망, ${dacFormula}", "비교기: V_DAC > V_REF면 V_o = V_CC, 아니면 V_o = GND", "V_CC = ${v.V_CC}V, V_REF = ${v.V_REF.toFixed(2)}V"],
  "question":   "[단계 1] 그림 (가)의 ${QbarList}의 파형을 그림 (나)의 전체 구간에 각각 도시하시오.\\n[단계 2] 그림 (나)의 ㉠ 시점에서, 그림 (가)의 비교기 입력 단자 중앙(+) 전압을 구하시오.\\n[단계 3] 그림 (가)의 비교기 출력 V_o의 파형을 그림 (나)의 전체 구간에 도시하시오.",
  "answer":     "[단계1] ${QbarList}는 클럭마다 ${bits}-bit 카운트 반전 (그림 (나) 도시 참조).\\n[단계2] V+ = V_DAC = ${a.Vplus_at_marker.toFixed(2)} V\\n[단계3] V_o 시퀀스: [${a.Vo_sequence.map((x) => x === 0 ? "GND" : "V_CC").join(", ")}]",
  "solution":   "[단계1] J=K=V_CC=1이면 매 클럭마다 Q 토글. JK_B는 J=K=Q_A로 Q_A=1일 때 토글${bits >= 3 ? ". JK_C는 J=K=Q_A·Q_B로 두 LSB 모두 1일 때 토글" : ""}. 결과: count ${"0".repeat(bits)}→${(nStates - 1).toString(2).padStart(bits, "0")} 순환. ${QbarList}는 그 반전.\\n[단계2] ㉠ 시점에서 카운터 상태를 dac 식에 대입: ${dacFormula} → ${a.Vplus_at_marker.toFixed(2)} V.\\n[단계3] 각 count에서 V_DAC > V_REF=${v.V_REF.toFixed(2)} 비교. V_REF 초과하는 count에서 V_o=V_CC=${v.V_CC}V, 아닌 경우 GND."
}

[규칙]
- 솔버 값 그대로. V_DAC, V_o 수치를 다른 값으로 바꾸지 마라.
- 회로 figure 다시 만들지 마라. 코드가 자동 생성.
- 파형은 (나)에 코드가 자동 생성 — 단계 1·3에서 도시 형식만 명시.
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
  let parsed: Partial<CounterDacComparatorTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<CounterDacComparatorTextOutput>; }
  catch (e) { throw new Error(`CounterDacComparator text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계1] ${QbarList} ${bits}-bit 카운트 (그림 (나))\n[단계2] V+ = ${a.Vplus_at_marker.toFixed(2)} V\n[단계3] V_o 시퀀스: [${a.Vo_sequence.map((x) => x === 0 ? "GND" : "V_CC").join(", ")}]`;
  if (parsed.answer && !parsed.answer.includes(a.Vplus_at_marker.toFixed(2))) {
    log.warn("counter_dac_answer_mismatch", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? `${bits}-bit 카운터 + DAC + 비교기 복합형 문제`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "단계 1·2·3을 풀이하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
