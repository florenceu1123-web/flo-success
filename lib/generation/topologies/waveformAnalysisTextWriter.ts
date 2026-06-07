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
  // 출력 게이트 빈칸(㉠) 정답 — 학생이 타이밍 도표로 도출.
  const gateBlank = generation.logicNetworkDiagram.blanks?.[0];
  const gateAnswer = gateBlank?.answer ?? "OR";
  const gateSymbol = gateBlank?.symbol ?? "㉠";
  // 중간신호 Y 시퀀스 (학생이 단계1에서 그릴 빈칸 파형 정답).
  const ySeq = generation.ySequence;
  const yString = ySeq ? ySeq.join("") : "";

  // 각 t에서 (A,B,C) → F 표 한국어
  const evalRows: string[] = [];
  for (let t = 0; t < 8; t++) {
    const a = t & 1, b = (t >> 1) & 1, c = (t >> 2) & 1;
    evalRows.push(`  t=${t}: A=${a}, B=${b}, C=${c} → F=${outputSequence[t]}`);
  }

  const userPrompt = `다음 정보로 임용 시험 스타일의 조합논리 파형 분석 문제를 작성하세요.
문제 데이터(함수·입력 파형·출력 sequence·도식)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[조합 회로 (가)] — 입력 A, B, C. 출력 게이트 한 개가 빈칸 ${gateSymbol} 로 비어 있음 (학생이 도출).
NOT·AND 게이트로 각 항을 구성하고, 마지막 출력 게이트 ${gateSymbol}로 결합해 출력 F를 만든다.
F = ${fExpression}  (정답 회로의 출력 게이트 ${gateSymbol} = ${gateAnswer} 게이트)
F=1인 minterm: {${func.minterms.join(", ")}}

[입력·출력 파형 (나) (8 클럭 사이클, 단위 T) — 모두 사각파]
A: 주기 2T (01010101), B: 주기 4T (00110011), C: 주기 8T (00001111)
출력 F 시퀀스 (t=0..7): ${seqDotted}
각 사이클 평가:
${evalRows.join("\n")}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림 (가)는 입력 A, B, C를 갖는 조합논리회로이며 출력 게이트 ${gateSymbol}가 비어 있다. 그림 (나)는 (가)의 시간에 따른 입력 파형과 출력 파형(중간신호 Y는 비어 있음)이다. <해석 절차>에 따라 단계별로 풀이하시오. (단, 모든 소자는 이상적으로 동작한다.)",
  "conditions": ["입력 A: 주기 2T 사각파 (01010101)", "입력 B: 주기 4T 사각파 (00110011)", "입력 C: 주기 8T 사각파 (00001111)", "출력 F 파형은 (나)에 주어짐", "8 클럭 사이클 관찰"],
  "question":   "<해석 절차>\\n[단계 1] (나)의 타이밍 도표를 이용하여 중간신호 Y(AND 게이트 출력)의 파형을 그린다.\\n[단계 2] (가)의 출력 F 파형이 (나)의 F와 같을 때 빈칸 ${gateSymbol}에 들어갈 논리 게이트를 구한다.\\n[단계 3] 출력 F에 대한 카르노맵(Karnaugh map)과 최소화된 부울 함수를 구한다.",
  "answer":     "Y(t=0..7) = ${yString} / ${gateSymbol} = ${gateAnswer} 게이트 / F = ${fExpression}",
  "solution":   "단계별 풀이:\\n  [단계1] 각 t에서 (A,B,C)=(t&1,(t>>1)&1,(t>>2)&1) → Y(AND 출력) 시퀀스 = ${yString} (사각파로 도시).\\n  [단계2] 각 항 출력을 결합해 출력 F 시퀀스 ${seqString}가 되려면 ${gateSymbol}=${gateAnswer} 게이트.\\n  [단계3] F=1 minterm {${func.minterms.join(", ")}} → 카르노맵 묶기 → F = ${fExpression}.\\n  평가표:\\n${evalRows.map((r) => "       " + r).join("\\n")}"
}

[규칙]
- ${gateSymbol} 정답은 ${gateAnswer}, F 시퀀스는 ${seqString} — 변경 금지.
- question은 반드시 <해석 절차> 3단계 형식 유지.
- 회로 도식·파형을 다시 만들지 마라. 코드가 logic_network(${gateSymbol} 빈칸) + waveform 자동 생성.
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

  const enforcedAnswer = `Y(t=0..7) = ${yString} / ${gateSymbol} = ${gateAnswer} 게이트 / F = ${fExpression}`;
  if (parsed.answer && !parsed.answer.includes(seqString)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? `그림 (가)는 입력 A, B, C를 갖는 조합논리회로이며 출력 게이트 ${gateSymbol}가 비어 있다. (나)는 입력·출력 파형이다.`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? `<해석 절차>\n[단계 1] (나) 타이밍 도표로 중간신호 Y의 파형을 그린다.\n[단계 2] 출력 F와 같아지도록 ${gateSymbol} 게이트를 구한다.\n[단계 3] F의 카르노맵과 부울 함수를 구한다.`,
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
