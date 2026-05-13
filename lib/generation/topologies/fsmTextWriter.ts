import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { FsmGeneration } from "./fsm";

const log = createLogger("lib/generation/topologies/fsmTextWriter");

export type FsmTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeFsmText(args: {
  generation: FsmGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<FsmTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { nextState, output, d1Expression, d0Expression, zExpression, values } = generation;

  // 상태 전이 표 한국어
  const transitionRows: string[] = [];
  for (let s = 0; s < 4; s++) {
    for (let x = 0; x < 2; x++) {
      const idx = (s << 1) | x;
      const sBits = s.toString(2).padStart(2, "0");
      const nsBits = nextState[idx].toString(2).padStart(2, "0");
      transitionRows.push(`  S${s} (${sBits}), X=${x} → S${nextState[idx]} (${nsBits}), Z=${output[idx]}`);
    }
  }

  const userPrompt = `다음 정보로 임용 시험 스타일의 Mealy FSM 설계 문제를 작성하세요.
문제 데이터(상태·전이·출력·도식)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[FSM 정보]
4-state Mealy 머신. 상태 인코딩 Q1Q0 (S0=00, S1=01, S2=10, S3=11).
입력: X (1비트), 출력: Z (1비트, Mealy = state·input 함수).
상태 전이 + 출력:
${transitionRows.join("\n")}

[솔버 결과 — 절대 변경 금지]
D1 = ${d1Expression}   (D 플립플롭 1 입력, ${values.d1Terms}항)
D0 = ${d0Expression}   (D 플립플롭 0 입력, ${values.d0Terms}항)
Z  = ${zExpression}    (Mealy 출력, ${values.zTerms}항)

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "문제 설명. 주어진 Mealy FSM 상태 전이도(코드가 자동 생성한 도식 참조)에서 D 입력과 출력 Z를 도출해 회로 설계.",
  "conditions": ["4-state Mealy 머신 (S0~S3 = Q1Q0 = 00~11)", "입력 X, 출력 Z (Mealy)", "D 플립플롭 2개 사용 (상태 레지스터)", "상태 전이도는 첨부 도식 참조"],
  "question":   "D1, D0, Z 식을 도출하고 통합 회로를 그리시오",
  "answer":     "D1 = ${d1Expression}, D0 = ${d0Expression}, Z = ${zExpression}",
  "solution":   "단계별 풀이:\\n  1) 상태 전이도에서 (Q1, Q0, X) 8가지 조합별 (next Q1+, Q0+, Z) 추출\\n  2) D = Q+ (D-FF 특성). 즉 D1=Q1+, D0=Q0+\\n  3) D1, D0, Z를 각각 3변수 함수 K-map으로 최소화:\\n     · D1 = ${d1Expression}\\n     · D0 = ${d0Expression}\\n     · Z = ${zExpression}\\n  4) NOT 게이트 공유한 조합부 회로 + 2개 D-FF로 통합 구현"
}

[규칙]
- answer는 솔버 식 그대로. 다른 식으로 바꾸지 마라.
- solution은 상태 전이도 해석 → D-FF 특성 → K-map 절차 명시. LaTeX inline 가능.
- 상태 전이도·구현 회로 다시 만들지 마라. 코드가 두 figure 모두 자동 생성.
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
  let parsed: Partial<FsmTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<FsmTextOutput>; }
  catch (e) { throw new Error(`Fsm text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `D1 = ${d1Expression}, D0 = ${d0Expression}, Z = ${zExpression}`;
  if (parsed.answer && (!parsed.answer.includes(d1Expression) || !parsed.answer.includes(zExpression))) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 Mealy FSM에서 D 입력과 출력 식을 도출하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "D1, D0, Z 식을 구하고 회로를 그리시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
