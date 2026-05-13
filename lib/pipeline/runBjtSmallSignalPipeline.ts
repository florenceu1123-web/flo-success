import { createLogger } from "@/lib/logger";
import { generateBjtSmallSignal } from "@/lib/generation/topologies/bjtSmallSignal";
import { writeBjtSmallSignalText } from "@/lib/generation/topologies/bjtSmallSignalTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runBjtSmallSignalPipeline");

export async function runBjtSmallSignalPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateBjtSmallSignal({ params: analysis?.circuitType?.params, seed });
    log.info("bjt_small_signal_generated", {
      Av: gen.Av, Vc_mV: gen.Vc_mV, Vb_mV: gen.Vb_mV,
      values: gen.values,
    });
    const text = await writeBjtSmallSignalText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "BJT CE 소신호 등가 (hybrid-π)", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
