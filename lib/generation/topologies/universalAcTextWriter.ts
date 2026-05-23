import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { GenerationMode } from "@/types";
import type { AcQueryResult } from "@/lib/solver/universalAc";
import type { TopologyDrivenGeneration } from "../topologyDriven/buildFromTopology";

const log = createLogger("lib/generation/topologies/universalAcTextWriter");

export type UniversalAcTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * AC phasor 회로 + 단계별 query에 대한 문제 텍스트 작성.
 *   결정론 layer: 회로(소자/값) + 솔버 query 결과(answer/solution 강제)
 *   GPT layer: content/conditions/question 자연어
 */
export async function writeUniversalAcText(args: {
  generation: TopologyDrivenGeneration;
  queryResults: AcQueryResult[];
  omega: number;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<UniversalAcTextOutput> {
  const { generation, queryResults, omega, mode, topicLabel, contextHint } = args;

  const fmt = (v: number, unit: string, meta?: Record<string, unknown>) => {
    if (!Number.isFinite(v)) return `(NaN)${unit}`;
    let base: string;
    if (unit === "F") {
      // F → μF or nF 자동
      if (v >= 1e-6) base = `${Number((v * 1e6).toFixed(3))}μF`;
      else if (v >= 1e-9) base = `${Number((v * 1e9).toFixed(3))}nF`;
      else base = `${Number((v * 1e12).toFixed(3))}pF`;
    } else {
      base = Number.isInteger(v) ? `${v}${unit}` : `${Number(v.toFixed(3))}${unit}`;
    }
    if (meta && meta.converged === false) return `${base} (※수렴 실패)`;
    return base;
  };

  const ansLines = queryResults.map((q) => `- ${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`);
  const enforcedAnswer = ansLines.length > 0
    ? `[정답]\n${ansLines.join("\n")}`
    : "(query 없음)";

  const components = generation.netlistOpen.components.map((c) => `${c.id}${c.value ? `=${c.value}` : ""}`).join(", ");

  const enforcedSolution =
    `AC 정상상태 phasor 해석 — 입력 ω = ${omega} rad/s.\n` +
    `복소 임피던스 (R, jωL, 1/(jωC)) 기반 노드/메시 해석으로 phasor V·I를 도출.\n` +
    queryResults.map((q) => `- ${q.query.label} = ${fmt(q.value, q.unit, q.meta)}`).join("\n");

  const userPrompt = `다음 AC 회로(L/C 포함, ω = ${omega} rad/s) + 다단계 query 문제의 자연어 텍스트(content/conditions/question)만 작성하세요.
회로(소자·값·연결)와 정답은 코드가 결정 — 변경 금지.

[회로 소자] ${components}
ground = ${generation.netlistOpen.ground ?? "GND"}

[솔버 결과 — 변경 금지]
${enforcedAnswer}

[모드] ${mode === "exam_similar" ? "기출유사유형" : "기출변형유형"}
${topicLabel ? `[주제] ${topicLabel}` : ""}
${contextHint ? `[원본 맥락]\n${contextHint}` : ""}

[출력 JSON]
{
  "content":   "그림은 AC 정현파 입력이 인가된 RLC 회로이다. 제시된 해석 절차에 따라 phasor V·I 또는 공진·최대전력 조건을 도출하시오.",
  "conditions": ["입력 v(t) = V·sin(ωt + φ), ω = ${omega} rad/s", "정상상태 phasor 해석", "소자 R·L·C는 이상 동작"],
  "question":  "각 query 결과를 구하시오.",
  "answer":    "(솔버 강제)",
  "solution":  "(솔버 강제)"
}

[규칙]
- 회로 figure 재생성 금지.
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
  let parsed: Partial<UniversalAcTextOutput>;
  try {
    parsed = JSON.parse(raw) as Partial<UniversalAcTextOutput>;
  } catch (e) {
    throw new Error(`UniversalAc text JSON 파싱 실패: ${String(e)}`);
  }

  log.info("universal_ac_text_generated", {
    omega,
    queryCount: queryResults.length,
    answer: ansLines.join(" / "),
  });

  return {
    content: parsed.content ?? "AC phasor 회로 해석 문제",
    conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
    question: parsed.question ?? "회로의 phasor V·I 또는 공진·최대전력을 구하시오.",
    answer: enforcedAnswer,
    solution: enforcedSolution,
  };
}
