import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateAcPowerFactor } from "@/lib/generation/topologies/acPowerFactor";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcPowerFactorPipeline");

/**
 * AC 역률보정 + 전력 (임용 9번 회로이론) — 결정론 파이프라인. GPT 없음.
 *  [1] 역률 1 되는 X_C, [2] P_avg·Q, [3] P_s(피상).
 */
export async function runAcPowerFactorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcPowerFactor({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("ac_power_factor_generated", { mode, Vs: v.Vs, R1: v.R1, XL: v.XL, R2: v.R2, Xc: a.Xc, Zin: a.Zin, Pavg: a.Pavg });

    const content = [
      "그림은 교류 전원이 포함된 RLC 회로이다.",
      "이 회로의 부하 임피던스와 전력을 제시된 <해석 절차>에 따라 단계별로 구하여 서술하시오.",
      `(단, V_s = ${v.Vs}∠0°[V]는 실효값이다.)`,
    ].join(" ");

    const conditions = [
      `직렬: V_s ─ R₁=${v.R1}[Ω] ─ L(jX_L=j${v.XL}[Ω]) ─ 마디.`,
      `부하 Z = R₂=${v.R2}[Ω] ∥ C(−jX_C[Ω])  (X_C 미지 — 단계 1에서 도출).`,
      `전원 측에서 본 입력 임피던스 Z_in = R₁ + jX_L + Z.`,
    ];

    const question = [
      `[단계 1] 전원 측의 역률이 1이 되기 위한 부하 임피던스 Z의 X_C[Ω]을 구한다.`,
      `[단계 2] [단계 1]의 결과를 이용하여, 전원이 공급하는 평균 전력 P_avg[W]와 무효 전력 Q[VAR]를 구한다.`,
      `[단계 3] 전원이 공급하는 피상 전력 P_s[VA]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] X_C = ${a.Xc}[Ω]`,
      `[단계 2] P_avg = ${a.Pavg}[W],  Q = ${a.Q}[VAR]`,
      `[단계 3] P_s = ${a.Ps}[VA]`,
    ].join("\n");

    const solution = [
      `[단계 1] 부하 Z = R₂∥(−jX_C) = R₂(−jX_C)/(R₂−jX_C), Im(Z) = −R₂²X_C/(R₂²+X_C²).`,
      `  역률 1 ⟺ Im(Z_in)=0 ⟺ X_L = R₂²X_C/(R₂²+X_C²) → X_L·X_C² − R₂²·X_C + X_L·R₂² = 0.`,
      `  R₂=${v.R2}, X_L=${v.XL} 대입 → ${v.XL}·X_C² − ${v.R2 * v.R2}·X_C + ${v.XL * v.R2 * v.R2} = 0 → X_C = ${a.Xc}[Ω].`,
      `[단계 2] 그때 Z = ${a.ZloadRe} − j${-a.ZloadIm} [Ω], Z_in = R₁ + jX_L + Z = ${a.Zin}[Ω] (순저항).`,
      `  I_rms = V_s/Z_in = ${v.Vs}/${a.Zin} = ${a.Irms}[A]. P_avg = I²·Z_in = V_s²/Z_in = ${a.Pavg}[W].`,
      `  역률 1이므로 무효 전력 Q = 0[VAR].`,
      `[단계 3] 피상 전력 P_s = V_s·I_rms = √(P_avg²+Q²) = ${a.Ps}[VA] (= P_avg, 역률 1).`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_acpf_${i + 1}`,
        label: "교류 RLC 회로 (직렬 R+L + 부하 Z = R∥C)",
        role: "original_circuit",
        diagramType: "ac_power_factor_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
