import { createLogger } from "@/lib/logger";
import {
  generateRlcResonance,
  buildResonanceCurveSamples,
} from "@/lib/generation/topologies/rlcResonance";
import { writeRlcResonanceText } from "@/lib/generation/topologies/rlcResonanceTextWriter";
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

const log = createLogger("lib/pipeline/runRlcResonancePipeline");

export async function runRlcResonancePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateRlcResonance({
      params: analysis?.circuitType?.params,
      seed,
    });
    log.info("rlc_resonance_generated", {
      topology: gen.topology,
      Vpeak: gen.values.VpeakLabel,
      R: gen.values.Rlabel,
      L: gen.values.Llabel,
      omegaX: gen.values.omegaX,
      Ix: gen.values.Ix,
      derivedC: gen.values.Clabel,
      derivedF0: gen.values.f0.toFixed(2),
      derivedImax: gen.values.Imax,
    });

    // 주파수응답 곡선 figure 생성 — (나) 그림.
    // 학생에게 주어지는 정보: (f_x, I_x) 표시 + f_0·I_max 위치만 dashed (수치 없음).
    const samples = buildResonanceCurveSamples({
      Vpeak: gen.values.Vpeak,
      R: gen.values.R,
      L: gen.values.L,
      C: gen.values.C,
      fMin: 0,
      fMax: Math.max(2 * gen.values.fx, 3 * gen.values.f0),
      nSamples: 160,
    });
    const waveform: WaveformDiagram = {
      signals: [{ name: "I[A]", samples, shape: "linear" }],
      xAxis: { symbol: "f", unit: "Hz" },
      markers: [
        { t: gen.values.f0, label: "f_0" },                       // 학생 도출 — 수치 없음
        { t: gen.values.fx, label: `${gen.values.omegaX}/(2π)` }, // 주어진 측정 주파수 (정수 표기)
      ],
      yMarkers: [
        { v: gen.values.Imax, label: "I_max" },                   // 학생 도출 — 수치 없음
        { v: gen.values.Ix,   label: formatCurrent(gen.values.Ix) }, // 주어진 측정 진폭
      ],
    };
    const curveFigure: FigureVariant = {
      id: `fig_curve_${i + 1}`,
      label: "주파수응답 곡선 (I[A] vs f[Hz])",
      role: "frequency_response_curve",
      diagramType: "waveform",
      diagram: waveform,
    };

    const text = await writeRlcResonanceText({
      generation: gen,
      mode,
      topicLabel,
      contextHint,
    });

    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: `주어진 회로 (RLC ${gen.topology === "series" ? "직렬" : "병렬"})`,
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
      extraFigures: [curveFigure],
    });
  });
}

function formatCurrent(x: number): string {
  if (Math.abs(x) >= 0.001) return (Math.round(x * 10000) / 10000).toString();
  return x.toExponential(2);
}
