import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateRlcResonanceBandwidth,
  generateRlcResonanceBandwidthDual,
  type RlcResonanceBandwidthDualGeneration,
} from "@/lib/generation/topologies/rlcResonanceBandwidth";
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

  // ★ 기출변형유형(exam_variant) = 쌍대(dual) 병렬 RLC 회로.
  if (mode === "exam_variant") {
    return generateInParallel(count, async (i, seed) => buildDual(generateRlcResonanceBandwidthDual({ seed }), i, topicKey));
  }

  return generateInParallel(count, async (i, seed) => {
    const gen = generateRlcResonanceBandwidth({ seed });
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

/** 기출변형 = 쌍대(병렬 RLC) 문제 1개 구성. */
function buildDual(gen: RlcResonanceBandwidthDualGeneration, i: number, topicKey?: TopicKey): GeneratedProblem {
  const v = gen.values;
  const a = gen.answer;
  log.info("rlc_resonance_bandwidth_dual_generated", {
    omega0: v.omega0, Ld_H: v.Ld_H, Rd: v.Rd_kohm, Ip: v.Ip_mA,
    Cd_nF: a.Cd_nF, Iab: `${a.Iab_mA}∠${a.IabPhase}`, beta1: a.beta1, ratio: a.ratio,
  });

  const content = [
    `그림 (가)는 공진주파수 ω₀ = ${v.omega0.toExponential(0).replace("e+", "×10^")} [rad/sec]인 **병렬 RLC 회로**이다 (직렬 RLC의 쌍대).`,
    `전류원 i(t) = ${v.Ip_mA} cos ω₀t [mA]가 인가되어 공진할 때, 제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오.`,
    `(단, I_ab를 페이저로 표현할 때 ${a.Iab_mA}∠${a.IabPhase}° [mA]로 한다.)`,
  ].join(" ");

  const conditions = [
    `병렬 RLC: 전류원 i(t) ∥ R_d(${v.Rd_kohm}kΩ) ∥ [L₁(${v.L1_H}H) 직렬 L₂(${v.L2_H}H)] ∥ C_d.`,
    `공진주파수 ω₀ = ${v.omega0} rad/s, 전류원 peak ${v.Ip_mA}mA. C_d는 미지(학생 도출). I_ab = 인덕터 가지 전류.`,
    `※ 이 회로는 직렬 RLC(전압원·V_ab 측정)의 쌍대: 전압원↔전류원, R↔1/R, L↔C, 직렬↔병렬, V↔I.`,
  ];

  const question = [
    `[단계 1] 공진시 정전용량 C_d [nF]의 값을 구하고, 페이저 형태로 인덕터 가지 전류 I_ab [mA]를 구한다.`,
    `[단계 2] 회로의 대역폭 β₁ [rad/sec]를 구한다.`,
    `[단계 3] 회로의 저항 R_d를 ${v.R2d_kohm}[kΩ]으로 바꾸었을 때의 대역폭을 β₂라 할 때, β₁/β₂를 구한다.`,
  ].join("\n");

  const answer = [
    `[단계 1] C_d = ${a.Cd_nF} nF,  I_ab = ${a.Iab_mA}∠${a.IabPhase}° mA`,
    `[단계 2] β₁ = ${a.beta1} rad/sec`,
    `[단계 3] β₂ = ${a.beta2} rad/sec,  β₁/β₂ = ${a.ratio}`,
  ].join("\n");

  const solution = [
    `[단계 1] L_d = L₁+L₂ = ${v.Ld_H}H (직렬). 병렬 공진: ω₀ = 1/√(L_d·C_d) → C_d = 1/(ω₀²·L_d) = ${a.Cd_nF}nF.`,
    `  공진시 B_L=B_C 상쇄 → Y=1/R_d → 단자전압 V = I·R_d. 인덕터 가지전류 I_ab = V/(ω₀L_d) = ${a.Iab_mA}∠${a.IabPhase}° mA.`,
    `[단계 2] 병렬 RLC 대역폭 β₁ = 1/(R_d·C_d) = ${a.beta1} rad/sec.  (직렬 β=R/L의 쌍대)`,
    `[단계 3] R_d→${v.R2d_kohm}kΩ: β₂ = 1/(R₂d·C_d) = ${a.beta2}. β₁/β₂ = R₂d/R_d = ${a.ratio}.`,
  ].join("\n");

  const figureVariants: FigureVariant[] = [
    {
      id: `fig_rlcbw_dual_${i + 1}`,
      label: "(가) 병렬 RLC 회로 (직렬의 쌍대 — i(t)∥R_d∥[L₁+L₂]∥C_d)",
      role: "original_circuit",
      diagramType: "rlc_resonance_bandwidth_dual_circuit",
      diagram: gen.circuitDiagram,
    },
  ];

  return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
}
