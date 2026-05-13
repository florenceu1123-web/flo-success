import { createLogger } from "@/lib/logger";
import { generateNorton, type NortonArchetype } from "@/lib/generation/topologies/norton";
import { writeNortonText } from "@/lib/generation/topologies/nortonTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runNortonPipeline");

export async function runNortonPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const archetype: NortonArchetype | undefined = mode === "exam_similar"
    ? "current_source_with_parallel_R"
    : undefined;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateNorton({ archetype, params: analysis?.circuitType?.params, seed });
    log.info("norton_generated", { archetype: gen.archetype, In: gen.answer.In, Rn: gen.answer.Rn, values: gen.values });
    const text = await writeNortonText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
