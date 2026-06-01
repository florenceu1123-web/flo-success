import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateKmapSop } from "@/lib/generation/topologies/kmapSop";
import { writeKmapSopText } from "@/lib/generation/topologies/kmapSopTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runKmapSopPipeline");

/**
 * K-map SOP 파이프라인 — 3개 figure (kmap + truth_table + implementation_circuit).
 */
export async function runKmapSopPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);
  const truthTableBlank = Boolean(analysis?.circuitType?.params?.truthTableBlank);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateKmapSop({ params: analysis?.circuitType?.params, seed });
    log.info("kmap_sop_generated", {
      vars: gen.func.vars,
      minterms: gen.func.minterms,
      dontCares: gen.func.dontCares,
      sop: gen.sopExpression,
      termCount: gen.values.sopTerms,
      truthTableBlank,
    });

    const text = await writeKmapSopText({ generation: gen, mode, topicLabel, contextHint });

    // truthTableBlank 모드 (임용 5번): (가) 진리표 + (나) 간략화된 조합논리회로 2 figure.
    // K-map은 풀이 [단계 1] 산출물이라 figure로 노출하지 않는다.
    const figureVariants: FigureVariant[] = truthTableBlank
      ? [
          {
            id: `fig_truth_${i + 1}`,
            label: "(가) 진리표",
            role: "truth_table",
            diagramType: "truth_table",
            diagram: gen.truthTableDiagram,
          },
          {
            id: `fig_impl_${i + 1}`,
            label: "(나) 간략화된 조합논리회로",
            role: "implementation_circuit",
            diagramType: "logic_network",
            diagram: gen.logicNetworkDiagram,
          },
        ]
      : [
          {
            id: `fig_kmap_${i + 1}`,
            label: `${gen.func.vars}변수 K-map`,
            role: "kmap",
            diagramType: "kmap",
            diagram: gen.kmapDiagram,
          },
          {
            id: `fig_truth_${i + 1}`,
            label: "진리표",
            role: "truth_table",
            diagramType: "truth_table",
            diagram: gen.truthTableDiagram,
          },
          {
            id: `fig_impl_${i + 1}`,
            label: "구현 회로",
            role: "implementation_circuit",
            diagramType: "logic_network",
            diagram: gen.logicNetworkDiagram,
          },
        ];

    return {
      id: randomUUID(),
      content: text.content,
      conditions: text.conditions,
      question: text.question,
      answer: text.answer,
      solution: text.solution,
      topicKey,
      figureVariants,
    };
  });
}
