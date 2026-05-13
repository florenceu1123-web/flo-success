import { createLogger } from "@/lib/logger";
import { generateMaxPowerTransfer } from "@/lib/generation/topologies/maxPowerTransfer";
import { writeMaxPowerTransferText } from "@/lib/generation/topologies/maxPowerTransferTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runMaxPowerTransferPipeline");

export async function runMaxPowerTransferPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateMaxPowerTransfer({ params: analysis?.circuitType?.params, seed });
    log.info("max_power_generated", {
      archetype: gen.archetype,
      Vth: gen.answer.Vth, Rth: gen.answer.Rth,
      RLopt: gen.RLopt, Pmax: gen.Pmax,
      values: gen.values,
    });
    const text = await writeMaxPowerTransferText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로 (단자 a-b 부하)", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
