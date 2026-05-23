/**
 * Universal digital logic pipeline — N-변수 M-함수 K-map + gate combination.
 *
 *   파이프라인:
 *     1) analysis.signals.inputs.length → 변수 개수 N (2~5, 기본 4)
 *     2) analysis.signals.outputs 또는 interpretation 패턴에서 함수 개수 M 추론
 *     3) M번 generateKmapSop 호출 (다른 seed) → M개의 독립 boolean function
 *     4) 함수들을 gate(OR by default, AND/XOR도 가능)로 결합해 최종 출력
 *     5) figureVariants: M개의 K-map + 1개의 combination circuit
 *
 *   기존 자원 재활용:
 *     - generateKmapSop: 단일 K-map 함수 + diagram 일체 생성
 *     - KmapDiagram / LogicNetworkDiagram 타입 그대로
 *
 *   exam_similar/exam_variant 모드:
 *     - similar: 같은 N·M·gate type, 함수 값만 살짝 perturb (seed 변경)
 *     - variant: gate type도 바꿈 (OR↔AND 등), 함수 개수 ±1 가능
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateKmapSop, type KmapSopArchetype } from "@/lib/generation/topologies/kmapSop";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type LogicNetworkDiagram,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runUniversalDigitalPipeline");

type GateOp = "OR" | "AND" | "XOR";

export async function runUniversalDigitalPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  // 변수 개수 — signals.inputs.length를 우선, 없으면 interpretation에서 키워드 검색.
  const inputs = analysis?.signals?.inputs ?? [];
  const detectedVars = inputs.length;
  // 임용 8번처럼 ABCD 4-변수가 표준. 2~5 범위로 clamp.
  const N = Math.min(5, Math.max(2, detectedVars || 4));

  // 함수 개수 — signals.outputs 또는 interpretation에서 f_1·f_2·... 패턴 카운트.
  const M = inferFunctionCount(analysis, N);

  // 결합 gate — interpretation에서 "OR로 결합"·"합 형태" 등 키워드 검색.
  const gateOp = inferGateOp(analysis);

  log.info("universal_digital_config", { N, M, gateOp, varInputs: inputs });

  return generateInParallel(count, async (i, seed) => {
    // M번 K-map 함수 생성 — seed variation으로 독립 boolean function들.
    const archetype: KmapSopArchetype = N === 3 ? "kmap_3var" : "kmap_4var";
    const funcs = [];
    for (let fi = 0; fi < M; fi++) {
      const fnSeed = seed + fi * 7919;  // prime spacing
      const gen = generateKmapSop({ archetype, seed: fnSeed });
      funcs.push(gen);
    }

    // K-map figureVariants — 함수 1개당 1개 figure.
    const kmapFigures: FigureVariant[] = funcs.map((f, fi) => ({
      id: `fig_kmap_${i + 1}_${fi + 1}`,
      label: `f_${fi + 1} K-map (${f.func.varNames.join(",")})`,
      role: "kmap",
      diagramType: "kmap",
      diagram: f.kmapDiagram,
    }));

    // Combination circuit — 모든 함수의 SOP 출력을 gate로 묶음.
    //   각 함수가 produce하는 minimal SOP 출력 wire를 입력으로 받는 단일 gate.
    //   logic_network로 그림.
    const combination = buildCombinationDiagram(funcs, gateOp);
    const combFigure: FigureVariant = {
      id: `fig_combination_${i + 1}`,
      label: `통합 회로 (${gateOp} 결합)`,
      role: "implementation_circuit",
      diagramType: "logic_network",
      diagram: combination,
    };

    // 텍스트 — 각 함수의 최소 SOP + 결합 식.
    const sopList = funcs.map((f, fi) => `f_${fi + 1} = ${f.sopExpression}`).join("\n");
    const opSym = gateOp === "OR" ? "+" : gateOp === "AND" ? "·" : "⊕";
    const combined = funcs.map((_, fi) => `f_${fi + 1}`).join(` ${opSym} `);
    const content = [
      `${N}-변수(${inputs.length > 0 ? inputs.join(", ") : "A,B,C,D".slice(0, 2 * N - 1)}) 입력에 대한 ${M}개의 boolean 함수 + ${gateOp} 결합 문제.`,
      `각 함수는 minterm 셋으로 정의되며, ${gateOp} gate로 결합해 최종 출력을 만든다.`,
      contextHint || topicLabel || "",
    ].filter(Boolean).join(" ");
    const question = `[단계 1] 각 함수 f_1 ... f_${M}의 최소 SOP를 구한다.\n[단계 2] 결합 출력 Z = ${combined}을(를) 구한다.`;
    const answer = `[단계 1]\n${sopList}\n[단계 2] Z = ${combined}`;

    return {
      id: randomUUID(),
      content,
      conditions: [
        `입력 변수: ${N}개`,
        `함수 개수: ${M}`,
        `결합 게이트: ${gateOp}`,
      ],
      question,
      answer,
      solution: sopList,
      topicKey,
      figureVariants: [...kmapFigures, combFigure],
    };
  });

  // ── helpers ──
  void mode;  // exam_similar/variant는 향후 perturb 강도 조정에 사용
}

/** 함수 개수 추론 — signals.outputs 또는 interpretation의 f_숫자 패턴. */
function inferFunctionCount(analysis: AnalysisResult | null | undefined, n: number): number {
  if (!analysis) return 2;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
  ].join(" ");
  // f_1 ... f_K 패턴 카운트
  const fMatches = text.match(/f[_]?[1-9]/gi);
  if (fMatches) {
    const maxIdx = Math.max(...fMatches.map((s) => {
      const m = s.match(/(\d)/);
      return m ? parseInt(m[1], 10) : 0;
    }));
    if (maxIdx >= 2 && maxIdx <= 6) return maxIdx;
  }
  // signals.outputs 활용
  const outputs = analysis.signals?.outputs ?? [];
  if (outputs.length >= 2 && outputs.length <= 6) return outputs.length;
  // 기본: 변수 개수와 비슷한 함수 수
  return Math.min(4, Math.max(2, n));
}

/** 결합 gate 추론 — interpretation 키워드 기반. */
function inferGateOp(analysis: AnalysisResult | null | undefined): GateOp {
  if (!analysis) return "OR";
  const text = [analysis.topic ?? "", analysis.interpretation ?? "", (analysis.relatedConcepts ?? []).join(" ")].join(" ");
  if (/XOR|배타.?논리합|exclusive/i.test(text)) return "XOR";
  if (/AND.?(결합|조합|연결)|곱[\s]*형태|product/i.test(text)) return "AND";
  return "OR";
}

/**
 * Combination diagram — M개 함수 출력 wire를 하나의 gate로 묶는 logic_network.
 *   각 함수는 "f_i" 라벨의 input wire로 표현. (개별 함수의 내부 회로는 별도 K-map figure에서 표시.)
 */
function buildCombinationDiagram(
  funcs: ReturnType<typeof generateKmapSop>[],
  gateOp: GateOp,
): LogicNetworkDiagram {
  const M = funcs.length;
  return {
    inputs: funcs.map((_, i) => `f_${i + 1}`),
    outputs: ["Z"],
    gates: [
      {
        id: "combine",
        type: gateOp,
        inputs: funcs.map((_, i) => `f_${i + 1}`),
        output: "Z",
      },
    ],
  };
}
