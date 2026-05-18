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

  const userPrompt = `다음은 임용 8번 형식의 "2-bit 동기식 JK 카운터 + R-2R DAC + 비교기" 복합형 문제이다.
회로와 파형은 코드가 이미 결정 — 너는 문제 문장과 단계별 풀이만 작성.

[시스템 구성]
(가-1) 2개 JK 플립플롭 (J_A=K_A=V_CC, J_B=K_B=Q_A) — 동기식 2-bit 카운터 (00→01→10→11→00).
       출력: Q_A_bar, Q_B_bar.
(가-2) R-2R 저항망 DAC: Q_A·Q_B → V_DAC.
       OPAMP 비교기: V_DAC vs V_REF=${v.V_REF.toFixed(2)}V → V_o (V_CC=${v.V_CC}V 또는 GND).
(나)   파형: 클럭, Q_A_bar, Q_B_bar, V_o.

[값]
V_CC = ${v.V_CC} V, V_REF = ${v.V_REF.toFixed(2)} V, R unit = ${v.R_unit_kohm} kΩ.

[솔버 결과 — 변경 금지]
[단계 1] 카운터 시퀀스 (Q_A, Q_B): 00→01→10→11. Q_A_bar·Q_B_bar는 반전.
[단계 2] (나)의 ㉠ 시점에서 V+ = V_DAC = ${a.Vplus_at_marker.toFixed(2)} V.
[단계 3] V_o 시퀀스 (count 순서): [${a.Vo_sequence.join(", ")}] V.

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림 (가)는 2비트 동기식 카운터와 D/A 변환기 및 비교기를 이용한 응용 회로이다. 그림 (나)와 같이 클럭이 인가될 때, 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 비교기와 JK 플립플롭은 이상적으로 동작하고, JK 플립플롭 출력 Q_A_bar와 Q_B_bar의 초깃값은 모두 V_CC이며 비교기의 출력 V_o는 V_CC 또는 GND(ground)이다.)",
  "conditions": ["JK 플립플롭: J_A=K_A=V_CC, J_B=K_B=Q_A (동기식 2-bit 카운터)", "초기 Q_A_bar=Q_B_bar=V_CC (count=11에서 출발)", "DAC: R-2R 저항망, V_DAC = V_CC·(2·Q_B + Q_A)/4", "비교기: V_DAC > V_REF면 V_o = V_CC, 아니면 V_o = GND", "V_CC = ${v.V_CC}V, V_REF = ${v.V_REF.toFixed(2)}V"],
  "question":   "[단계 1] 그림 (가)의 Q_A_bar와 Q_B_bar의 파형을 그림 (나)의 전체 구간에 각각 도시하시오.\\n[단계 2] 그림 (나)의 ㉠ 시점에서, 그림 (가)의 비교기 입력 단자 중앙(+) 전압을 구하시오.\\n[단계 3] 그림 (가)의 비교기 출력 V_o의 파형을 그림 (나)의 전체 구간에 도시하시오.",
  "answer":     "[단계1] Q_A_bar·Q_B_bar는 클럭마다 2-bit 카운트 반전 (그림 (나) 도시 참조).\\n[단계2] V+ = V_DAC = ${a.Vplus_at_marker.toFixed(2)} V\\n[단계3] V_o 시퀀스: [${a.Vo_sequence.map(x => x === 0 ? "GND" : "V_CC").join(", ")}] (그림 (나) 도시 참조)",
  "solution":   "[단계1] J=K=V_CC=1이면 매 클럭마다 Q 토글. JK_B는 J=K=Q_A이므로 Q_A=1일 때만 토글. 결과: count 시퀀스 00→01→10→11→00. Q_A_bar·Q_B_bar는 그 반전.\\n[단계2] ㉠ 시점에서 (Q_A, Q_B) = (0, 1)이라 가정 시 V_DAC = V_CC·(2·1 + 0)/4 = V_CC/2 = ${a.Vplus_at_marker.toFixed(2)} V.\\n[단계3] 각 count에서 V_DAC > V_REF=${v.V_REF.toFixed(2)} 비교. V_DAC 시퀀스: 0, V_CC/4, V_CC/2, 3V_CC/4. 그중 V_REF 초과하는 case에서 V_o=V_CC=${v.V_CC}V."
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

  const enforcedAnswer = `[단계1] Q_A_bar·Q_B_bar 2-bit 카운트 (그림 (나))\n[단계2] V+ = ${a.Vplus_at_marker.toFixed(2)} V\n[단계3] V_o 시퀀스: [${a.Vo_sequence.join(", ")}] V`;
  if (parsed.answer && !parsed.answer.includes(a.Vplus_at_marker.toFixed(2))) {
    log.warn("counter_dac_answer_mismatch", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "2-bit 카운터 + DAC + 비교기 복합형 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "단계 1·2·3을 풀이하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
