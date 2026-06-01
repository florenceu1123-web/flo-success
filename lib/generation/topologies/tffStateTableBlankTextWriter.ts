import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { TffStateTableBlankGeneration } from "./tffStateTableBlank";

const log = createLogger("lib/generation/topologies/tffStateTableBlankTextWriter");

export type TffStateTableBlankTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeTffStateTableBlankText(args: {
  generation: TffStateTableBlankGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<TffStateTableBlankTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { expressions, blankAnswers, qaNextSop, qbNextSop, ffTypes } = generation;

  // FF별 종류(변형유형에서 D-FF·혼합 D_A·T_B 가능)에 따라 문구·입력식·특성식 분기.
  const ffWord = (t: "TFF" | "DFF") => (t === "DFF" ? "D 플립플롭(D-FF)" : "T 플립플롭(T-FF)");
  const sameFf = ffTypes.A === ffTypes.B;
  const ffName = sameFf ? ffWord(ffTypes.A) : "플립플롭(F/F)";
  const ffTypeClause = sameFf ? "" : ` (단, 플립플롭 A는 ${ffWord(ffTypes.A)}, 플립플롭 B는 ${ffWord(ffTypes.B)}이다.)`;
  const inA = ffTypes.A === "DFF" ? "D_A" : "T_A";
  const inB = ffTypes.B === "DFF" ? "D_B" : "T_B";
  const charEqA = ffTypes.A === "DFF" ? "Q_A(t+1) = D_A" : "Q_A(t+1) = Q_A ⊕ T_A";
  const charEqB = ffTypes.B === "DFF" ? "Q_B(t+1) = D_B" : "Q_B(t+1) = Q_B ⊕ T_B";
  const charEq = `${charEqA}, ${charEqB}`;

  const blankAnswerStr = blankAnswers
    .map((b) => `${b.symbol} = ${b.answer}`)
    .join(", ");

  const userPrompt = `다음 정보로 임용 시험 스타일의 ${ffName} 2개 + 상태표 빈칸 + K-map 도출 문제(임용 7번 정보과 형식)를 작성하세요.
문제 데이터(회로·상태표·K-map)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[원본 출제 형식 — 그림 (가)·(나)]
그림 (가): ${ffName} 2개(A, B)와 1개의 입력 C로 구성된 순서논리회로. 조합부는 (Q_A, Q_B, C)에서 (${inA}, ${inB})를 도출.
  · ${inA} = ${expressions.TA}
  · ${inB} = ${expressions.TB}
그림 (나): 그림 (가)의 상태표 — 8행 (Q_A·Q_B·C → Q_A(t+1)·Q_B(t+1)).
  · 일부 셀이 ㉠~㉧ 빈칸 — 학생이 채워야 함.

[솔버 결과 — 절대 변경 금지]
${inA} 입력식: ${expressions.TA}
${inB} 입력식: ${expressions.TB}
플립플롭 특성식: ${charEq}
Q_A(t+1) = ${qaNextSop}
Q_B(t+1) = ${qbNextSop}
빈칸 정답: ${blankAnswerStr}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림 (가)는 2개의 ${ffName} A, B와 1개의 입력 C로 구성된 순서논리회로이고, 표 (나)는 (가)의 상태표이다.${ffTypeClause} 카르노도를 이용하여 다음 상태 Q_A(t+1)과 Q_B(t+1)의 최소화된 불 함수를 구하려고 한다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 모든 소자는 이상적으로 동작하며, 플립플롭의 초깃값은 Q_A·Q_B = 00이다.)",
  "conditions": ["${ffName} 2개 (A·B), 출력 Q_A·Q_B", "외부 입력 C (1비트), 클럭 동기", "조합부: (Q_A, Q_B, C) → (${inA}, ${inB})", "초깃값 Q_A·Q_B = 00"],
  "question":   "<해석 절차>\\n  [단계 1] 그림 (가)의 순서논리회로를 이용하여 2개의 ${ffName} A·B의 입력식 ${inA}와 ${inB}를 구하시오.\\n  [단계 2] 표 (나)에서 ${blankAnswers.map((b) => b.symbol).join("·")}에 해당하는 값을 순서대로 구하시오.\\n  [단계 3] [단계 2]에서 완성한 표 (나)를 이용하여 다음 상태 Q_A(t+1)과 Q_B(t+1)의 카르노도를 작성하여 구하고, 최소화된 불 함수를 구하시오.",
  "answer":     "[단계 1] ${inA} = ${expressions.TA}, ${inB} = ${expressions.TB}.\\n[단계 2] ${blankAnswerStr}.\\n[단계 3] Q_A(t+1) = ${qaNextSop}, Q_B(t+1) = ${qbNextSop}.",
  "solution":   "[단계 1] (가) 회로의 조합부 게이트 연결을 따라 ${inA}·${inB} 입력식을 도출. NOT 게이트로 보수 신호를 만들고 AND/OR/XOR/XNOR 결합. 결과: ${inA} = ${expressions.TA}, ${inB} = ${expressions.TB}.\\n\\n[단계 2] 플립플롭 특성식 ${charEq}를 적용. 상태표의 빈칸 행에 대해 (Q_A, Q_B, C) 입력을 대입하여 ${inA}·${inB} 값 도출 후 Q_A(t+1)·Q_B(t+1) 계산. ${blankAnswerStr}.\\n\\n[단계 3] 완성된 상태표의 Q_A(t+1)·Q_B(t+1) 컬럼을 (Q_A·Q_B 행) × (C 열) 카르노도에 1로 표시 후 그루핑. Quine-McCluskey로 최소화: Q_A(t+1) = ${qaNextSop}, Q_B(t+1) = ${qbNextSop}."
}

[규칙]
- answer는 코드가 미리 계산한 정답 그대로. 다른 값으로 바꾸지 마라.
- 플립플롭 종류 — A: ${ffWord(ffTypes.A)}, B: ${ffWord(ffTypes.B)}. 특성식: ${charEq}. T/D를 혼동하지 마라.
- solution은 [단계 1]·[단계 2]·[단계 3] 3단계 정확히 명시.
- 회로·상태표는 코드가 자동 figure로 생성. 텍스트로 다시 그리지 마라. K-map은 풀이 [단계 3] 산출물.
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
  let parsed: Partial<TffStateTableBlankTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<TffStateTableBlankTextOutput>; }
  catch (e) { throw new Error(`TffStateTableBlank text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계 1] ${inA} = ${expressions.TA}, ${inB} = ${expressions.TB}.\n[단계 2] ${blankAnswerStr}.\n[단계 3] Q_A(t+1) = ${qaNextSop}, Q_B(t+1) = ${qbNextSop}.`;
  const gptAnswer = (parsed.answer ?? "").trim();
  if (gptAnswer && !blankAnswers.every((b) => gptAnswer.includes(b.symbol))) {
    log.warn("answer_blank_missing", { gpt: gptAnswer });
  }

  return {
    content: parsed.content ?? `${ffName} 2개와 입력 C로 구성된 순서논리회로의 상태표 빈칸과 다음 상태 K-map을 구하시오.`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1]~[단계 3]을 차례대로 풀이하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
