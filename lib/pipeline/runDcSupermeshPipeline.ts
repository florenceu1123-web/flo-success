import { createLogger } from "@/lib/logger";
import { generateDcSupermesh } from "@/lib/generation/topologies/dcSupermesh";
import { writeDcSupermeshText } from "@/lib/generation/topologies/dcSupermeshTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDcSupermeshPipeline");

export async function runDcSupermeshPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDcSupermesh({ params: analysis?.circuitType?.params, seed });
    log.info("dc_supermesh_generated", {
      target: gen.targetBranch,
      I: gen.targetCurrent,
      iMesh1: gen.iMesh1,
      iMesh2: gen.iMesh2,
      values: gen.values,
    });
    const text = await writeDcSupermeshText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로 (supermesh)", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
