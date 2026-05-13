import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { FlipflopCounterGeneration } from "./flipflopCounter";

const log = createLogger("lib/generation/topologies/flipflopCounterTextWriter");

export type FlipflopCounterTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeFlipflopCounterText(args: {
  generation: FlipflopCounterGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<FlipflopCounterTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { nextState, d1Expression, d0Expression, sequenceText, values } = generation;

  // 상태 전이표 (4 rows): (Q1, Q0) → (Q1+, Q0+)
  const transitionRows: string[] = [];
  for (let s = 0; s < 4; s++) {
    const cur = s.toString(2).padStart(2, "0");
    const nxt = nextState[s].toString(2).padStart(2, "0");
    transitionRows.push(`  ${cur} → ${nxt}`);
  }

  const userPrompt = `다음 정보로 임용 시험 스타일의 2비트 D 플립플롭 카운터 설계 문제를 작성하세요.
문제 데이터(상태순서·D 입력·도식)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[카운터 정보]
2비트 동기식 카운터, D 플립플롭 2개 사용 (Q1, Q0가 현재 상태).
상태 전이 (현재 → 다음):
${transitionRows.join("\n")}
순환: ${sequenceText}

[솔버 결과 — 절대 변경 금지]
D1 = ${d1Expression}
D0 = ${d0Expression}
(D1 항: ${values.d1Terms}개, D0 항: ${values.d0Terms}개)

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "문제 설명. 주어진 상태 순서를 구현하는 2비트 D-FF 카운터 회로 설계 문제임을 명시.",
  "conditions": ["2비트 동기식 카운터 (D 플립플롭 2개)", "현재 상태 Q1 Q0", "다음 상태 순서: ${sequenceText}"],
  "question":   "K-map을 이용해 D1, D0 입력 식을 최소화하고 구현 회로를 그리시오",
  "answer":     "D1 = ${d1Expression}, D0 = ${d0Expression}",
  "solution":   "단계별 풀이:\\n  1) 상태 전이표 작성:\\n${transitionRows.map((r) => "       " + r).join("\\n")}\\n  2) D = Q+ (D 플립플롭의 특성 방정식). 즉 D_i는 다음 상태의 i번째 bit.\\n  3) Q1+ (=D1)와 Q0+ (=D0) 각각에 대해 K-map 작성 → 최소 SOP 도출:\\n     · D1 = ${d1Expression}\\n     · D0 = ${d0Expression}\\n  4) NOT 게이트로 보수 신호 → AND 게이트로 product term → OR로 합산해 D1, D0 생성. 각 출력을 해당 D-FF의 D 입력으로 연결."
}

[규칙]
- answer는 솔버 식 그대로. 다른 식으로 바꾸지 마라.
- solution은 D-FF 특성 + K-map 풀이 절차를 명시. LaTeX inline 가능.
- 회로 도식·K-map을 다시 만들지 마라. 코드가 K-map 2개 + 구현회로 1개 모두 자동 생성.
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
  let parsed: Partial<FlipflopCounterTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<FlipflopCounterTextOutput>; }
  catch (e) { throw new Error(`FlipflopCounter text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `D1 = ${d1Expression}, D0 = ${d0Expression}`;
  if (parsed.answer && (!parsed.answer.includes(d1Expression) || !parsed.answer.includes(d0Expression))) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 상태 순서를 구현하는 2비트 D-FF 카운터의 D 입력을 구하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "D1, D0 입력 식을 구하고 회로를 그리시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
