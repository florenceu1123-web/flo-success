import { createLogger } from "@/lib/logger";
import { generateDcSupernode } from "@/lib/generation/topologies/dcSupernode";
import { writeDcSupernodeText } from "@/lib/generation/topologies/dcSupernodeTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDcSupernodePipeline");

export async function runDcSupernodePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDcSupernode({ params: analysis?.circuitType?.params, seed });
    log.info("dc_supernode_generated", {
      target: gen.target, value: gen.targetValue,
      Vn1: gen.Vn1, Vn2: gen.Vn2, Ivs: gen.IvsBranch,
      values: gen.values,
    });
    const text = await writeDcSupernodeText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로 (supernode)", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
