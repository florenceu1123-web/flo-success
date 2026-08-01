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
      const r3 = (x: number): number => Math.round(x * 1000) / 1000;

      // ★ 입력 = 원본(그림 나)처럼 사각 펄스: 0~T는 I₁, T~2T는 0 (주기 2T).
      //   펄스 폭 T = 2τ (주기 2T = 4τ) — 기존 5τ 계단 창보다 짧고, 충전→방전이 한 주기에 다 보임.
      const PULSE_K = 2;                    // T = PULSE_K·τ
      const tau = a.tauMs;
      const T = r3(PULSE_K * tau);          // 펄스 폭(상승 구간)
      const period2T = r3(2 * T);           // 주기
      const Ipeak = r3(v.I1_mA * (1 - Math.exp(-PULSE_K)));   // i_L(T) — 펄스 끝 최댓값
      const IlEnd = r3(Ipeak * Math.exp(-PULSE_K));           // i_L(2T) — 방전 구간 끝
      log.info("rc_step_dual_generated", { tauMs: tau, T, period2T, Ipeak, IlEnd, values: v });

      const inputWave: FigureVariant = {
        id: `fig_input_waveform_${i + 1}`,
        label: "i_in(t) 입력 파형 (사각 펄스)",
        role: "input_waveform",
        diagramType: "waveform",
        diagram: {
          signals: [{ name: "i_in", shape: "step", samples: [
            { t: 0, v: 0 }, { t: 0.0001, v: v.I1_mA }, { t: T, v: 0 }, { t: period2T, v: 0 },
          ] }],
          unit: { time: "ms", value: "mA" },
          markers: [{ t: T, label: `T=${T}ms` }, { t: period2T, label: `2T=${period2T}ms` }],
        },
      };
      // 출력 i_L(t): [0,T] 충전 I₁(1−e^(−t/τ)) → [T,2T] 방전 i_L(T)·e^(−(t−T)/τ). dense linear 샘플.
      const outSamples: Array<{ t: number; v: number }> = [];
      const STEPS = 120;
      for (let k = 0; k <= STEPS; k++) {
        const t = period2T * (k / STEPS);
        const iL = t <= T
          ? v.I1_mA * (1 - Math.exp(-t / tau))
          : Ipeak * Math.exp(-(t - T) / tau);
        outSamples.push({ t: r3(t), v: r3(iL) });
      }
      const outWave: FigureVariant = {
        id: `fig_waveform_${i + 1}`,
        label: "i_L(t) 인덕터 전류 응답 (충전→방전)",
        role: "output_waveform",
        diagramType: "waveform",
        diagram: {
          signals: [{ name: "i_L", shape: "linear", samples: outSamples }],
          unit: { time: "ms", value: "mA" },
          markers: [{ t: T, label: `t=T` }, { t: period2T, label: `t=2T` }],
          yMarkers: [{ v: Ipeak, label: `i_L(T)=${Ipeak}mA` }],
        },
      };
      const text = {
        content: [
          `그림은 직류 전류원 i_in(t)과 저항 R(${v.R1d}Ω), 인덕터 L(${v.L1_H}H)이 병렬로 연결된 RL 회로이다.`,
          `입력 i_in(t)은 그림 (나)와 같은 **사각 펄스**로, 0~T 구간은 I₁=${v.I1_mA}mA, T~2T 구간은 0이다 (주기 2T).`,
          `이는 RC 응답 회로(전압원·직렬 R·C, V_C 측정)의 **쌍대 회로**(전류원·병렬 R·L, i_L 측정)이다.`,
          `<해석 절차>에 따라 인덕터 전류 i_L(t)를 구하시오. (단, i_L(0)=0.)`,
        ].join(" "),
        conditions: [
          `병렬 RL: 전류원 i_in(t) ∥ R=${v.R1d}Ω ∥ L=${v.L1_H}H`,
          `입력 사각 펄스: 0~T는 I₁=${v.I1_mA}mA, T~2T는 0 (T=${T}ms, 주기 2T=${period2T}ms)`,
          `쌍대 관계: 전압원↔전류원, R↔G, C↔L, 직렬↔병렬, V_C↔i_L`,
          `시정수 τ = L/R = ${tau}ms (원본 RC의 τ=RC와 동일)`,
        ],
        question: [
          `[단계 1] 시정수 τ = L/R를 구한다.`,
          `[단계 2] 펄스 상승 구간 끝(t=T)에서 인덕터 전류 최댓값 i_L(T)를 구한다.`,
          `[단계 3] 방전 구간 끝(t=2T)에서 i_L(2T)를 구한다.`,
        ].join("\n"),
        answer: [
          `[단계 1] τ = L/R = ${v.L1_H}/${v.R1d} = ${tau}ms`,
          `[단계 2] i_L(T) = I₁(1−e^(−T/τ)) = I₁(1−e^(−${PULSE_K})) = ${Ipeak}mA`,
          `[단계 3] i_L(2T) = i_L(T)·e^(−T/τ) = ${Ipeak}·e^(−${PULSE_K}) = ${IlEnd}mA`,
        ].join("\n"),
        solution: [
          `[단계 1] 병렬 RL의 시정수 τ = L/R = ${v.L1_H}/${v.R1d} = ${tau}ms. (충전·방전 모두 동일 τ.)`,
          `[단계 2] 충전 구간 [0,T]: 전류원이 I₁ 인가 → i_L(t)=I₁(1−e^(−t/τ)). 펄스 끝 t=T=${PULSE_K}τ에서 최댓값 i_L(T)=I₁(1−e^(−${PULSE_K}))=${v.I1_mA}·(1−e^(−${PULSE_K}))=${Ipeak}mA.`,
          `[단계 3] 방전 구간 [T,2T]: 전류원 off(개방) → R∥L만 남아 i_L 감쇠 i_L(t)=i_L(T)·e^(−(t−T)/τ). t=2T에서 i_L(2T)=${Ipeak}·e^(−${PULSE_K})=${IlEnd}mA.`,
          `  (★ 원본 RC 펄스 응답 V_C의 쌍대 — V↔I, C↔L, 직렬↔병렬. 충전→방전 구조·τ 동일.)`,
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
