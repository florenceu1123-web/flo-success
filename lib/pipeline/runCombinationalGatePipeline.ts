import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateCombinationalGate } from "@/lib/generation/topologies/combinationalGate";
import { writeCombinationalGateText } from "@/lib/generation/topologies/combinationalGateTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runCombinationalGatePipeline");

export async function runCombinationalGatePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateCombinationalGate({ params: analysis?.circuitType?.params, seed });
    log.info("combinational_gate_generated", {
      F: gen.fExpression, G: gen.gExpression,
      fMinterms: gen.func.minterms, gMinterms: gen.gFunc.minterms,
    });

    const text = await writeCombinationalGateText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_kmap_f_${i + 1}`,
        label: "F K-map",
        role: "kmap",
        diagramType: "kmap",
        diagram: gen.fKmap,
      },
      {
        id: `fig_kmap_g_${i + 1}`,
        label: "G K-map",
        role: "kmap",
        diagramType: "kmap",
        diagram: gen.gKmap,
      },
      {
        id: `fig_impl_${i + 1}`,
        label: "통합 구현 회로 (F, G)",
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
