import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { RlcStepGeneration } from "./rlcStep";

const log = createLogger("lib/generation/topologies/rlcStepTextWriter");

const DAMPING_LABEL: Record<RlcStepGeneration["answer"]["damping"], string> = {
  overdamped: "과감쇠 (overdamped)",
  critically_damped: "임계감쇠 (critically damped)",
  underdamped: "부족감쇠 (underdamped)",
};

export type RlcStepTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeRlcStepText(args: {
  generation: RlcStepGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<RlcStepTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { netlist, answer, values, archetype } = generation;

  const componentListText = netlist.components.map((c) => {
    const valStr = c.value !== undefined ? ` = ${c.value}` : "";
    return `  - ${c.id} (${c.type})${valStr}`;
  }).join("\n");

  const connectionsText = netlist.components.map((c) => {
    const nodes = c.pins.map((p) => p.node).join(" ↔ ");
    return `  - ${c.id}: ${nodes}`;
  }).join("\n");

  const valuesText = Object.entries(values)
    .map(([k, v]) => `${k} = ${v}`)
    .join(", ");

  const dampingLabel = DAMPING_LABEL[answer.damping];
  const omegaDStr = answer.omegaD !== undefined ? `, ω_d = ${answer.omegaD} rad/s` : "";

  const userPrompt = `다음 회로 정보로 임용 시험 스타일의 RLC step 응답 문제 텍스트를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 archetype] ${archetype} (V_C(0)=0, I_L(0)=0, t=0에 V1 인가, 직렬 RLC)
[소자]
${componentListText}
[연결]
${connectionsText}
ground = ${netlist.ground ?? "GND"}

[사용 값] ${valuesText}

[솔버 결과 — 절대 변경 금지]
α = ${answer.alpha} rad/s   (R/(2L))
ω₀ = ${answer.omega0} rad/s   (1/√(LC))
ζ = ${answer.zeta}   (α/ω₀)
damping = ${dampingLabel}${omegaDStr}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명 (한국어). '아래 그림과 같은 직렬 RLC 회로에 t=0에 V_1이 인가된다…'식.",
  "conditions": ["V_1 = ...V", "R_1 = ...Ω", "L_1 = ...mH", "C_1 = ...μF", "V_C(0) = 0V, I_L(0) = 0A"],
  "question":   "감쇠계수 α, 자연주파수 ω₀, 감쇠비 ζ를 구하고 감쇠 형태를 판별하시오",
  "answer":     "α = ${answer.alpha} rad/s, ω₀ = ${answer.omega0} rad/s, ζ = ${answer.zeta}, ${dampingLabel}${answer.omegaD !== undefined ? `, ω_d = ${answer.omegaD} rad/s` : ""}",
  "solution":   "단계별 풀이:\\n  1) α = R/(2L) 계산 후 수치 대입\\n  2) ω₀ = 1/√(LC) 계산 후 수치 대입\\n  3) ζ = α/ω₀ 계산 → 감쇠 형태 판정 (ζ<1 부족, ζ=1 임계, ζ>1 과감쇠)\\n  4) (해당 시) ω_d = √(ω₀² − α²) 계산"
}

[규칙]
- answer는 솔버 값 그대로. 다른 값으로 바꾸지 마라.
- solution은 그 값에 도달하는 수식·수치 대입 명시. LaTeX inline \\(...\\) 사용 가능 (\\\\(...\\\\)).
- 회로 도식 다시 만들지 마라. 코드가 처리.
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
  let parsed: Partial<RlcStepTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<RlcStepTextOutput>; }
  catch (e) {
    throw new Error(`RlcStep text JSON 파싱 실패: ${String(e)}`);
  }

  const enforcedAnswer = `α = ${answer.alpha} rad/s, ω₀ = ${answer.omega0} rad/s, ζ = ${answer.zeta}, ${dampingLabel}${answer.omegaD !== undefined ? `, ω_d = ${answer.omegaD} rad/s` : ""}`;
  if (parsed.answer && !looksConsistent(parsed.answer, answer.alpha, answer.omega0)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? "주어진 RLC 회로에서 감쇠 특성을 구하시오.",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "α, ω₀, ζ를 구하고 감쇠 형태를 판별하시오.",
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function looksConsistent(text: string, alpha: number, omega0: number): boolean {
  const re = (n: number) => new RegExp(String(n).replace(/\./g, "\\."));
  return re(alpha).test(text) && re(omega0).test(text);
}
