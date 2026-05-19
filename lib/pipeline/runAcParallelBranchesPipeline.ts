import { createLogger } from "@/lib/logger";
import { generateAcParallelBranches } from "@/lib/generation/topologies/acParallelBranches";
import { writeAcParallelBranchesText } from "@/lib/generation/topologies/acParallelBranchesTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcParallelBranchesPipeline");

export async function runAcParallelBranchesPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcParallelBranches({ params: analysis?.circuitType?.params, seed });
    log.info("ac_parallel_branches_generated", { values: gen.values });

    const text = await writeAcParallelBranchesText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: "교류 다중 가지 회로 (임용 5번, V_s + R + L₁ + I_S + L₂ + R + C 병렬)",
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
    });
  });
}
