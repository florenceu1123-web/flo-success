import { createLogger } from "@/lib/logger";
import {
  generateRlcResonance,
  buildResonanceCurveSamples,
  generateRlcResonanceDual,
  buildDualResonanceCurveSamples,
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

  // ★ 기출변형유형 = 쌍대(dual) 회로: 직렬 RLC(전압원·전류측정) → 병렬 GLC(전류원·전압측정).
  //   V↔I, R↔G, L↔C, 직렬↔병렬. 공진주파수 f_0 동일. 결정론 텍스트(GPT 없음).
  if (mode === "exam_variant") {
    return generateInParallel(count, async (i, seed) => {
      const gen = generateRlcResonanceDual({ seed });
      const v = gen.values;
      log.info("rlc_resonance_dual_generated", {
        Ipeak: v.IpeakLabel, Rd: v.RdLabel, Cd: v.CdLabel, Ld: v.LdLabel,
        omegaX: v.omegaX, Vx: v.Vx, f0: v.f0.toFixed(2), Vmax: v.Vmax,
      });
      const samples = buildDualResonanceCurveSamples({
        Ipeak: v.Ipeak, Rd: v.Rd, Cd: v.Cd, Ld: v.Ld,
        fMin: 0, fMax: Math.max(2 * v.fx, 3 * v.f0), nSamples: 160,
      });
      const waveform: WaveformDiagram = {
        signals: [{ name: "V[V]", samples, shape: "linear" }],
        xAxis: { symbol: "f", unit: "Hz" },
        markers: [
          { t: v.f0, label: "f_0" },
          { t: v.fx, label: `${v.omegaX}/(2π)` },
        ],
        yMarkers: [
          { v: v.Vmax, label: "V_max" },
          { v: v.Vx, label: formatCurrent(v.Vx) },
        ],
      };
      const curveFigure: FigureVariant = {
        id: `fig_curve_${i + 1}`,
        label: "주파수응답 곡선 (V[V] vs f[Hz])",
        role: "frequency_response_curve",
        diagramType: "waveform",
        diagram: waveform,
      };
      const round2 = (x: number) => Math.round(x * 100) / 100;
      const G = 1 / v.Rd;
      const text = {
        content: [
          `그림 (가)는 i(t) = ${v.IpeakLabel.replace(" mA", "")} cos(ωt) [mA]인 교류 전류원과 R∥C∥L 병렬 회로이다.`,
          `이는 직렬 RLC 공진 회로(전압원·전류 측정)의 **쌍대 회로**(전류원·전압 측정)이다.`,
          `그림 (나)는 주파수에 따른 단자 전압 크기 |V|를 나타낸다. <해석 절차>에 따라 각 단계 결과를 구하시오.`,
          `(단, R=${v.RdLabel}, C=${v.CdLabel}이고 L은 미지수이며, L > ${v.lLowerBoundLabel}이다.)`,
        ].join(" "),
        conditions: [
          `병렬 GLC 공진: 전류원 i(t) ∥ R(${v.RdLabel}) ∥ C(${v.CdLabel}) ∥ L(미지)`,
          `그래프 (나): 비공진 주파수 f_x=${v.omegaX}/(2π)Hz에서 |V|=${round2(v.Vx)}V (주어짐). V_max·f_0는 위치만 표시(학생 도출)`,
          `쌍대 관계: V↔I, R↔G, L↔C, 직렬↔병렬 — 공진주파수 f_0는 원본과 동일`,
        ],
        question: [
          `[단계 1] 그래프의 (f_x, V_x) 점을 이용하여 인덕턴스 L과 단자 전압 v(t)를 구한다.`,
          `[단계 2] 도출한 L로 공진주파수 f_0[Hz]와 최대 전압 V_max[V]를 구한다.`,
        ].join("\n"),
        answer: [
          `[단계 1] L = ${v.LdLabel},  v(t) = ${round2(v.Vx)}·√2 cos(${v.omegaX}t ± θ) [V] (|V|_peak=${round2(v.Vx)}V)`,
          `[단계 2] f_0 = ${round2(v.f0)} Hz,  V_max = ${round2(v.Vmax)} V`,
        ].join("\n"),
        solution: [
          `[단계 1] 병렬 회로 어드미턴스 Y(jω)=G+j(ωC−1/(ωL)), G=1/R=${round2(G * 1000)}mS.`,
          `  −3dB 점 |Y(jω_x)|=√2·G → ω_xC − 1/(ω_xL) = ±G. ω_x=${v.omegaX}rad/s, C=${v.CdLabel} 대입 →`,
          `  L = 1/(ω_x(ω_xC ∓ G)) = ${v.LdLabel} (단서 L>${v.lLowerBoundLabel}로 case 선택). v(t) peak = I_peak/|Y| = ${round2(v.Vx)}V.`,
          `[단계 2] 공진(B=0): ω_0=1/√(LC) → f_0 = 1/(2π√(LC)) = ${round2(v.f0)}Hz.`,
          `  공진 시 Y=G(최소) → V_max = I_peak·R = ${round2(v.Vmax)}V. (★ 원본 직렬회로의 I_max=V_peak/R 의 쌍대)`,
        ].join("\n"),
      };
      return assembleProblem({
        text,
        netlist: gen.netlist,
        figureLabel: "주어진 회로 (병렬 GLC, 쌍대)",
        figureRole: "original_circuit",
        figureIdSuffix: i + 1,
        topicKey,
        extraFigures: [curveFigure],
      });
    });
  }

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
