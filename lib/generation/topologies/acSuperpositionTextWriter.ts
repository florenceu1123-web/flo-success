import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { AcSuperpositionGeneration } from "./acSuperposition";

const log = createLogger("lib/generation/topologies/acSuperpositionTextWriter");

export type AcSuperpositionTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeAcSuperpositionText(args: {
  generation: AcSuperpositionGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<AcSuperpositionTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const v = generation.values;

  const userPrompt = `다음 정보로 임용 10번 형식의 "AC 다중 전원 + 중첩의 원리" 회로이론 문제를 작성하세요.
회로도는 코드가 이미 생성했음 — 너는 문제 문장과 풀이만 작성.

[회로 구조 — 그림은 이미 결정]
좌측 leg: V_s = ${v.Vs.label}  (AC 전압원, vertical, 위가 +)
좌상단 horizontal: L1 임피던스 = ${v.L1.label}  (V_s 위 노드 → 마디 a)
상단 가운데 horizontal: R1 = ${v.R1}Ω  (마디 a → 마디 b)
상단 우측 horizontal: R2 = ${v.R2}Ω  (마디 b → I_s 위 노드)
우측 leg: I_s = ${v.Is.label}  (AC 전류원, vertical, 위로 흐름)
중간 vertical leg (마디 a 위치에서 ground): R3 = ${v.R3}Ω + C1 임피던스 = ${v.C1.label} (직렬)

[학생이 풀어야 할 것 — 중첩의 원리]
[단계 1] I_s를 개방했을 때, 마디 a에서 b로 흐르는 전류 I_b1 [A]
[단계 2] V_s를 단락시켰을 때, 마디 a에서 b로 흐르는 전류 I_b2 [A]
[단계 3] 단계 1과 단계 2를 이용해 마디 a에서 b로 흐르는 전체 전류 I_b [A]와
         R1에 전달되는 평균 전력 P = (1/2)·|I_b|²·R1 [W]

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림은 교류 전압원과 교류 전류원이 포함된 회로이다. 중첩의 원리를 이용하여 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 결과를 서술하시오. (단, v_s(t) = ${v.Vs.magnitude}cos(ωt ${v.Vs.angle >= 0 ? "+" : "-"} ${Math.abs(v.Vs.angle)}°)[V], i_s(t) = ${v.Is.magnitude}cos(ωt ${v.Is.angle >= 0 ? "+" : "-"} ${Math.abs(v.Is.angle)}°)[A]이고, V_s와 I_s는 각각 v_s(t)와 i_s(t)의 페이저 표현이다.)",
  "conditions": ["V_s = ${v.Vs.label}", "I_s = ${v.Is.label}", "L1 임피던스 = ${v.L1.label}", "C1 임피던스 = ${v.C1.label}", "R1 = ${v.R1}Ω, R2 = ${v.R2}Ω, R3 = ${v.R3}Ω", "마디 a, b 사이의 전류와 R1 평균 전력 계산"],
  "question":   "[단계 1] 전류원 I_s를 개방하였을 때, 마디 a에서 b로 흐르는 전류[A]를 구하시오.\\n[단계 2] 전압원 V_s를 단락시켰을 때, 마디 a에서 b로 흐르는 전류[A]를 구하시오.\\n[단계 3] 단계 1과 단계 2를 이용하여 마디 a에서 b로 흐르는 전체 전류[A]와 R1 내부에 전달되는 전력[W]를 각각 구하시오.",
  "answer":     "단계 1·2의 phasor 합으로 I_b를 구하고 P = (1/2)|I_b|²·R1 [W]. (정확한 수치는 풀이 참조)",
  "solution":   "[단계1] I_s 개방 회로에서 V_s에 의한 마디 a→b 전류를 노드해석으로 구한다. Z_RC = R3 + (${v.C1.label}) = ${v.R3} + (${v.C1.label}) [Ω]. Z_path = R1 + R2 (직렬, b→I_s leg는 I_s 개방이므로 R2를 통과하지 않음. 실제로 Z_path는 회로 위상에 맞게 재계산). KCL로 풀이...\\n[단계2] V_s 단락 회로에서 I_s에 의한 마디 a→b 전류를 노드해석. ...\\n[단계3] I_b = I_b1 + I_b2. 평균 전력 P = (1/2)|I_b|²·R1."
}

[규칙]
- 회로도(figure) 다시 만들지 마라. 코드가 자동 생성.
- 모든 값(임피던스, 페이저)은 위 [회로 구조] 그대로. 다른 값으로 바꾸지 마라.
- 풀이는 phasor 영역 노드해석/메쉬해석으로. 시간영역 변환 금지 (페이저 그대로).
- 평균 전력 식 P = (1/2)·|I|²·R (rms로 변환 시 1/2 생략 가능하지만 여기서는 magnitude-based 표기).
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1400,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<AcSuperpositionTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<AcSuperpositionTextOutput>; }
  catch (e) { throw new Error(`AcSuperposition text JSON 파싱 실패: ${String(e)}`); }

  if (parsed.answer && !parsed.answer.includes("I_b") && !parsed.answer.includes("전력")) {
    log.warn("answer_missing_keywords", { answer: parsed.answer });
  }

  return {
    content: parsed.content ?? "AC 중첩의 원리 회로이론 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "단계 1·2·3을 풀이하시오.",
    answer: parsed.answer ?? "(풀이 미생성)",
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
