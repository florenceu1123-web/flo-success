import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { SequenceDetectorGeneration } from "./sequenceDetector";

const log = createLogger("lib/generation/topologies/sequenceDetectorTextWriter");

export type SequenceDetectorTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * 시퀀스 검출기 (임용 8번 정보과 형식) 문제 텍스트 생성.
 *
 *  - 3 figure는 코드가 결정 (블록도·상태도·상태표) — GPT는 본문+풀이만
 *  - 솔버가 강제한 답(blanks·SOP)은 enforcedAnswer로 변경 금지
 *  - 3 단계 풀이: (나) 빈칸 ㉠㉡㉢㉣ / 출력 z 최소화 SOP / D_A·D_B 최소화 SOP
 */
export async function writeSequenceDetectorText(args: {
  generation: SequenceDetectorGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<SequenceDetectorTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { pattern, blanks, sop, transitions } = generation;

  // 상태표 정답 — text writer 참조용 (figure는 학생에게 빈칸 표시)
  const stateTableAns = transitions
    .filter((t) => !t.isDontCare)
    .map((t) => `  (${t.fromState}, y=${t.input}) → (Q_A+=${t.toState[0]}, Q_B+=${t.toState[1]}, z=${t.output})`)
    .join("\n");

  const userPrompt = `다음 정보로 임용 8번 정보과 형식의 "시퀀스 검출기 + D 플립플롭 + 상태도·표 빈칸 채우기" 문제를 작성하세요.
3개 figure (블록도·상태도·상태표)는 이미 코드가 생성 — 너는 본문+조건+질문+풀이만 작성.

[패턴] '${pattern}' — 이 비트열이 입력 y에 순서대로 들어오면 출력 z = 1
[모드] ${mode === "exam_similar" ? "기출유사유형 (구조 동일, 패턴 같음)" : "기출변형유형 (구조 동일, 패턴 변형 가능)"}

[FSM 구조 — 그림은 이미 결정]
- 2개 D 플립플롭 A, B 사용 → 상태 (Q_A, Q_B) 4가지 (00, 01, 10, 11)
- 사용 상태: ${[...generation.usedStates].sort().join(", ")} / Don't care: ${["00", "01", "10", "11"].filter((s) => !(generation.usedStates as Set<string>).has(s)).join(", ") || "(없음)"}
- 초기 상태: (Q_A, Q_B) = (0, 0)
- 출력 z는 Mealy 모델: 현재 상태 + 현재 입력의 함수

[전이표 — 학생이 (다)에 채워야 할 정답]
${stateTableAns}

[(나) 상태 전이도 빈칸 ㉠㉡㉢㉣ — 정답]
- 검출 직전 상태 ${blanks.sourceState}에서:
  ㉠ = 입력 y=0일 때 다음 상태: ${blanks.a}
  ㉡ = 입력 y=0일 때 출력 z: ${blanks.b}
  ㉢ = 입력 y=1일 때 다음 상태: ${blanks.c}
  ㉣ = 입력 y=1일 때 출력 z: ${blanks.d}

[SOP 최소화 — Don't care(state '11') 활용한 정답]
- 출력 z = ${sop.z}
- D_A 입력 = ${sop.D_A}
- D_B 입력 = ${sop.D_B}

${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "본문 한 단락. (1) '그림 (가)는 입력 신호 y가 '${pattern}'의 순서로 입력될 때 출력 z가 1이 되는 시퀀스 검출기의 블록도이다' 류로 시작, (2) (나)는 2개의 D 플립플롭 A, B로 구성된 시퀀스 검출기의 상태도, (3) (다)는 (나)를 상태표로 나타낸 것, (4) <해석 절차>에 따라 단계별로 풀이 과정 + 결과 서술 지시, (5) 단서 괄호: (나)에서 y/z의 입력 y에 대한 출력 z, 빈(등그라미) 안의 ㉠㉡㉢㉣ 채우기, D 플립플롭 A·B의 출력 Q_A·Q_B로 인코딩, 초기상태 00, (다)의 x는 무관(don't care).",
  "conditions": ["검출 패턴: '${pattern}'", "D 플립플롭 2개 (A, B) — 상태 (Q_A, Q_B)", "Mealy 모델 (출력 z = f(현재 상태, 입력 y))", "초기 상태 (Q_A, Q_B) = (0, 0)", "(다)의 x는 don't care (무관)"],
  "question":   "[단계 1] (나)의 상태도에서 ㉠, ㉡, ㉢, ㉣에 해당하는 값을 순서대로 구하시오.\\n[단계 2] 단계 1의 결과를 (다)에 반영하여 검출기 출력 z의 최소화된 부울 함수를 구하시오.\\n[단계 3] 단계 1의 결과를 (다)에 반영하여 D 플립플롭 A, B의 입력 D_A와 D_B의 최소화된 부울 함수를 각각 구하시오.",
  "answer":     "[단계 1] ㉠=${blanks.a}, ㉡=${blanks.b}, ㉢=${blanks.c}, ㉣=${blanks.d}\\n[단계 2] z = ${sop.z}\\n[단계 3] D_A = ${sop.D_A}, D_B = ${sop.D_B}",
  "solution":   "[단계 1] 검출 패턴이 '${pattern}'이므로 검출 진입 직전 상태(${blanks.sourceState})에서 입력 y에 따른 다음 상태와 출력을 분석한다. 입력 y=0일 때 (${blanks.a === "00" ? "검출 진행 초기화" : `'${pattern}'의 다음 매칭 진행`}) → 다음 상태 ${blanks.a}, 출력 ${blanks.b}. 입력 y=1일 때 → 다음 상태 ${blanks.c}, 출력 ${blanks.d}. 따라서 ㉠=${blanks.a}, ㉡=${blanks.b}, ㉢=${blanks.c}, ㉣=${blanks.d}.\\n[단계 2] 단계 1을 (다)에 반영하면 출력 z의 minterm은 (Q_A, Q_B, y) 조합 중 z=1인 경우들. Q_A·Q_B=11은 don't care. K-map 최소화로 z = ${sop.z}.\\n[단계 3] 마찬가지로 D_A·D_B는 각각 다음 상태의 Q_A+·Q_B+ bit이 1인 minterm 집합. don't care 활용 K-map 최소화로 D_A = ${sop.D_A}, D_B = ${sop.D_B}."
}

[엄수 규칙]
- 3 figure 다시 만들지 마라. 코드가 처리.
- 솔버 값(blanks·SOP)은 그대로. 다른 식으로 바꾸지 마라.
- 단계 1·2·3 question 패턴 유지.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2200,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<SequenceDetectorTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<SequenceDetectorTextOutput>; }
  catch (e) { throw new Error(`SequenceDetector text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계 1] ㉠=${blanks.a}, ㉡=${blanks.b}, ㉢=${blanks.c}, ㉣=${blanks.d}\n[단계 2] z = ${sop.z}\n[단계 3] D_A = ${sop.D_A}, D_B = ${sop.D_B}`;

  if (parsed.solution) {
    const sol = parsed.solution;
    const missing: string[] = [];
    if (!/D_?A|D_?B|플립플롭/.test(sol)) missing.push("dff");
    if (!/㉠|㉡|㉢|㉣|상태도|상태 전이도/.test(sol)) missing.push("state_diagram");
    if (!/K-map|카르노|minterm|don't care|돈케어|don.t.care/i.test(sol)) missing.push("kmap_reasoning");
    if (missing.length > 0) {
      log.warn("seq_detector_solution_keywords", { missing, preview: sol.slice(0, 160) });
    }
  }

  return {
    content: parsed.content ?? `시퀀스 검출기 '${pattern}' + D 플립플롭 + 상태도/표 빈칸 채우기 문제 (임용 8번 정보과)`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "[단계 1] 상태도 빈칸. [단계 2] z SOP. [단계 3] D_A·D_B SOP.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
