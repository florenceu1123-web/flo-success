import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { DcSupermeshGeneration } from "./dcSupermesh";

const log = createLogger("lib/generation/topologies/dcSupermeshTextWriter");

export type DcSupermeshTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export async function writeDcSupermeshText(args: {
  generation: DcSupermeshGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<DcSupermeshTextOutput> {
  const { generation, mode, topicLabel, contextHint } = args;
  const { netlist, branchCurrents, iMesh1, iMesh2, targetBranch, targetCurrent, values, archetype } = generation;

  const componentListText = netlist.components.map((c) => {
    const valStr = c.value !== undefined ? ` = ${c.value}` : "";
    return `  - ${c.id} (${c.type})${valStr}`;
  }).join("\n");

  const connectionsText = netlist.components.map((c) => {
    const nodes = c.pins.map((p) => p.node).join(" ↔ ");
    return `  - ${c.id}: ${nodes}`;
  }).join("\n");

  const valuesText = Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(", ");
  const branchListText = Object.entries(branchCurrents)
    .map(([id, I]) => `${id}: ${I}A`)
    .join(", ");

  const userPrompt = `다음 회로 정보로 임용 시험 스타일의 supermesh 해석 문제 텍스트를 작성하세요.
회로 자체(소자·값·연결)는 코드가 이미 결정했으므로 변경 금지 — 너는 문제 문장과 풀이만 작성.

[회로 archetype] ${archetype} (두 mesh가 vertical I source 가지를 공유 — supermesh로 풀이 필요)
[소자]
${componentListText}
[연결]
${connectionsText}
ground = ${netlist.ground ?? "GND"}

[사용 값] ${valuesText}

[솔버 결과 — 절대 변경 금지]
저항 전류: ${branchListText}
mesh 1 전류 (R1 방향) = ${iMesh1} A
mesh 2 전류 (R3 방향) = ${iMesh2} A
질문 대상: ${targetBranch} 통과 전류 = ${targetCurrent} A

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":    "회로 설명. 두 mesh가 전류원을 공유한다는 점을 명시 (supermesh 패턴 강조).",
  "conditions": ["V_1 = ...V, V_2 = ...V", "I_s = ...A (공유 가지)", "R_1, R_3 = ...Ω"],
  "question":   "${targetBranch}을 통과하는 전류 I를 supermesh 해석으로 구하시오 (한 문장)",
  "answer":     "I_${targetBranch} = ${targetCurrent} A",
  "solution":   "단계별 풀이:\\n  1) supermesh 정의: I_s가 끼인 가지의 두 mesh를 묶음\\n  2) supermesh 둘레에 KVL 적용 (I_s 가지 우회)\\n  3) 보조식: I_s = I_mesh1 - I_mesh2 (또는 +, 방향에 따라)\\n  4) 연립방정식 풀이 → I_${targetBranch} = ${targetCurrent} A"
}

[규칙]
- answer는 솔버 값 그대로. 다른 값으로 바꾸지 마라.
- solution은 supermesh 풀이 절차를 명시 (KVL + 보조 전류 조건 결합).
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
  let parsed: Partial<DcSupermeshTextOutput>;
  try { parsed = JSON.parse(raw) as Partial<DcSupermeshTextOutput>; }
  catch (e) { throw new Error(`DcSupermesh text JSON 파싱 실패: ${String(e)}`); }

  const enforcedAnswer = `I_${targetBranch} = ${targetCurrent} A`;
  if (parsed.answer && !looksLikeSameAnswer(parsed.answer, targetCurrent)) {
    log.warn("answer_mismatch_corrected", { gpt: parsed.answer, enforced: enforcedAnswer });
  }

  return {
    content: parsed.content ?? `주어진 회로에서 ${targetBranch} 전류를 supermesh로 구하시오.`,
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? `${targetBranch}을 통과하는 전류를 구하시오.`,
    answer: enforcedAnswer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

function looksLikeSameAnswer(text: string, expected: number): boolean {
  const m = text.match(/-?\d+(?:\.\d+)?/);
  if (!m) return false;
  return Math.abs(parseFloat(m[0]) - expected) < 0.01;
}
