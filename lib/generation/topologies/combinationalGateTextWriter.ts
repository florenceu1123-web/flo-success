import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { CombinationalGateGeneration } from "./combinationalGate";

const log = createLogger("lib/generation/topologies/combinationalGateTextWriter");

export type CombinationalGateTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeCombinationalGateText(args: {
  generation: CombinationalGateGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<CombinationalGateTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { func, gFunc, fExpression, gExpression, values, blankAnswers } = generation;

  const hasBlanks = blankAnswers.length > 0;
  const blankList = blankAnswers.map((b) => `${b.symbol} = ${b.answer}`).join(", ");
  const blankSection = hasBlanks
    ? `\n[빈칸 게이트 — 절대 변경 금지]\n회로 내 ${blankAnswers.map((b) => b.symbol).join(", ")} 자리는 학생이 답해야 할 빈칸이며 정답은 ${blankList}.`
    : "";
  const expectedAnswer = hasBlanks
    ? `F = ${fExpression}, G = ${gExpression}, ${blankList}`
    : `F = ${fExpression}, G = ${gExpression}`;

  const userPrompt = `다음 정보로 임용 시험 스타일의 조합 회로 설계 문제(다중 출력)를 작성하세요.
문제 데이터(변수·minterm·SOP·도식)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[조합 회로]
입력 변수: A, B, C
출력 F: F=1인 minterm = {${func.minterms.join(", ")}}
출력 G: G=1인 minterm = {${gFunc.minterms.join(", ")}}

[솔버 결과 — 절대 변경 금지]
F = ${fExpression}   (항 ${values.fTerms}개)
G = ${gExpression}   (항 ${values.gTerms}개)${blankSection}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "문제 설명. 그림 (가)는 입력변수 A, B, C에 대한 두 출력 F, G의 카르노 도, 그림 (나)는 그 카르노 도를 구현한 조합논리회로${hasBlanks ? "이며 회로 내 " + blankAnswers.map((b) => b.symbol).join("·") + "는 학생이 답해야 할 빈칸 논리게이트" : ""}임을 명시.",
  "conditions": ["입력 변수 A, B, C (3변수)", "F = Σm(${func.minterms.join(",")})", "G = Σm(${gFunc.minterms.join(",")})", "두 출력 모두 K-map으로 최소 SOP 도출"${hasBlanks ? `, "회로의 ${blankAnswers.map((b) => b.symbol).join(", ")}에 들어갈 논리 게이트를 답할 것"` : ""}],
  "question":   "${hasBlanks ? "[단계 1] K-map을 이용하여 F와 G에 대한 최소 SOP(곱의 합)을 각각 구하시오. [단계 2] 회로의 " + blankAnswers.map((b) => b.symbol).join("과 ") + "에 들어갈 논리 게이트를 각각 구하시오." : "F와 G 각각의 최소 SOP 식을 구하고, NOT 게이트를 공유한 통합 조합 회로를 그리시오"}",
  "answer":     "${expectedAnswer}",
  "solution":   "단계별 풀이:\\n  1) F의 minterm을 3변수 K-map에 표시 → 그루핑 → 최소 SOP: F = ${fExpression}\\n  2) G의 minterm을 K-map에 표시 → 그루핑 → 최소 SOP: G = ${gExpression}\\n  3) 통합 회로: 필요한 보수 신호용 NOT 게이트를 두 출력에 공유. 각 product term은 AND, 합산은 OR.${hasBlanks ? `\\n  4) 빈칸 게이트: 회로의 ${blankAnswers.map((b) => b.symbol).join(", ")} 위치는 product term을 형성하는 게이트이므로 ${blankList}.` : ""}"
}

[규칙]
- answer는 솔버 식 + 빈칸 정답 그대로. 다른 식으로 바꾸지 마라.
- solution은 K-map 그루핑 + NOT 게이트 공유 절차 명시. LaTeX inline 가능.${hasBlanks ? "\n- 빈칸 게이트(" + blankAnswers.map((b) => b.symbol).join(",") + ")의 정답은 위에 박혀있는 값 그대로 사용." : ""}
- 회로 도식·K-map을 다시 만들지 마라. 코드가 2 K-map + 1 통합회로 자동 생성.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<CombinationalGateTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<CombinationalGateTextOutput>; }
  catch (e) { throw new Error(`CombinationalGate text JSON 파싱 실패: ${String(e)}`); }

  if (parsed.answer && (!parsed.answer.includes(fExpression) || !parsed.answer.includes(gExpression))) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: expectedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 두 출력 F, G의 최소 조합 회로를 설계하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "F, G의 최소 SOP 식을 구하고 통합 회로를 그리시오.",
    answer: expectedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
