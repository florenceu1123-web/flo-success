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
      ffType: gen.ffType,
      ffInputs: gen.ffInputs.map((f) => `${f.name} = ${f.expression}`),
    });

    const text = await writeFlipflopCounterText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [
      // 각 FF 입력별 K-map 1개씩 (D-FF: 2개, JK-FF: 4개)
      ...gen.ffInputs.map((ff, idx) => ({
        id: `fig_kmap_${ff.name}_${i + 1}`,
        label: `${ff.name} K-map`,
        role: "kmap" as const,
        diagramType: "kmap" as const,
        diagram: ff.kmap,
      })),
      {
        id: `fig_impl_${i + 1}`,
        label: `구현 회로 (${gen.ffType} FF 조합부)`,
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
