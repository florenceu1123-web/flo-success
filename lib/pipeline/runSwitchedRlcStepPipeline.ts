import { createLogger } from "@/lib/logger";
import { generateSwitchedRlcStep, buildVcTimeSamples } from "@/lib/generation/topologies/switchedRlcStep";
import { writeSwitchedRlcStepText } from "@/lib/generation/topologies/switchedRlcStepTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
  type WaveformDiagram,
} from "@/types";

const log = createLogger("lib/pipeline/runSwitchedRlcStepPipeline");

export async function runSwitchedRlcStepPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateSwitchedRlcStep({ params: analysis?.circuitType?.params, seed });
    log.info("switched_rlc_step_generated", { values: gen.values });

    // v_C(t) waveform figure (시간응답 곡선)
    const tMax = Math.max(8 / gen.values.omega0, 10);
    const samples = buildVcTimeSamples({ values: gen.values, tMax, nSamples: 160 });
    const waveform: WaveformDiagram = {
      signals: [{ name: "v_C[V]", samples, shape: "linear" }],
      xAxis: { symbol: "t", unit: "sec" },
      markers: [{ t: 0, label: "t=0 (SW: A→B)" }],
      yMarkers: [
        { v: gen.values.v_C_0minus, label: `v_C(0⁻) = ${gen.values.v_C_0minus}V` },
        { v: gen.values.v_C_infty,  label: `v_C(∞) = ${gen.values.v_C_infty}V` },
      ],
    };
    const curveFigure: FigureVariant = {
      id: `fig_vc_${i + 1}`,
      label: "커패시터 전압 v_C(t) 시간응답",
      role: "output_waveform",
      diagramType: "waveform",
      diagram: waveform,
    };

    const text = await writeSwitchedRlcStepText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: "스위치 t=0 전환 RLC 회로 (좌측 V_s + 우측 I_s + 가운데 RLC)",
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
      extraFigures: [curveFigure],
    });
  });
}
