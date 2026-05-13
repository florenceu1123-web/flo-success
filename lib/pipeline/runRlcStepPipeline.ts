import { createLogger } from "@/lib/logger";
import { generateRlcStep, type RlcStepGeneration } from "@/lib/generation/topologies/rlcStep";
import { writeRlcStepText } from "@/lib/generation/topologies/rlcStepTextWriter";
import { sampleVc } from "@/lib/solver/rlcTransient";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runRlcStepPipeline");

export async function runRlcStepPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateRlcStep({ params: analysis?.circuitType?.params, seed });
    log.info("rlc_step_generated", {
      damping: gen.answer.damping,
      alpha: gen.answer.alpha,
      omega0: gen.answer.omega0,
      zeta: gen.answer.zeta,
      values: gen.values,
    });
    const text = await writeRlcStepText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 RLC 회로", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
      extraFigures: [buildWaveformFigure(gen, i + 1)],
    });
  });
}

/**
 * V_C(t) 응답 곡선 — 80 sample 다 뽑아 linear shape로.
 * exponential_rise는 1차 RC 전용. RLC는 over/critical/under 각 식이 달라
 * sample 보간이 더 안전함.
 */
function buildWaveformFigure(gen: RlcStepGeneration, suffix: number): FigureVariant {
  const samples = sampleVc(gen.rlc, 80).map((s) => ({
    t: s.t * 1000,  // 초 → ms
    v: s.v,
  }));
  return {
    id: `fig_waveform_${suffix}`,
    label: "V_C(t) 응답",
    role: "output_waveform",
    diagramType: "waveform",
    diagram: {
      signals: [{
        name: "V_C",
        shape: "linear",
        samples,
      }],
      unit: { time: "ms", value: "V" },
    },
  };
}
