import { createLogger } from "@/lib/logger";
import { generateRcStep, type RcStepGeneration } from "@/lib/generation/topologies/rcStep";
import { writeRcStepText } from "@/lib/generation/topologies/rcStepTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runRcStepPipeline");

export async function runRcStepPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateRcStep({ params: analysis?.circuitType?.params, seed });
    log.info("rc_step_generated", {
      tauMs: gen.answer.tauMs,
      VcAtQuery: gen.answer.VcAtQuery,
      values: gen.values,
    });
    const text = await writeRcStepText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 RC 회로", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
      extraFigures: [buildInputWaveformFigure(gen, i + 1), buildWaveformFigure(gen, i + 1)],
    });
  });
}

/**
 * V_in(t) 입력 step waveform — t=0 직전 0V, t≥0에서 V1으로 step.
 * 원본 RC 응답 문제의 (나) 입력 파형 — 누락 시 학생이 입력 모양을 알 수 없음.
 */
function buildInputWaveformFigure(gen: RcStepGeneration, suffix: number): FigureVariant {
  const tauMs = gen.answer.tauMs;
  const V1 = gen.values.V1;
  return {
    id: `fig_input_waveform_${suffix}`,
    label: "V_in(t) 입력 파형",
    role: "input_waveform",
    diagramType: "waveform",
    diagram: {
      signals: [{
        name: "V_in",
        shape: "step",
        samples: [
          { t: 0, v: 0 },
          { t: 0.001, v: V1 },
          { t: 5 * tauMs, v: V1 },
        ],
      }],
      unit: { time: "ms", value: "V" },
    },
  };
}

/**
 * V_C(t) 곡선을 exponential_rise shape로 waveform figure 생성.
 * renderer가 tau 기반 보간하므로 (0, V_C(0))과 (5τ, V_∞) 두 sample만 제공.
 */
function buildWaveformFigure(gen: RcStepGeneration, suffix: number): FigureVariant {
  const tauMs = gen.answer.tauMs;
  const Vinf = gen.answer.Vinf;
  return {
    id: `fig_waveform_${suffix}`,
    label: "V_C(t) 응답",
    role: "output_waveform",
    diagramType: "waveform",
    diagram: {
      signals: [{
        name: "V_C",
        shape: "exponential_rise",
        tau: tauMs,
        samples: [
          { t: 0, v: 0 },
          { t: 5 * tauMs, v: Vinf },
        ],
      }],
      unit: { time: "ms", value: "V" },
    },
  };
}
