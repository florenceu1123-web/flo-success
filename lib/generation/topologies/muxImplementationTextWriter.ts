import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { MuxImplementationGeneration } from "./muxImplementation";

const log = createLogger("lib/generation/topologies/muxImplementationTextWriter");

export type MuxImplementationTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * 4×1 MUX 등가구현 문제 — content/conditions/question 텍스트 작성 + 솔버 강제 answer/solution.
 *
 *   GPT 역할: content·conditions·question 자연어 작성 (3단계 풀이 형식 유지).
 *   솔버 강제: answer, solution은 코드가 enforced 값으로 덮어씀 (학습 정확성 보장).
 */
export async function writeMuxImplementationText(args: {
  generation: MuxImplementationGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<MuxImplementationTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;
  const a = generation.answer;
  const naIns = generation.naDiagram.inputs;

  const enforcedAnswer =
    `[단계 1] F(A,B,C) = ${v.posExpr}\n` +
    `[단계 2] F(A,B,C) = ${v.sopExpr}\n` +
    `[단계 3] ㉠ (I_0) = ${a.blank1},  ㉡ (I_1) = ${a.blank2}`;

  const enforcedSolution =
    `[단계 1] (가)의 출력은 3개 OR 게이트(2-입력) 출력을 AND한 결과로, 최대항의 곱(POS) 형태 \\(F(A,B,C) = ${v.posExpr}\\).\n` +
    `[단계 2] 위 POS를 분배법칙·흡수법칙·드모르간 등으로 전개하거나 진리표(아래)에서 F=1인 최소항만 모아 최소항의 합(SOP) 형태로 정리하면 \\(F(A,B,C) = ${v.sopExpr}\\).\n` +
    `진리표: ${formatTruthTable(v.truthTable)}\n` +
    `[단계 3] 선택선 \\(S_1=A, S_0=B\\)일 때 MUX 입력 \\(I_k\\)는 \\((A,B)=(k_1,k_0)\\)에서 F(A,B,C)를 C의 함수로 나타낸 식이다.\n` +
    `  I_0 = F(0,0,C): TT[0..1] = [${v.truthTable[0]},${v.truthTable[1]}] → ${a.blank1}\n` +
    `  I_1 = F(0,1,C): TT[2..3] = [${v.truthTable[2]},${v.truthTable[3]}] → ${a.blank2}\n` +
    `  I_2 = F(1,0,C): TT[4..5] = [${v.truthTable[4]},${v.truthTable[5]}] → ${naIns[2].value}\n` +
    `  I_3 = F(1,1,C): TT[6..7] = [${v.truthTable[6]},${v.truthTable[7]}] → ${naIns[3].value}\n` +
    `따라서 ㉠ = ${a.blank1}, ㉡ = ${a.blank2}.`;

  const userPrompt = `다음은 임용 5번 형식 — "조합논리회로(가) ↔ 4×1 MUX(나) 등가구현 + ㉠·㉡ 결정" 문제이다.
회로 figure(가·나)는 코드가 이미 결정 — 너는 문제 문장과 풀이만 작성.

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[(가) 회로 정보]
- 입력 변수: A, B, C (3개 NOT 게이트로 각각 A̅, B̅, C̅ 도출)
- 3개 OR 게이트(2-입력) — POS 인수 3개
- 1개 AND 게이트 — 3 OR 출력을 곱해 최종 F 산출
- F(A,B,C) = ${v.posExpr}

[(나) MUX 정보]
- 4×1 MUX, 선택선 S_1=A, S_0=B
- I_2 = ${naIns[2].value}, I_3 = ${naIns[3].value} (주어짐)
- I_0 = ㉠ (학생 도출), I_1 = ㉡ (학생 도출)

[솔버 결과 — 변경 금지]
${enforcedAnswer}

[출력 JSON]
{
  "content":    "그림 (가)는 입력변수 (A, B, C)를 갖는 조합논리회로이고, 그림 (나)는 4×1 멀티플렉서(MUX)를 이용한 (가)의 등가회로이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 모든 소자는 이상적으로 동작하며 S_1·S_0는 4×1 멀티플렉서의 선택선이다.)",
  "conditions": ["모든 소자는 이상적으로 동작", "S_1·S_0는 4×1 MUX의 선택선 (S_1=A, S_0=B)", "(나)의 데이터 입력 중 I_2·I_3은 주어진 값, I_0·I_1은 학생이 도출할 ㉠·㉡"],
  "question":   "[단계 1] (가)의 출력에 해당하는 불 함수 F(A,B,C)를 최대항의 곱 형태로 표현한다.\\n[단계 2] [단계 1]의 결과를 이용하여 F(A,B,C)를 최소항의 합 형태로 변환하여 표현한다.\\n[단계 3] [단계 2]의 결과를 이용하여 (가)와 (나)가 등가가 되도록 4×1 멀티플렉서의 I_0와 I_1에 대한 입력신호 ㉠과 ㉡을 각각 구한다.",
  "answer":     "(솔버 강제 — 너의 출력은 무시되고 enforcedAnswer가 사용됨)",
  "solution":   "(솔버 강제 — 너의 출력은 무시되고 enforcedSolution이 사용됨)"
}

[규칙]
- 회로 figure 다시 만들지 마라 — 코드가 처리.
- conditions·question은 원본 임용 5번 양식 그대로.
- LaTeX inline 사용 가능: \\(F(A,B,C)\\), \\(\\overline{A}\\) 등.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1600,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<MuxImplementationTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<MuxImplementationTextOutput>;
  } catch (e) {
    throw new Error(`MuxImplementation text JSON 파싱 실패: ${String(e)}`);
  }

  log.info("mux_implementation_text_generated", {
    posExpr: v.posExpr,
    sopExpr: v.sopExpr,
    blanks: `blank1=${a.blank1}, blank2=${a.blank2}`,
  });

  return {
    content: parsed.content ?? "(가) 조합논리회로 ↔ (나) 4×1 MUX 등가구현 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question:
      parsed.question ??
      "[단계 1] (가) F를 POS로 표현. [단계 2] SOP로 변환. [단계 3] ㉠·㉡ 결정.",
    answer: enforcedAnswer,
    solution: enforcedSolution,
  };
}

function formatTruthTable(tt: number[]): string {
  // "A B C | F" 형식 mini-string
  const rows: string[] = ["A B C | F"];
  for (let i = 0; i < 8; i++) {
    const A = (i >> 2) & 1;
    const B = (i >> 1) & 1;
    const C = i & 1;
    rows.push(`${A} ${B} ${C} | ${tt[i]}`);
  }
  return rows.join(" / ");
}
