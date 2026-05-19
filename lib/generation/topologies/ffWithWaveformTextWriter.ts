import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { FfWithWaveformGeneration } from "./ffWithWaveform";

const log = createLogger("lib/generation/topologies/ffWithWaveformTextWriter");

export type FfWithWaveformTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeFfWithWaveformText(args: {
  generation: FfWithWaveformGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<FfWithWaveformTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { xExpression, yExpression, ffType } = generation;
  const ffName = ffType === "T" ? "T-플립플롭" : "D-플립플롭";
  const ffPin = ffType === "T" ? "T" : "D";
  const variantNote = mode === "exam_variant" && ffType === "T"
    ? "\n[변형 사항] 기출유사 D-플립플롭을 T-플립플롭으로 변경했고, X 식에 XOR(⊕) 게이트를 강제 포함."
    : "";

  const userPrompt = `다음 정보로 임용 8번 형식의 "${ffName} + 게이트 응용 회로 + 파형" 문제를 작성하세요.
회로·파형 데이터는 코드가 이미 결정 — 너는 문제 문장과 풀이만 작성.

[원본 형식 — 그림 (가), (나)]
그림 (가): 게이트들과 비동기 RESET 입력을 갖는 ${ffName}으로 구성된 응용 회로.
  · 외부 입력: A, B, C  (3개만 — CLK는 외부 입력이 아니다)
  · 내부 신호: X = SOP/XOR(A, B, C) → ${ffName}의 CLK 핀(▷)에 연결 (게이트 출력이 곧 클럭)
                Y = SOP(A, B, C) → ${ffName}의 R 핀 (비동기 RESET)
  · ${ffPin} 핀 ← Q'(자기 피드백) — 매 클럭 상승 에지에서 Q 토글.
  · 출력: Q. Q 초기값 = 0.
그림 (나): 입력 A, B, C의 파형 + CLK(=X) + 출력 X, Y, Q의 파형. 버퍼 전파 지연 시간 tp 표기.

[솔버 결과 — 변경 금지]
X = ${xExpression}   (CLK로 사용되는 게이트 출력)
Y = ${yExpression}   (비동기 RESET로 사용되는 게이트 출력)
FF 종류: ${ffType} (비동기 RESET 포함)${variantNote}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림 (가)는 게이트들과 비동기 리셋(RESET) 입력을 갖는 ${ffName}으로 구성된 응용 회로이다. 입력 신호 A, B, C가 그림 (나)와 같이 입력될 때, 제시된 <해석 절차>에 따라 각 단계별 풀이 과정과 결과를 서술하시오. (단, 그림 (가)에서 버퍼의 전파 지연 시간(propagation delay time)을 제외하고 모든 소자의 특성은 이상적이다. ${ffName} 입력의 변화는 그림 (나)의 버퍼 전파 지연 시간 tp만큼 지연되어 감지된다.)",
  "conditions": ["외부 입력은 A, B, C 3개", "내부 신호 X가 ${ffName}의 CLK 입력으로 동작", "내부 신호 Y가 ${ffName}의 비동기 RESET으로 동작", "${ffPin} 핀에는 Q' 피드백 (자기 토글)", "Q 초기값 = 0", "버퍼 전파 지연 tp 제외 모든 소자 이상적"],
  "question":   "[단계 1] 입력 A, B, C를 이용하여 출력 X에 대한 최소화된 불 함수(Boolean function)를 합의 곱(product of sum) 형태로 구하고, 그림 (나)의 전체 구간에 X를 도시하시오.\\n[단계 2] 그림 (가)의 출력 Y와 ${ffName}의 출력 Q를 그림 (나)의 전체 구간에 각각 도시하시오. (단, Q의 초깃값은 0이다.)",
  "answer":     "[단계1] X = ${xExpression}. (X 파형은 그림 (나) 시뮬레이션 참조)\\n[단계2] Y = ${yExpression}. Q는 X의 상승 에지마다 토글(${ffPin}=Q'), Y=1이면 비동기 RESET으로 Q=0 (그림 (나) 시뮬레이션 참조).",
  "solution":   "[단계1] (A, B, C) 8개 조합으로 진리표를 만들어 X 값을 채우고 K-map 또는 대수적 변형으로 최소화하면 X = ${xExpression}. 입력 파형의 매 단위 시간마다 (A, B, C) 값을 대입해서 X 파형을 도시.\\n[단계2] Y는 동일 방식으로 ${yExpression}. ${ffName}은 CLK(=X) 상승 에지에서 ${ffPin}=Q'를 캡쳐하므로 Q가 토글한다. 단, Y=1 구간은 비동기 RESET이 우선 적용돼 Q=0으로 강제. 초기 Q=0에서 시작해 시뮬레이션."
}

[규칙]
- answer는 코드 계산값 그대로. 다른 식으로 바꾸지 마라.
- 회로·파형 figure 다시 만들지 마라. 코드가 자동 생성.
- CLK·RESET을 외부 입력으로 표기하지 마라. 내부 신호 X·Y가 각각 그 역할을 한다.
- JSON 객체 하나만. 코드펜스 금지.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1200,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<FfWithWaveformTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<FfWithWaveformTextOutput>; }
  catch (e) { throw new Error(`FfWithWaveform text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `[단계1] X = ${xExpression}.\n[단계2] Y = ${yExpression}, ${ffName}은 CLK(=X) 상승 에지마다 ${ffPin}=Q'를 캡쳐하므로 Q 토글. Y=1 구간은 비동기 RESET으로 Q=0 강제. (그림 (나) 참조)`;
  if (parsed.answer && !parsed.answer.includes(xExpression)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "D-FF + 게이트 응용 회로 + 파형 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "단계1·2를 풀이하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
