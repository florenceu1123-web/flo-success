import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { WaveformAnalysisGeneration } from "./waveformAnalysis";

const log = createLogger("lib/generation/topologies/waveformAnalysisTextWriter");

export type WaveformAnalysisTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeWaveformAnalysisText(args: {
  generation: WaveformAnalysisGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<WaveformAnalysisTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { func, fExpression, outputSequence, values } = generation;

  const seqString = outputSequence.join("");
  const seqDotted = outputSequence.join(" ");

  // 각 t에서 (A,B,C) → F 표 한국어
  const evalRows: string[] = [];
  for (let t = 0; t < 8; t++) {
    const a = t & 1, b = (t >> 1) & 1, c = (t >> 2) & 1;
    evalRows.push(`  t=${t}: A=${a}, B=${b}, C=${c} → F=${outputSequence[t]}`);
  }

  const userPrompt = `다음 정보로 임용 시험 스타일의 파형 분석 문제를 작성하세요.
문제 데이터(함수·입력 파형·출력 sequence·도식)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[조합 회로]
입력 변수: A, B, C
F = ${fExpression}
F=1인 minterm: {${func.minterms.join(", ")}}

[입력 파형 (8 클럭 사이클, 단위 T)]
A: 주기 2T 사각파 (toggle every T)  — 시퀀스 01010101
B: 주기 4T 사각파 (toggle every 2T) — 시퀀스 00110011
C: 주기 8T 사각파 (toggle every 4T) — 시퀀스 00001111

[솔버 결과 — 절대 변경 금지]
출력 F 시퀀스 (t=0..7): ${seqDotted}
각 사이클 평가:
${evalRows.join("\n")}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "문제 설명. 주어진 조합 회로 F에 사각파 입력 A, B, C가 인가될 때 출력 F의 파형을 도출하는 문제임을 명시. 입력 패턴(주기 1·2·4 T)을 conditions에 명시.",
  "conditions": ["F = ${fExpression}", "A: 주기 2T 사각파 (01010101)", "B: 주기 4T 사각파 (00110011)", "C: 주기 8T 사각파 (00001111)", "8 클럭 사이클 동안 관찰"],
  "question":   "주어진 회로 F의 출력 파형을 그리고 8-클럭 시퀀스를 구하시오",
  "answer":     "F(t=0..7) = ${seqString}",
  "solution":   "단계별 풀이:\\n  1) 각 시간 t에서 (A, B, C) = (t & 1, (t>>1) & 1, (t>>2) & 1)\\n  2) F = ${fExpression}를 (A,B,C) 입력에 대입해 각 t에서 F 평가:\\n${evalRows.map((r) => "       " + r).join("\\n")}\\n  3) 출력 시퀀스 F = ${seqString}\\n  4) 사각파로 시간축 상에 표시 (코드가 자동 생성한 파형 도식 참조)"
}

[규칙]
- answer는 솔버 시퀀스 그대로. 다른 값으로 바꾸지 마라.
- solution은 각 t에서의 평가를 표로 보여줄 것. LaTeX inline 가능.
- 회로 도식·파형을 다시 만들지 마라. 코드가 logic_network + waveform 자동 생성.
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
  let parsed: Partial<WaveformAnalysisTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<WaveformAnalysisTextOutput>; }
  catch (e) { throw new Error(`WaveformAnalysis text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `F(t=0..7) = ${seqString}`;
  if (parsed.answer && !parsed.answer.includes(seqString)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 회로의 출력 파형을 도출하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "F의 8-클럭 출력 시퀀스를 구하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
