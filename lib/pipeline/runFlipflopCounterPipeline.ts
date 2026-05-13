import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateFlipflopCounter } from "@/lib/generation/topologies/flipflopCounter";
import { writeFlipflopCounterText } from "@/lib/generation/topologies/flipflopCounterTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runFlipflopCounterPipeline");

export async function runFlipflopCounterPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateFlipflopCounter({ params: analysis?.circuitType?.params, seed });
    log.info("flipflop_counter_generated", {
      seq: gen.sequenceText,
      D1: gen.d1Expression,
      D0: gen.d0Expression,
    });

    const text = await writeFlipflopCounterText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_kmap_d1_${i + 1}`,
        label: "D1 K-map",
        role: "kmap",
        diagramType: "kmap",
        diagram: gen.d1Kmap,
      },
      {
        id: `fig_kmap_d0_${i + 1}`,
        label: "D0 K-map",
        role: "kmap",
        diagramType: "kmap",
        diagram: gen.d0Kmap,
      },
      {
        id: `fig_impl_${i + 1}`,
        label: "구현 회로 (조합부)",
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
