/**
 * 범용 OPAMP 파이프라인 — 예시 하드코딩 없이 업로드 회로 구조를 재생성.
 *
 *  흐름: extractOpampNetlist(GPT 구조 추출) → MNA 결정론 풀이(추출 단계 내)
 *        → 텍스트(MNA 해 강제) → renderOpAmpCircuit(generic 렌더).
 *  미지 저항 역산형: 완성 회로를 MNA로 풀고, 미지 저항만 값 숨겨 "R"로 렌더 +
 *  그 출력전압을 제시 → 정답 R은 MNA로 검증된 실제 값.
 */

import { getOpenAI, DEFAULT_MODEL, withRateLimitRetry } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { extractOpampNetlist, type OpampNetlistExtraction } from "@/lib/generation/opampNetlist/extractOpampNetlist";
import { runOpampPipeline } from "./runOpampPipeline";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult, type CircuitNetlist, type GeneratedProblem,
  type GenerationMode, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampGenericPipeline");

/** 미지 소자의 값을 숨긴 렌더용 netlist 복제 (값 → "R" 표기). */
function blankUnknown(netlist: CircuitNetlist, unknownId?: string): CircuitNetlist {
  if (!unknownId) return netlist;
  return {
    ...netlist,
    components: netlist.components.map((c) =>
      c.id === unknownId ? { ...c, value: "R" } : c,
    ),
  };
}

type GenericText = {
  content: string; conditions: string[]; question: string; answer: string; solution: string;
};

const TEXT_SYSTEM = `너는 전자 임용시험 OPAMP 회로 문제의 본문·문항·풀이를 쓰는 엔진이다.
회로와 그 정확한 단계별 사실(각 OPAMP의 +/−/출력 전압)이 주어진다.
이상적 OPAMP(가상단락 V+=V−, 입력전류 0) 가정.

[절대 규칙]
- 주어진 [단계 사실]의 수치를 절대 바꾸지 말고 그대로 사용한다 (그림·풀이 일관성).
- conditions·answer는 코드가 따로 확정하니, 너는 content·question·solution만 잘 쓴다.
- solution은 [단계 사실]과 모순되면 안 된다. 각 OPAMP 출력은 가상단락+KCL(반전입력 KCL)로 유도하되
  결과 수치는 [단계 사실]과 일치해야 한다. 반전 가산기는 모든 입력의 가중합을 빠뜨리지 마라.
- 노드 전압 목록을 conditions/문제에 나열하지 마라 (학생이 풀 값이다). 주어지는 건 출력 전압 하나뿐.

출력 JSON (코드펜스 금지): {content, question, solution}
- content: 회로 설명 + "출력 …가 주어질 때 <해석 절차>에 따라 단계별로 구하시오"
- question: 단계별 <해석 절차> 문자열 (\\n 구분; 예 [단계 1] 1단 출력, [단계 2] 중첩 표현, [단계 3] 미지 R)
- solution: 단계별 풀이 (각 OPAMP 가상단락·KCL, 결과는 [단계 사실]과 일치)`;

