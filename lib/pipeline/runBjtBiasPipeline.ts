import { createLogger } from "@/lib/logger";
import { generateBjtBias } from "@/lib/generation/topologies/bjtBias";
import { writeBjtBiasText } from "@/lib/generation/topologies/bjtBiasTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runBjtBiasPipeline");

export async function runBjtBiasPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateBjtBias({ params: analysis?.circuitType?.params, seed });
    log.info("bjt_bias_generated", {
      values: gen.values,
      answer: gen.answer,
    });
    const text = await writeBjtBiasText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: "BJT DC bias 회로",
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
    });
  });
}
