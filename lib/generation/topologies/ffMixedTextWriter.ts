import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { FfMixedGeneration } from "./ffMixedApplication";

const log = createLogger("lib/generation/topologies/ffMixedTextWriter");

export type FfMixedTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeFfMixedText(args: {
  generation: FfMixedGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<FfMixedTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { expressions, blankAnswers } = generation;

  const blankAnswerStr = blankAnswers
    .map((b) => `${b.symbol} = ${b.answer}`)
    .join(", ");

  const userPrompt = `다음 정보로 임용 시험 스타일의 T-FF + JK-FF 응용회로 문제를 작성하세요.
문제 데이터(회로·상태표·파형)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[원본 출제 형식 — 그림 (가)·(나)·(다)]
그림 (가): T 플립플롭(T-FF)과 JK 플립플롭(JK-FF)을 이용한 응용회로.
  · 외부 입력: X (1비트) + 클럭
  · 출력: Q_A (T-FF), Q_B (JK-FF)
  · 조합부: T_A = ${expressions.TA}, J_B = ${expressions.JB}, K_B = ${expressions.KB}
그림 (나): 그림 (가)의 동작을 정리한 상태표 — 8행 (Q_A·Q_B·X → T_A·J_B·K_B·Q_A(t+1)·Q_B(t+1)).
  · 일부 셀이 ㄱ, ㄴ, ㄷ 같은 빈칸 — 학생이 채워야 함.
그림 (다): 입력 X와 클럭의 파형도. 학생이 Q_A, Q_B의 출력 파형을 그려야 함. 시간축에 t₁~t₄ 마커.

[솔버 결과 — 절대 변경 금지]
T_A = ${expressions.TA}
J_B = ${expressions.JB}
K_B = ${expressions.KB}
빈칸 정답: ${blankAnswerStr}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림 (가)는 T 플립플롭과 JK 플립플롭을 이용한 응용회로이고, 그림 (나)는 그림 (가)의 상태표이다. 그림 (다)는 입력 X와 클럭이 인가될 때의 파형이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. 모든 소자는 이상적으로 동작하며, 각 플립플롭의 출력 Q_A와 Q_B의 초깃값은 모두 0이다.",
  "conditions": ["T-FF 1개(출력 Q_A), JK-FF 1개(출력 Q_B)", "외부 입력 X(1비트), 클럭 동기", "조합부는 (Q_A, Q_B, X)에서 (T_A, J_B, K_B) 도출", "Q_A·Q_B 초깃값 = 0"],
  "question":   "[단계 1] 그림 (나)의 ${blankAnswers.map((b) => b.symbol).join(", ")}을(를) 순서대로 각각 구하시오.\\n[단계 2] 그림 (가)의 출력 Q_A와 Q_B의 파형을 그림 (다)의 전체 구간에 각각 도시하시오.",
  "answer":     "[단계1] ${blankAnswerStr}.\\n[단계2] (파형은 그림 (다)의 시뮬레이션 결과 참조 — 풀이에 단계별 값 명시)",
  "solution":   "[단계1] 상태표는 (Q_A, Q_B, X) 8개 조합 각각에 대해 T-FF 특성식 Q_A(t+1) = Q_A ⊕ T_A와 JK-FF 특성식 Q_B(t+1) = J_B·Q_B' + K_B'·Q_B를 적용하여 채운다. 조합부 식은 T_A=${expressions.TA}, J_B=${expressions.JB}, K_B=${expressions.KB}이므로 각 행의 입력에 대입해 빈칸을 채운다: ${blankAnswerStr}.\\n[단계2] 초기 상태 Q_A=0, Q_B=0에서 시작해 매 클럭마다 (현재 Q_A, Q_B, 현재 X)로 T_A·J_B·K_B를 계산, 각 FF 특성식으로 다음 상태 결정. 그림 (다)의 X 파형을 따라 시간별 Q_A, Q_B를 도출한다."
}

[규칙]
- answer는 코드가 미리 계산한 빈칸 정답 그대로. 다른 값으로 바꾸지 마라.
- solution은 단계1(상태표 채우는 방법), 단계2(파형 도시 절차) 명시.
- 회로·상태표·파형 다시 만들지 마라. 코드가 세 figure 모두 자동 생성.
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
  let parsed: Partial<FfMixedTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<FfMixedTextOutput>; }
  catch (e) { throw new Error(`FfMixed text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswerPrefix = `[단계1] ${blankAnswerStr}.`;
  const gptAnswer = (parsed.answer ?? "").trim();
  const step2Match = gptAnswer.match(/\[단계\s*2\][^[]*/);
  const enforcedAnswer = step2Match
    ? `${enforcedAnswerPrefix}\n${step2Match[0].trim()}`
    : `${enforcedAnswerPrefix}\n[단계2] (파형은 그림 (다)의 시뮬레이션 결과 참조)`;

  if (gptAnswer && !blankAnswers.every((b) => gptAnswer.includes(b.symbol))) {
    log.warn("answer_blank_missing", { gpt: gptAnswer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "T-FF + JK-FF 응용회로에서 상태표 빈칸과 출력 파형을 구하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "단계1·2를 차례대로 풀이하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
