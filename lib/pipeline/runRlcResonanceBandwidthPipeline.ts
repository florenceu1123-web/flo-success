import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateRlcResonanceBandwidth } from "@/lib/generation/topologies/rlcResonanceBandwidth";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runRlcResonanceBandwidthPipeline");

/**
 * 직렬 RLC 공진 + 대역폭 (임용 11번) — 결정론 파이프라인. GPT 호출 없음.
 *  [1] 공진시 L + V_ab 페이저, [2] 대역폭 β₁=R/L, [3] R→R₂ 시 β₂·β₁/β₂.
 */
export async function runRlcResonanceBandwidthPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateRlcResonanceBandwidth({ seed, mode });
    const v = gen.values;
    const a = gen.answer;
    log.info("rlc_resonance_bandwidth_generated", {
      omega0: v.omega0, Ceq: v.Ceq_uF, R: v.R, Vpeak: v.Vpeak, R2: v.R2,
      L_mH: a.L_mH, Vab: `${a.VabMag}∠${a.VabPhase}`, beta1: a.beta1, beta2: a.beta2, ratio: a.ratio,
    });

    const content = [
      `그림 (가)는 공진주파수 ω₀ = ${v.omega0.toExponential(0).replace("e+", "×10^")} [rad/sec]인 직렬 RLC 회로이다.`,
      `교류 전원의 전압이 v(t) = ${v.Vpeak} cos ω₀t [V]로 인가되어 공진(resonance)할 때, 제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오.`,
      `(단, V_ab를 페이저로 표현할 때 ${a.VabMag}∠${a.VabPhase}° [V]로 한다.)`,
    ].join(" ");

    const conditions = [
      `직렬 RLC: v(t) → R(${v.R}Ω) → 마디 a → [C₁(${v.C1_uF}µF) ∥ C₂(${v.C2_uF}µF)] → 마디 b → L → 복귀.`,
      `공진주파수 ω₀ = ${v.omega0} rad/s, 전원 전압 peak ${v.Vpeak}V. L은 미지(학생 도출).`,
    ];

    const question = [
      `[단계 1] 공진시 인덕턴스 L [mH]의 값을 구하고, 페이저 형태로 마디 a와 b 사이의 전압 V_ab [V]를 구한다.`,
      `[단계 2] 회로의 대역폭 β₁ [rad/sec]를 구한다.`,
      `[단계 3] 회로의 저항 R을 ${v.R2}[Ω]으로 바꾸었을 때의 대역폭을 β₂ [rad/sec]라 할 때, β₁/β₂를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] L = ${a.L_mH} mH,  V_ab = ${a.VabMag}∠${a.VabPhase}° V`,
      `[단계 2] β₁ = ${a.beta1} rad/sec`,
      `[단계 3] β₂ = ${a.beta2} rad/sec,  β₁/β₂ = ${a.ratio}`,
    ].join("\n");

    const solution = [
      `[단계 1] C_eq = C₁+C₂ = ${v.Ceq_uF}µF (병렬). 공진: ω₀ = 1/√(L·C_eq) → L = 1/(ω₀²·C_eq) = ${a.L_mH}mH.`,
      `  공진시 X_L=X_C로 상쇄 → Z=R → I = V_peak/R = ${a.Imag}∠0° A.`,
      `  V_ab = I·(1/(jω₀C_eq)) = I·(−j·${a.X}) = ${a.Imag}×${a.X}∠−90° = ${a.VabMag}∠${a.VabPhase}° V.  (X=ω₀L=${a.X}Ω)`,
      `[단계 2] 직렬 RLC 대역폭 β₁ = R/L = ${v.R}/${a.L_mH}m = ${a.beta1} rad/sec.`,
      `[단계 3] R→${v.R2}Ω: β₂ = R₂/L = ${a.beta2} rad/sec. β₁/β₂ = R/R₂ = ${v.R}/${v.R2} = ${a.ratio}.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_rlcbw_${i + 1}`,
        label: "(가) 직렬 RLC 회로 (R–[C₁∥C₂]–L, 단자 a·b)",
        role: "original_circuit",
        diagramType: "rlc_resonance_bandwidth_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return {
      id: randomUUID(),
      content,
      conditions,
      question,
      answer,
      solution,
      topicKey,
      figureVariants,
    };
  });
}
