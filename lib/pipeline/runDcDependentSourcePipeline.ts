import { createLogger } from "@/lib/logger";
import { generateDcDependentSource } from "@/lib/generation/topologies/dcDependentSource";
import { writeDcDependentSourceText } from "@/lib/generation/topologies/dcDependentSourceTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDcDependentSourcePipeline");

export async function runDcDependentSourcePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDcDependentSource({ params: analysis?.circuitType?.params, seed });
    log.info("dc_dependent_source_generated", {
      target: gen.target, value: gen.targetValue,
      Vnodes: gen.Vnodes, values: gen.values,
    });
    const text = await writeDcDependentSourceText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 종속전원 회로", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
