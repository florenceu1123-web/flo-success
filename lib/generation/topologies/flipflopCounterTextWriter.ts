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
  const { nextState, sequenceText, ffInputs, ffType, archetype } = generation;

  // 상태 전이표
  const transitionRows: string[] = [];
  for (let s = 0; s < 4; s++) {
    const cur = s.toString(2).padStart(2, "0");
    const nxt = nextState[s].toString(2).padStart(2, "0");
    transitionRows.push(`  ${cur} → ${nxt}`);
  }

  // 정답 — ffInputs를 보고 동적 구성
  const answerParts = ffInputs.map((ff) => `${ff.name} = ${ff.expression}`);
  const answerString = answerParts.join(", ");

  const solutionStepsForFfType =
    ffType === "D"
      ? `D = Q+ (D 플립플롭의 특성 방정식). 각 출력 비트의 다음 상태를 K-map으로 최소화`
      : ffType === "T"
      ? `T = Q ⊕ Q+ (T 플립플롭의 특성 방정식 — XOR로 토글 여부 결정).\\n     · 0→0: T=0\\n     · 0→1: T=1\\n     · 1→0: T=1\\n     · 1→1: T=0\\n     각 출력 비트의 토글 조건을 K-map으로 최소화`
      : `JK 여기표 사용:\\n     · 0→0: J=0, K=X\\n     · 0→1: J=1, K=X\\n     · 1→0: J=X, K=1\\n     · 1→1: J=X, K=0\\n     don't-care(X)를 K-map 최소화에서 활용해 더 적은 게이트로 합성`;

  const userPrompt = `다음 정보로 임용 시험 스타일의 2비트 동기식 카운터 설계 문제를 작성하세요.
문제 데이터(상태순서·FF 입력·도식)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[카운터 정보]
2비트 동기식 카운터. ${ffType} 플립플롭 2개 사용 (Q1, Q0).
${archetype === "two_bit_jk_ff_cyclic" ? "JK FF는 don't-care 활용으로 D FF보다 게이트 수 절감 가능." : ""}

상태 전이 (현재 → 다음):
${transitionRows.join("\n")}
순환: ${sequenceText}

[솔버 결과 — 절대 변경 금지]
${answerParts.map((s) => `  ${s}`).join("\n")}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "문제 설명. 주어진 상태 순서를 ${ffType} FF로 구현하는 카운터 회로 설계 문제.",
  "conditions": ["2비트 동기식 카운터 (${ffType} 플립플롭 2개)", "현재 상태 Q1 Q0", "다음 상태 순서: ${sequenceText}"],
  "question":   "K-map을 이용해 ${ffInputs.map((f) => f.name).join(", ")} 입력 식을 최소화하고 구현 회로를 그리시오",
  "answer":     "${answerString}",
  "solution":   "단계별 풀이:\\n  1) 상태 전이표 작성:\\n${transitionRows.map((r) => "       " + r).join("\\n")}\\n  2) ${solutionStepsForFfType}\\n  3) 각 입력의 최소 SOP:\\n${ffInputs.map((f) => "     · " + f.name + " = " + f.expression).join("\\n")}\\n  4) NOT/AND/OR 게이트로 조합부 합성 후 해당 FF의 ${ffType === "D" ? "D" : ffType === "T" ? "T" : "J, K"} 입력으로 연결."
}

[규칙]
- answer는 솔버 식 그대로. 다른 식으로 바꾸지 마라.
- solution은 ${ffType} FF 특성 + K-map 풀이 절차 명시. LaTeX inline 가능.
- 회로 도식·K-map을 다시 만들지 마라. 코드가 ${ffInputs.length}개 K-map + 구현회로 1개 모두 자동 생성.
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

  if (parsed.answer && ffInputs.some((f) => !parsed.answer!.includes(f.expression))) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: answerString });
  }

  return {
    content: parsed.content ?? `주어진 상태 순서를 ${ffType} FF로 구현하는 카운터의 입력 식을 구하시오.`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? `${ffInputs.map((f) => f.name).join(", ")} 입력 식과 회로를 그리시오.`,
    answer: answerString,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
