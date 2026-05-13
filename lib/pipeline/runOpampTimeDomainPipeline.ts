import { createLogger } from "@/lib/logger";
import { generateOpampTimeDomain } from "@/lib/generation/topologies/opampTimeDomain";
import { writeOpampTimeDomainText } from "@/lib/generation/topologies/opampTimeDomainTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampTimeDomainPipeline");

export async function runOpampTimeDomainPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampTimeDomain({ params: analysis?.circuitType?.params, seed });
    log.info("opamp_time_domain_generated", {
      archetype: gen.archetype,
      Vout: gen.answer.Vout, tauMs: gen.answer.tauMs,
      values: gen.values,
    });
    const text = await writeOpampTimeDomainText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: `OPAMP 회로 (${gen.archetype})`, figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
      extraFigures: [{
        id: `fig_waveform_${i + 1}`,
        label: "입력·출력 파형",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveformDiagram,
      }],
    });
  });
}
