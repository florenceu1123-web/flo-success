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
  const { nextState, output, d1Expression, d0Expression, zExpression, values, machineType } = generation;

  // 상태 전이 표 한국어 (Mealy / Moore 다른 표기)
  const transitionRows: string[] = [];
  for (let s = 0; s < 4; s++) {
    for (let x = 0; x < 2; x++) {
      const idx = (s << 1) | x;
      const sBits = s.toString(2).padStart(2, "0");
      const nsBits = nextState[idx].toString(2).padStart(2, "0");
      const zVal = machineType === "Mealy" ? output[idx] : output[s];
      const zLabel = machineType === "Mealy" ? `Z=${zVal}` : `(state Z=${zVal})`;
      transitionRows.push(`  S${s} (${sBits}), X=${x} → S${nextState[idx]} (${nsBits}), ${zLabel}`);
    }
  }

  const machineDescription = machineType === "Mealy"
    ? "Mealy 머신 — 출력 Z는 (상태, 입력)의 함수 (전이마다 출력)"
    : "Moore 머신 — 출력 Z는 (상태)만의 함수 (상태에 출력 부여)";

  const zDerivationNote = machineType === "Mealy"
    ? "Z = f(Q1, Q0, X) — 3변수 K-map"
    : "Z = f(Q1, Q0) only — 2변수 K-map (입력 X 무관, SOP 최소화 시 X don't-care로 처리됨)";

  // MUX form 답 — 합성기가 결정한 (S, I0, I1)
  const muxForms = generation.muxForms;
  const muxAnswerLine = (label: string, form: { S: string; I0: string; I1: string } | null) => {
    if (!form) return `${label}: (MUX 형태 합성 실패 — SOP 폴백)`;
    const fmt = (s: string) => (s.endsWith("_n") ? `${s.slice(0, -2)}'` : s);
    return `${label}: S=${fmt(form.S)}, I₀=${fmt(form.I0)}, I₁=${fmt(form.I1)}`;
  };
  const gMux = muxForms.D1;
  const hMux = muxForms.D0;
  const blankAnswerLine = [
    gMux ? `ㄱ = ${gMux.I0.endsWith("_n") ? gMux.I0.slice(0, -2) + "'" : gMux.I0}` : "ㄱ = ?",
    gMux ? `ㄴ = ${gMux.I1.endsWith("_n") ? gMux.I1.slice(0, -2) + "'" : gMux.I1}` : "ㄴ = ?",
    hMux ? `ㄷ = ${hMux.I0.endsWith("_n") ? hMux.I0.slice(0, -2) + "'" : hMux.I0}` : "ㄷ = ?",
    hMux ? `ㄹ = ${hMux.I1.endsWith("_n") ? hMux.I1.slice(0, -2) + "'" : hMux.I1}` : "ㄹ = ?",
  ].join(", ");

  const userPrompt = `다음 정보로 임용 시험 스타일의 ${machineType} FSM 설계 문제를 작성하세요.
문제 데이터(상태·전이·출력·도식)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[원본 출제 형식 — 그림 (가)·(나)·(다)]
그림 (가)는 ${machineType} FSM 상태 전이도 (Q1Q0 인코딩).
그림 (나)는 D 플립플롭 2개와 2×1 MUX 2개로 구성된 구현 회로.
  · 상단 MUX 출력 → D_A (D 플립플롭 A 입력, Q_A=Q1)
  · 하단 MUX 출력 → D_B (D 플립플롭 B 입력, Q_B=Q0)
  · MUX 입력 핀(ㄱ, ㄴ, ㄷ, ㄹ)에 들어갈 신호는 학생이 풀어야 한다.
그림 (다)는 2×1 MUX의 동작 특성표 (S=0 → F=I₀, S=1 → F=I₁).

[FSM 정보]
4-state ${machineType} 머신. ${machineDescription}.
상태 인코딩 Q1Q0 (S0=00, S1=01, S2=10, S3=11).
입력: X (1비트), 출력: Z (1비트).
${zDerivationNote}
상태 전이 + 출력:
${transitionRows.join("\n")}

[솔버 결과 — 절대 변경 금지]
D1 = ${d1Expression}   (D 플립플롭 A 입력, ${values.d1Terms}항)
D0 = ${d0Expression}   (D 플립플롭 B 입력, ${values.d0Terms}항)
Z  = ${zExpression}    (출력, ${values.zTerms}항)

[MUX 합성 결과 — 그림 (나)의 ㄱ~ㄹ 정답]
${muxAnswerLine("상단 MUX (D_A)", gMux)}
${muxAnswerLine("하단 MUX (D_B)", hMux)}
빈칸 정답: ${blankAnswerLine}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "그림 (가)는 ${machineType} FSM의 상태 전이도이고, 그림 (나)는 그림 (가)와 같이 동작하도록 D 플립플롭과 2×1 MUX를 사용해 구성한 디지털 논리 회로이다. 그림 (다)는 그림 (나)에서 사용되는 2×1 MUX의 동작 특성표이다. 모든 소자는 이상적으로 동작한다고 가정한다.",
  "conditions": ["4-state ${machineType} 머신 (S0~S3 = Q1Q0 = 00~11)", "입력 X, 출력 Z", "D 플립플롭 A·B (상태 Q_A=Q1, Q_B=Q0)", "그림 (나)에 2×1 MUX 2개 사용 — 입력 ㄱ/ㄴ/ㄷ/ㄹ에 들어갈 신호는 풀이 대상"],
  "question":   "[단계 1] 그림 (나)의 ㄱ, ㄴ, ㄷ, ㄹ을 각각 구하시오. (단, Q1, Q0, X, 그 보수 신호, 0 또는 1 사용)\\n[단계 2] 그림 (나)에서 D 플립플롭의 입력 D_A에 대한 곱 함수를 최소화된 SOP로 구하시오.\\n[단계 3] 그림 (나)에서 클럭의 주파수가 60Hz일 때, 출력 Q_A의 주파수(Hz)를 구하시오. (단, Q_A=0, Q_B=0 상태에서 시작한다.)",
  "answer":     "[단계1] ${blankAnswerLine}.\\n[단계2] D_A = ${d1Expression}.\\n[단계3] (상태 전이도에서 클럭당 Q_A 토글 횟수로 계산 — 풀이 참조)",
  "solution":   "[단계1] 그림 (다)의 MUX 특성 (S=0→I₀, S=1→I₁)에 따라 각 MUX 출력 = (Select가 0일 때 I₀, 1일 때 I₁). 상태 전이도에서 추출한 진리표 (Q1Q0X → D1D0)를 만족하도록 ㄱ~ㄹ을 결정:\\n  · 상단 MUX (D_A): S=${gMux?.S ?? "?"}, ㄱ=I₀=${gMux ? (gMux.I0.endsWith("_n") ? gMux.I0.slice(0,-2)+"'" : gMux.I0) : "?"}, ㄴ=I₁=${gMux ? (gMux.I1.endsWith("_n") ? gMux.I1.slice(0,-2)+"'" : gMux.I1) : "?"}\\n  · 하단 MUX (D_B): S=${hMux?.S ?? "?"}, ㄷ=I₀=${hMux ? (hMux.I0.endsWith("_n") ? hMux.I0.slice(0,-2)+"'" : hMux.I0) : "?"}, ㄹ=I₁=${hMux ? (hMux.I1.endsWith("_n") ? hMux.I1.slice(0,-2)+"'" : hMux.I1) : "?"}\\n[단계2] D_A = D1 = D-FF 특성에 의해 Q1+(다음 상태 Q1). 상태 전이도 8개 (Q1Q0X) 조합의 next Q1을 모은 3변수 K-map을 최소화하면 D_A = ${d1Expression}.\\n[단계3] 초기 상태 (Q_A=0, Q_B=0)에서 시작해 상태 전이도를 따라 사이클을 추적, 클럭당 Q_A의 토글 횟수를 세어 Q_A 주기 = N·클럭주기. 따라서 f_QA = 60/N Hz."
}

[규칙]
- answer는 코드가 미리 계산한 식·빈칸 정답 그대로. 다른 식으로 바꾸지 마라.
- solution은 각 단계 풀이 절차 명시. LaTeX inline 가능.
- 상태 전이도·구현 회로·MUX 특성표 다시 만들지 마라. 코드가 세 figure 모두 자동 생성.
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

  // 빈칸 정답·SOP 식 강제. 단계 3 (주파수)은 GPT 풀이에 위임.
  const enforcedAnswerPrefix = `[단계1] ${blankAnswerLine}.\n[단계2] D_A = ${d1Expression}.`;
  const gptAnswer = (parsed.answer ?? "").trim();
  // GPT가 작성한 단계3 부분만 추출 (있다면)
  const step3Match = gptAnswer.match(/\[단계\s*3\][^[]*/);
  const enforcedAnswer = step3Match
    ? `${enforcedAnswerPrefix}\n${step3Match[0].trim()}`
    : `${enforcedAnswerPrefix}\n[단계3] (Q_A 주파수는 상태 전이 사이클 분석 — 풀이 참조)`;

  if (gptAnswer && !gptAnswer.includes(d1Expression)) {
    log.warn("answer_mismatch_corrected", { gpt: gptAnswer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 FSM에서 그림 (나)의 빈칸과 D_A SOP, Q_A 주파수를 구하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "단계1·2·3을 차례대로 풀이하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}
