import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { DcMeshGeneration } from "./dcMesh";

const log = createLogger("lib/generation/topologies/dcMeshTextWriter");

export type DcMeshTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeDcMeshText(args: {
  generation: DcMeshGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<DcMeshTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { netlist, branchCurrents, targetBranch, targetCurrent, values, archetype } = generation;

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

  const branchListText = Object.entries(branchCurrents)
    .map(([id, I]) => `${id}: ${I}A`)
    .join(", ");

  // 양수면 a→b 방향, 음수면 그 반대
  const dirHint = targetCurrent >= 0
    ? `${targetBranch}의 첫 번째 핀(p1) 방향에서 두 번째 핀(p2) 방향으로 흐르는 전류 기준`
    : `${targetBranch}의 두 번째 핀(p2) 방향에서 첫 번째 핀(p1) 방향으로 흐르는 전류 기준 (정답값은 음수)`;

  const userPrompt = `다음 회로 정보로 임용 시험 스타일의 mesh 해석 문제 텍스트를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 archetype] ${archetype}
[소자] ${componentListText}
[연결]
${connectionsText}
ground = ${netlist.ground ?? "GND"}

[사용 값] ${valuesText}

[솔버 결과 — 절대 변경 금지]
모든 저항 전류: ${branchListText}
질문 대상: ${targetBranch}에 흐르는 전류
정답: I_${targetBranch} = ${targetCurrent} A
방향 기준: ${dirHint}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명 (한국어). '아래 그림과 같은 회로에서…'로 시작 가능.",
  "conditions": ["주어진 조건들 — 소자 값"],
  "question":   "${targetBranch}을(를) 통과하는 전류 I를 구하시오 (한 문장)",
  "answer":     "I_${targetBranch} = ${targetCurrent} A",
  "solution":   "단계별 풀이:\\n  1) mesh 또는 노드 방정식 수립 (KVL/KCL)\\n  2) 연립방정식 풀이 (수치 대입)\\n  3) 최종 I_${targetBranch} = ${targetCurrent} A 도출"
}

[규칙]
- answer는 위의 전류값을 그대로 사용. 다른 값으로 바꾸지 마라.
- solution은 그 값에 도달하는 KVL/KCL 명시 풀이. LaTeX inline \\(...\\) 사용 가능.
- 회로 도식 다시 만들지 마라 (figureVariants 출력 금지). 코드가 처리.
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
  let parsed: Partial<DcMeshTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<DcMeshTextOutput>; }
  catch (e) {
    throw new Error(`DcMesh text JSON 파싱 실패: ${String(e)}`);
  }

  const enforcedAnswer = `I_${targetBranch} = ${targetCurrent} A`;
  if (parsed.answer && !looksLikeSameAnswer(parsed.answer, targetCurrent)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? `주어진 회로에서 ${targetBranch}에 흐르는 전류를 구하시오.`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? `${targetBranch}을(를) 통과하는 전류를 구하시오.`,
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function looksLikeSameAnswer(text: string, expected: number): boolean {
  // ±0.01 tolerance
  const m = text.match(/-?\d+(?:\.\d+)?/);
  if (!m) return false;
  return Math.abs(parseFloat(m[0]) - expected) < 0.01;
}
