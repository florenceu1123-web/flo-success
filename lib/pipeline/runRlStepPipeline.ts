import { createLogger } from "@/lib/logger";
import { generateRlStep, type RlStepGeneration } from "@/lib/generation/topologies/rlStep";
import { writeRlStepText } from "@/lib/generation/topologies/rlStepTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runRlStepPipeline");

export async function runRlStepPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateRlStep({ params: analysis?.circuitType?.params, seed });
    log.info("rl_step_generated", {
      tauMs: gen.answer.tauMs,
      IlAtQuery: gen.answer.IlAtQuery,
      values: gen.values,
    });
    const text = await writeRlStepText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 RL 회로", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
      extraFigures: [buildWaveformFigure(gen, i + 1)],
    });
  });
}

function buildWaveformFigure(gen: RlStepGeneration, suffix: number): FigureVariant {
  const tauMs = gen.answer.tauMs;
  const Iinf = gen.answer.Iinf;
  return {
    id: `fig_waveform_${suffix}`,
    label: "I_L(t) 응답",
    role: "output_waveform",
    diagramType: "waveform",
    diagram: {
      signals: [{
        name: "I_L",
        shape: "exponential_rise",
        tau: tauMs,
        samples: [
          { t: 0, v: 0 },
          { t: 5 * tauMs, v: Iinf },
        ],
      }],
      unit: { time: "ms", value: "A" },
    },
  };
}
