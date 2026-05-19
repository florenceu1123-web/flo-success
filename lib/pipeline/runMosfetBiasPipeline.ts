import { createLogger } from "@/lib/logger";
import { generateMosfetBias } from "@/lib/generation/topologies/mosfetBias";
import { writeMosfetBiasText } from "@/lib/generation/topologies/mosfetBiasTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runMosfetBiasPipeline");

export async function runMosfetBiasPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateMosfetBias({ params: analysis?.circuitType?.params, seed });
    log.info("mosfet_bias_generated", {
      values: gen.values,
    });
    const text = await writeMosfetBiasText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: "NMOS DC bias 회로 (포화 영역)",
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
    });
  });
}
