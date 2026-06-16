import { createLogger } from "@/lib/logger";
import { generateRlStep, generateRlStepDual, type RlStepGeneration } from "@/lib/generation/topologies/rlStep";
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

  // ★ 기출변형유형 = 쌍대(dual): RL 에너지축적(전압원·직렬 R·L, i_L) → 병렬 RC(전류원∥R∥C, v_C).
  //   V↔I, R↔G, L↔C, 직렬↔병렬. 시정수 τ 동일. 결정론 텍스트(GPT 없음).
  if (mode === "exam_variant") {
    return generateInParallel(count, async (i, seed) => {
      const gen = generateRlStepDual({ seed });
      const v = gen.values;
      const a = gen.answer;
      log.info("rl_step_dual_generated", { tauMs: a.tauMs, VcAtQuery: a.VcAtQuery, values: v });
      const outSamples: Array<{ t: number; v: number }> = [];
      for (let k = 0; k <= 60; k++) {
        const t = (a.tauMs * 5) * (k / 60);
        outSamples.push({ t, v: Math.round(a.Vinf * (1 - Math.exp(-t / a.tauMs)) * 1000) / 1000 });
      }
      const outWave: FigureVariant = {
        id: `fig_waveform_${i + 1}`,
        label: "v_C(t) 커패시터 전압 응답",
        role: "output_waveform",
        diagramType: "waveform",
        diagram: {
          signals: [{ name: "v_C", shape: "exponential_rise", samples: outSamples, tau: a.tauMs }],
          unit: { time: "ms", value: "V" },
          markers: [{ t: a.tQueryMs, label: `t=${a.tQueryMs}ms` }],
          yMarkers: [{ v: a.Vinf, label: `V_∞=${a.Vinf}V` }],
        },
      };
      const text = {
        content: [
          `그림은 직류 전류원(I₁=${v.I1_A}A)과 저항 R(${v.R1d}Ω), 커패시터 C(${v.C1_uF}μF)가 병렬로 연결된 RC 회로이다. t=0에서 전류원이 인가된다.`,
          `이는 RL 에너지축적 회로(전압원·직렬 R·L, i_L 측정)의 **쌍대 회로**(전류원·병렬 R·C, v_C 측정)이다.`,
          `<해석 절차>에 따라 커패시터 전압 v_C(t)를 구하시오. (단, v_C(0)=0.)`,
        ].join(" "),
        conditions: [
          `병렬 RC: 전류원 I₁=${v.I1_A}A ∥ R=${v.R1d}Ω ∥ C=${v.C1_uF}μF`,
          `쌍대 관계: 전압원↔전류원, R↔G, L↔C, 직렬↔병렬, i_L↔v_C`,
          `시정수 τ = R·C = ${a.tauMs}ms (원본 RL의 τ=L/R와 동일)`,
        ],
        question: [
          `[단계 1] 시정수 τ와 정상상태 전압 v_C(∞)를 구한다.`,
          `[단계 2] t = ${v.N_multiplier}τ = ${a.tQueryMs}ms 에서 v_C 값을 구한다.`,
        ].join("\n"),
        answer: [
          `[단계 1] τ = R·C = ${a.tauMs}ms,  v_C(∞) = I₁·R = ${a.Vinf}V`,
          `[단계 2] v_C(${a.tQueryMs}ms) = ${a.VcAtQuery}V`,
        ].join("\n"),
        solution: [
          `[단계 1] 병렬 RC에 전류원 인가 → v_C(t)=I₁R(1−e^(−t/τ)), τ=R·C=${v.R1d}·${v.C1_uF}µF=${a.tauMs}ms. 정상상태(t→∞)엔 C 개방 → 전류 전부 R로 → v_C(∞)=I₁·R=${a.Vinf}V.`,
          `[단계 2] v_C(${v.N_multiplier}τ)=I₁R(1−e^(−${v.N_multiplier}))=${a.Vinf}·(1−e^(−${v.N_multiplier}))=${a.VcAtQuery}V.`,
          `  (★ 원본 RL의 i_L(t)=(V₁/R)(1−e^(−t/τ))의 쌍대 — V↔I, L↔C, 직렬↔병렬. τ 동일.)`,
        ].join("\n"),
      };
      return assembleProblem({
        text, netlist: gen.netlist,
        figureLabel: "주어진 RC 회로 (쌍대)", figureRole: "original_circuit",
        figureIdSuffix: i + 1, topicKey,
        extraFigures: [outWave],
      });
    });
  }

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
