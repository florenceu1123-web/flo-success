import { createLogger } from "@/lib/logger";
import { generateOpamp } from "@/lib/generation/topologies/opamp";
import { writeOpampText } from "@/lib/generation/topologies/opampTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampPipeline");

export async function runOpampPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpamp({ params: analysis?.circuitType?.params, seed });
    log.info("opamp_generated", {
      archetype: gen.archetype,
      Vout: gen.Vout, Vminus: gen.Vminus, Vplus: gen.Vplus,
      values: gen.values,
    });
    const text = await writeOpampText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: `OPAMP 회로 (${gen.archetype})`, figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
