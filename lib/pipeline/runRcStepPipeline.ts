import { createLogger } from "@/lib/logger";
import { generateRcStep, generateRcStepDual, type RcStepGeneration } from "@/lib/generation/topologies/rcStep";
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

  // ★ 기출변형유형 = 쌍대(dual): RC 충전(전압원·직렬 R·C, V_C) → 병렬 RL(전류원∥R∥L, I_L).
  //   V↔I, R↔G, C↔L, 직렬↔병렬. 시정수 τ 동일. 결정론 텍스트(GPT 없음).
  if (mode === "exam_variant") {
    return generateInParallel(count, async (i, seed) => {
      const gen = generateRcStepDual({ seed });
      const v = gen.values;
      const a = gen.answer;
      log.info("rc_step_dual_generated", { tauMs: a.tauMs, IlAtQuery: a.IlAtQuery, values: v });
      const inputWave: FigureVariant = {
        id: `fig_input_waveform_${i + 1}`,
        label: "i_in(t) 입력 파형 (계단)",
        role: "input_waveform",
        diagramType: "waveform",
        diagram: {
          signals: [{ name: "i_in", shape: "step", samples: [
            { t: 0, v: 0 }, { t: 0.0001, v: v.I1_mA }, { t: a.tauMs * 5, v: v.I1_mA },
          ] }],
          unit: { time: "ms", value: "mA" },
        },
      };
      const outSamples: Array<{ t: number; v: number }> = [];
      for (let k = 0; k <= 60; k++) {
        const t = (a.tauMs * 5) * (k / 60);
        outSamples.push({ t, v: Math.round(v.I1_mA * (1 - Math.exp(-t / a.tauMs)) * 1000) / 1000 });
      }
      const outWave: FigureVariant = {
        id: `fig_waveform_${i + 1}`,
        label: "i_L(t) 인덕터 전류 응답",
        role: "output_waveform",
        diagramType: "waveform",
        diagram: {
          signals: [{ name: "i_L", shape: "exponential_rise", samples: outSamples, tau: a.tauMs }],
          unit: { time: "ms", value: "mA" },
          markers: [{ t: a.tQueryMs, label: `t=${a.tQueryMs}ms` }],
          yMarkers: [{ v: a.Iinf, label: `I_∞=${a.Iinf}mA` }],
        },
      };
      const text = {
        content: [
          `그림은 직류 전류원(I₁=${v.I1_mA}mA)과 저항 R(${v.R1d}Ω), 인덕터 L(${v.L1_H}H)이 병렬로 연결된 RL 회로이다. t=0에서 전류원이 인가된다.`,
          `이는 RC 충전 회로(전압원·직렬 R·C, V_C 측정)의 **쌍대 회로**(전류원·병렬 R·L, i_L 측정)이다.`,
          `<해석 절차>에 따라 인덕터 전류 i_L(t)를 구하시오. (단, i_L(0)=0.)`,
        ].join(" "),
        conditions: [
          `병렬 RL: 전류원 I₁=${v.I1_mA}mA ∥ R=${v.R1d}Ω ∥ L=${v.L1_H}H`,
          `쌍대 관계: 전압원↔전류원, R↔G, C↔L, 직렬↔병렬, V_C↔i_L`,
          `시정수 τ = L/R = ${a.tauMs}ms (원본 RC의 τ=RC와 동일)`,
        ],
        question: [
          `[단계 1] 시정수 τ와 정상상태 전류 i_L(∞)를 구한다.`,
          `[단계 2] t = ${v.N_multiplier}τ = ${a.tQueryMs}ms 에서 i_L 값을 구한다.`,
        ].join("\n"),
        answer: [
          `[단계 1] τ = L/R = ${a.tauMs}ms,  i_L(∞) = I₁ = ${a.Iinf}mA`,
          `[단계 2] i_L(${a.tQueryMs}ms) = ${a.IlAtQuery}mA`,
        ].join("\n"),
        solution: [
          `[단계 1] 병렬 RL에 전류원 인가 → i_L(t)=I₁(1−e^(−t/τ)), τ=L/R=${v.L1_H}/${v.R1d}=${a.tauMs}ms. 정상상태(t→∞)엔 L 단락 → i_L(∞)=I₁=${a.Iinf}mA.`,
          `[단계 2] i_L(${v.N_multiplier}τ)=I₁(1−e^(−${v.N_multiplier}))=${a.Iinf}·(1−e^(−${v.N_multiplier}))=${a.IlAtQuery}mA.`,
          `  (★ 원본 RC의 V_C(t)=V₁(1−e^(−t/τ))의 쌍대 — V↔I, C↔L, 직렬↔병렬. τ 동일.)`,
        ].join("\n"),
      };
      return assembleProblem({
        text, netlist: gen.netlist,
        figureLabel: "주어진 RL 회로 (쌍대)", figureRole: "original_circuit",
        figureIdSuffix: i + 1, topicKey,
        extraFigures: [inputWave, outWave],
      });
    });
  }

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