async function writeOpampGenericText(args: {
  extraction: OpampNetlistExtraction;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<GenericText> {
  const { extraction: ex } = args;
  const openai = getOpenAI();
  const V = (n: string) => Math.round((ex.mna.nodeVoltages[n] ?? 0) * 1000) / 1000;

  // 비-OPAMP 소자 값 (미지수는 "R"로). conditions는 코드가 결정론 구성.
  const compList = ex.netlist.components
    .filter((c) => c.type !== "OPAMP")
    .map((c) => `  - ${c.id} (${c.type})${c.id === ex.unknownId ? " [미지 R]" : c.value !== undefined ? ` = ${c.value}` : ""}`)
    .join("\n");
  const opamps = ex.netlist.components.filter((c) => c.type === "OPAMP");
  // 각 OPAMP의 +/−/출력 전압 — GPT 풀이의 ground truth.
  const opampFacts = opamps.map((c) => {
    const [vp, vn, vo] = c.pins.map((p) => p.node);
    return `  - ${c.id}: V+(${vp})=${V(vp)}V, V−(${vn})=${V(vn)}V, 출력 ${vo}=${V(vo)}V`;
  }).join("\n");

  // 결정론 정답.
  const enforcedAnswer = ex.unknownId && ex.unknownValue !== undefined
    ? `${ex.unknownId} = ${ex.unknownValue}${ex.unknownUnit || ""}` +
      (ex.outputNode ? ` (출력 ${ex.outputNode} = ${ex.outputVoltage}V 조건)` : "")
    : ex.outputNode
      ? `${ex.outputNode} = ${ex.outputVoltage}V`
      : `노드 전압 ${opamps.map((c) => { const vo = c.pins[2].node; return `${vo}=${V(vo)}V`; }).join(", ")}`;

  // 결정론 conditions — 소자값 + 가정 + 주어지는 출력전압. (노드 전압 누설 금지)
  const conditions: string[] = [
    "이상적 OPAMP (가상단락 V+=V−, 입력전류 0).",
    ...ex.netlist.components
      .filter((c) => c.type === "R" && c.id !== ex.unknownId && c.value !== undefined)
      .map((c) => `${c.id} = ${c.value}`),
    ...ex.netlist.components
      .filter((c) => c.type === "V" && c.value !== undefined)
      .map((c) => `${c.id} = ${c.value}`),
  ];
  if (ex.unknownId && ex.outputNode) {
    conditions.push(`${ex.unknownId}는 미지 저항 R (학생이 구함).`);
    conditions.push(`출력 ${ex.outputNode} = ${ex.outputVoltage}V (주어짐).`);
  }

  const userPrompt = [
    `[OPAMP] ${opamps.map((c) => c.id).join(", ")}`,
    `[소자]\n${compList}`,
    `[단계 사실 — 절대 변경 금지]\n${opampFacts}`,
    ex.unknownId ? `[문제 유형] 출력 ${ex.outputNode}=${ex.outputVoltage}V가 주어질 때 미지 저항 ${ex.unknownId}을 역산.` : `[문제 유형] 출력 전압 도출.`,
    `[확정 정답] ${enforcedAnswer}`,
    ``,
    `위 회로의 임용 스타일 문제(content/question/solution)를 작성하라.`,
  ].filter(Boolean).join("\n");

  let parsed: Partial<GenericText> = {};
  try {
    const completion = await withRateLimitRetry(() =>
      openai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: TEXT_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1600,
      }),
    );
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Partial<GenericText>;
  } catch (e) {
    log.warn("text_failed", { reason: String(e) });
  }

  return {
    content: parsed.content ?? "그림은 연산증폭기 응용 회로이다. <해석 절차>에 따라 단계별로 풀이하시오.",
    conditions,                              // 결정론
    question: parsed.question ?? "주어진 조건에서 미지 값을 구하시오.",
    answer: enforcedAnswer,                  // 결정론
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

export async function runOpampGenericPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    try {
      const ex = await extractOpampNetlist({ analysis, mode, seed });
      log.info("generic_opamp_generated", {
        components: ex.netlist.components.length,
        unknownId: ex.unknownId, unknownValue: ex.unknownValue, outputVoltage: ex.outputVoltage,
      });
      const text = await writeOpampGenericText({ extraction: ex, mode, topicLabel, contextHint });
      const renderNetlist = blankUnknown(ex.netlist, ex.unknownId);
      return assembleProblem({
        text,
        netlist: renderNetlist,
        figureLabel: "(가) OPAMP 응용 회로",
        figureRole: "original_circuit",
        figureIdSuffix: i + 1,
        topicKey,
      });
    } catch (e) {
      // ★ GPT 구조추출이 모든 시도에서 실패해도 500(생성실패) 내지 말고,
      //   기존 netlist 기반 OPAMP 파이프라인(결정론 빌더)으로 fallback — 항상 결과 반환.
      log.warn("generic_extract_failed_fallback", { reason: String(e), index: i });
      const fb = await runOpampPipeline({ analysis: analysis ?? null, mode, count: 1, topicKey });
      return fb[0];
    }
  });
}
