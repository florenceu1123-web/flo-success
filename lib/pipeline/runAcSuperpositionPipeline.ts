import { createLogger } from "@/lib/logger";
import { generateAcSuperposition } from "@/lib/generation/topologies/acSuperposition";
import { writeAcSuperpositionText } from "@/lib/generation/topologies/acSuperpositionTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcSuperpositionPipeline");

export async function runAcSuperpositionPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcSuperposition({ params: analysis?.circuitType?.params, seed });
    log.info("ac_superposition_generated", {
      Vs: gen.values.Vs.label,
      Is: gen.values.Is.label,
      L1: gen.values.L1.label,
      C1: gen.values.C1.label,
      R: [gen.values.R1, gen.values.R2, gen.values.R3],
    });
    const text = await writeAcSuperpositionText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: "주어진 회로 (AC 다중 전원)",
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
    });
  });
}
