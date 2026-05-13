import { createLogger } from "@/lib/logger";
import { generateDcMesh } from "@/lib/generation/topologies/dcMesh";
import { writeDcMeshText } from "@/lib/generation/topologies/dcMeshTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDcMeshPipeline");

export async function runDcMeshPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDcMesh({ params: analysis?.circuitType?.params, seed });
    log.info("dc_mesh_generated", { target: gen.targetBranch, I: gen.targetCurrent, values: gen.values });
    const text = await writeDcMeshText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
