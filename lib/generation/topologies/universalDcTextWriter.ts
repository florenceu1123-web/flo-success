import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { DcQueryResult } from "@/lib/solver/universalDc";
import type { TopologyDrivenGeneration } from "../topologyDriven/buildFromTopology";

const log = createLogger("lib/generation/topologies/universalDcTextWriter");

export type UniversalDcTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * 임의 DC 회로(V/I/R) + 다단계 query에 대한 텍스트 작성.
 *
 *   결정론 layer:
 *     - 회로(소자/값/연결): buildFromTopology가 결정
 *     - 정답(node V, 전력, inverse R): universalDc solver가 산출
 *   GPT layer: content/conditions/question 자연어. answer/solution은 solver 결과로 강제.
 *
 *   query 그룹화 규칙 (단계 매핑):
 *     - 1번째 단계: 첫 번째 batch (node voltage 들)
 *     - 2번째 단계: totalPower (있으면)
 *     - 3번째 단계: inverseR (있으면) + 그 결과로 다시 풀어 얻는 nodeVoltage
 */
export async function writeUniversalDcText(args: {
  generation: TopologyDrivenGeneration;
  queryResults: DcQueryResult[];
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<UniversalDcTextOutput> {
  const { generation, queryResults, mode, topicLabel, contextHint } = args;

  // 단계별 query 분류
  const stage1 = queryResults.filter((q) => q.query.kind === "nodeVoltage" || q.query.kind === "branchCurrent");
  const stage2 = queryResults.filter((q) => q.query.kind === "totalPower" || q.query.kind === "resistorPower");
  const stage3 = queryResults.filter((q) => q.query.kind === "inverseR");

  const fmt = (v: number, unit: string, meta?: Record<string, unknown>) => {
    if (!Number.isFinite(v)) return `(NaN)${unit}`;
    const base = Number.isInteger(v) ? `${v}${unit}` : `${Number(v.toFixed(3))}${unit}`;
    // inverseR이 수렴 실패면 표시
    if (meta && meta.converged === false) {
      return `${base} (※수렴 실패: 회로 토폴로지가 목표 전압에 도달 불가)`;
    }
    return base;
  };

  // enforcedAnswer
  const ansLines: string[] = [];
  if (stage1.length > 0) {
    ansLines.push(
      `[단계 1] ${stage1.map((q) => `${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  if (stage2.length > 0) {
    ansLines.push(
      `[단계 2] ${stage2.map((q) => `${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  if (stage3.length > 0) {
    ansLines.push(
      `[단계 3] ${stage3.map((q) => `${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  const enforcedAnswer = ansLines.join("\n") || "(query 없음)";

  // enforcedSolution — 솔버 결과 + 일반적인 분석 절차 서술
  const solLines: string[] = [];
  const components = generation.netlistOpen.components.map((c) => `${c.id}${c.value ? `=${c.value}` : ""}`).join(", ");
  if (stage1.length > 0) {
    solLines.push(
      `[단계 1] KVL/KCL 또는 메시·노드 해석으로 회로를 풀어 ${stage1.map((q) => q.query.label).join("·")}을(를) 얻는다.\n` +
      `  · 솔버 결과: ${stage1.map((q) => `${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  if (stage2.length > 0) {
    solLines.push(
      `[단계 2] 단계 1의 결과를 이용해 각 저항의 전력 P_i = V_i²/R_i를 합산하여 ${stage2[0].query.label}을 구한다.\n` +
      `  · ${stage2.map((q) => `${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  if (stage3.length > 0) {
    solLines.push(
      `[단계 3] 가변 저항 R을 미지수로 두고 노드 해석을 다시 수행. 목표 노드 전압이 주어진 값이 되는 R을 도출.\n` +
      `  · ${stage3.map((q) => `${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join(", ")}`,
    );
  }
  const enforcedSolution = solLines.join("\n");

  const userPrompt = `다음 DC 회로 + 다단계 query 문제의 자연어 텍스트(content/conditions/question)만 작성하세요.
회로(소자·값·연결)와 정답(answer/solution)은 코드가 결정 — 변경 금지.

[회로 소자] ${components}
ground = ${generation.netlistOpen.ground ?? "GND"}

[단계별 정답 — 변경 금지]
${enforcedAnswer}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":   "그림은 직류 전원과 저항을 포함한 회로이다. 제시된 <해석 절차>에 따라 각 단계별 풀이 과정과 함께 결과를 서술하시오.",
  "conditions": ["회로의 소자 값은 그림에 표시", "모든 소자는 이상적으로 동작"],
  "question":  "[단계 1] ${stage1.map((q) => q.query.label).join("·")}을(를) 구한다.${stage2.length > 0 ? `\\n[단계 2] 전체 저항이 소비하는 전력 ${stage2[0]?.query.label}을 구한다.` : ""}${stage3.length > 0 ? `\\n[단계 3] 가변 저항 R을 조정하여 목표 조건을 만족하는 R 값을 구한다.` : ""}",
  "answer":    "(솔버 강제)",
  "solution":  "(솔버 강제)"
}

[규칙]
- 회로 figure 재생성 금지.
- conditions·question 자연스럽게.
- JSON 객체 하나만, 코드펜스 금지.`;

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
  let parsed: Partial<UniversalDcTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<UniversalDcTextOutput>;
  } catch (e) {
    throw new Error(`UniversalDc text JSON 파싱 실패: ${String(e)}`);
  }

  log.info("universal_dc_text_generated", {
    queryCount: queryResults.length,
    answer: enforcedAnswer.split("\n").join(" / "),
  });

  return {
    content: parsed.content ?? "DC 회로 해석 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "회로의 단계별 해석을 수행하시오.",
    answer: enforcedAnswer,
    solution: enforcedSolution,
  };
}
