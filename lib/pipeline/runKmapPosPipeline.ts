import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateKmapPos } from "@/lib/generation/topologies/kmapPos";
import { writeKmapPosText } from "@/lib/generation/topologies/kmapPosTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runKmapPosPipeline");

export async function runKmapPosPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateKmapPos({ params: analysis?.circuitType?.params, seed });
    log.info("kmap_pos_generated", {
      vars: gen.func.vars,
      minterms: gen.func.minterms,
      pos: gen.posExpression,
      termCount: gen.values.posTerms,
    });

    const text = await writeKmapPosText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_kmap_${i + 1}`,
        label: `${gen.func.vars}변수 K-map (POS)`,
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
        label: "구현 회로 (OR-AND)",
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
