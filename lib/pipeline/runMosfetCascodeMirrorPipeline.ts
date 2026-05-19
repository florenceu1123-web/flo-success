import { createLogger } from "@/lib/logger";
import { generateMosfetCascodeMirror } from "@/lib/generation/topologies/mosfetCascodeMirror";
import { writeMosfetCascodeMirrorText } from "@/lib/generation/topologies/mosfetCascodeMirrorTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runMosfetCascodeMirrorPipeline");

export async function runMosfetCascodeMirrorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateMosfetCascodeMirror({ params: analysis?.circuitType?.params, seed });
    log.info("mosfet_cascode_mirror_generated", { values: gen.values });
    const text = await writeMosfetCascodeMirrorText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: "NMOS cascode current mirror 회로 (포화 영역, 3-leg)",
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
    });
  });
}
