import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { KmapSopGeneration } from "./kmapSop";

const log = createLogger("lib/generation/topologies/kmapSopTextWriter");

export type KmapSopTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeKmapSopText(args: {
  generation: KmapSopGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<KmapSopTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { func, sopExpression, archetype, values } = generation;

  const mintermText = func.minterms.map((m) => `m${m}`).join(", ");
  const varNamesText = func.varNames.join(",");

  const userPrompt = `다음 정보로 임용 시험 스타일의 K-map / SOP 최소화 문제 텍스트를 작성하세요.
문제 데이터(변수·minterm·SOP·도식)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[archetype] ${archetype} (${func.vars}변수)
[변수] ${varNamesText}
[F=1인 minterm 인덱스] ${mintermText}
[원본 함수 표현] F(${varNamesText}) = Σm(${func.minterms.join(",")})

[솔버 결과 — 절대 변경 금지]
최소 SOP: F = ${sopExpression}
SOP term 수: ${values.sopTerms}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "문제 설명 (한국어). F(${varNamesText}) = Σm(${func.minterms.join(",")}) 함수가 주어진다고 명시.",
  "conditions": ["F(${varNamesText}) = Σm(${func.minterms.join(",")})", "${func.vars}변수 K-map으로 최소화"],
  "question":   "K-map을 이용해 최소 SOP를 구하고 회로로 구현하시오",
  "answer":     "F = ${sopExpression}",
  "solution":   "단계별 풀이:\\n  1) F=1인 minterm을 K-map cell에 표시\\n  2) 인접 1셀들을 가장 큰 2의 거듭제곱(1·2·4·8) 그룹으로 묶기 — Gray code 인접성\\n  3) 모든 1을 cover하는 essential prime implicant 선택\\n  4) 각 그룹에서 변하지 않는 변수만 남겨 product term 추출\\n  5) 결과: F = ${sopExpression}\\n  6) 회로 구현: NOT 게이트로 보수 신호 생성 → AND 게이트로 각 product term → OR 게이트로 합산"
}

[규칙]
- answer는 솔버 SOP 그대로. 다른 식으로 바꾸지 마라.
- solution은 K-map 그루핑 절차를 명시. LaTeX inline 가능.
- 회로 도식·K-map·진리표를 다시 만들지 마라. 코드가 3개 figure 모두 자동 생성.
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
  let parsed: Partial<KmapSopTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<KmapSopTextOutput>; }
  catch (e) { throw new Error(`KmapSop text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `F = ${sopExpression}`;
  if (parsed.answer && !parsed.answer.includes(sopExpression)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? `함수 F(${varNamesText}) = Σm(${func.minterms.join(",")})의 최소 SOP를 구하시오.`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "K-map으로 최소 SOP를 구하고 회로로 구현하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
