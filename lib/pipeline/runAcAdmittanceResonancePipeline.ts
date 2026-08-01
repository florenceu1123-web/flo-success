import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateAcAdmittanceResonance } from "@/lib/generation/topologies/acAdmittanceResonance";
import { generateInParallel } from "./_common";
import type { AnalysisResult, FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runAcAdmittanceResonancePipeline");

/**
 * 어드미턴스 공진 (임용 7번 회로이론) — 결정론 파이프라인. GPT 없음.
 *  유사: 전압원→병렬[C∥(R+L)], Y_eq=a+jb·ω₀·I_M.
 *  변형(쌍대): 전류원→직렬[L+(R∥C)], Z_eq=a+jb·ω₀·V_M.
 */
export async function runAcAdmittanceResonancePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const g = generateAcAdmittanceResonance({ seed, mode });
    const v = g.vals;
    log.info("ac_admittance_resonance_generated", {
      mode, dual: g.isDual, R: v.R, L: v.L, C: v.C, src: v.src, w0: g.w0, aAt: g.aAt, peak: g.peak,
    });

    const srcVar = g.isDual ? "i(t)" : "v(t)";
    const respVar = g.isDual ? "v(t)" : "i(t)";
    const blockDesc = g.isDual
      ? `직렬 블록 [ L(${v.L}[H]) + ( R(${v.R}[Ω]) ∥ C(${v.C}[F]) ) ]`
      : `병렬 블록 [ C(${v.C}[F]) ∥ ( R(${v.R}[Ω]) + L(${v.L}[H]) 직렬 ) ]`;

    const content = [
      `그림은 교류 ${g.isDual ? "전류원" : "전원"}이 포함된 RLC 회로이다.`,
      `이 회로의 공진 주파수 ω₀[rad/s]와 ${respVar}의 최댓값 ${g.peakSym}[${g.peakUnit}]을 제시된 <해석 절차>에 따라 구하여 순서대로 서술하시오.`,
      `(단, 모든 소자는 이상적으로 동작한다.)`,
    ].join(" ");

    const conditions = [
      `${g.isDual ? "교류 전류원" : "교류 전압원"} ${srcVar} = ${v.src}cos(ωt)[${g.isDual ? "A" : "V"}].`,
      `점선 내부 회로: ${blockDesc}.`,
      `점선 블록의 등가 ${g.isDual ? "임피던스" : "어드미턴스"} ${g.eqSym} = a + jb[${g.immUnit}].`,
    ];

    const question = [
      `[단계 1] 점선 내부 회로에 대한 등가 ${g.isDual ? "임피던스" : "어드미턴스"} ${g.eqSym} = a+jb[${g.immUnit}]의 실수부 a와 허수부 b를 각각 ω가 포함된 식으로 구한다.`,
      `[단계 2] [단계 1]의 결과를 이용하여 회로의 공진 주파수 ω₀[rad/s]를 구한다.`,
      `[단계 3] [단계 1]과 [단계 2]의 결과를 이용하여 ${respVar}의 최댓값 ${g.peakSym}[${g.peakUnit}]을 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] a = ${g.aExpr},  b = ${g.bExpr}`,
      `[단계 2] ω₀ = ${g.w0} [rad/s]`,
      `[단계 3] ${g.peakSym} = ${g.peak} [${g.peakUnit}]`,
    ].join("\n");

    const solution = g.isDual
      ? [
          `[단계 1] Z_eq = jωL + ( R ∥ C ) = jωL + R/(1+jωRC) = R/(1+(ωRC)²) + j[ωL − ωR²C/(1+(ωRC)²)].`,
          `  → a = ${g.aExpr},  b = ${g.bExpr}.`,
          `[단계 2] 공진은 허수부 b=0: ωL = ωR²C/(1+(ωRC)²) → L(1+(ωRC)²)=R²C → ω₀ = √((R²C−L)/(L·R²C²)) = ${g.w0} [rad/s].`,
          `[단계 3] 공진 시 b=0 → Z_eq = a(ω₀) = L/(RC) = ${g.aAt} [Ω]. v(t)=Z_eq·i(t)이므로 최댓값 V_M = I_peak·a(ω₀) = ${v.src}·${g.aAt} = ${g.peak} [V].`,
        ].join("\n")
      : [
          `[단계 1] Y_eq = jωC + 1/(R+jωL) = R/(R²+(ωL)²) + j[ωC − ωL/(R²+(ωL)²)].`,
          `  → a = ${g.aExpr},  b = ${g.bExpr}.`,
          `[단계 2] 공진은 허수부 b=0: ωC = ωL/(R²+(ωL)²) → C(R²+(ωL)²)=L → ω₀ = √((L−R²C)/(L²C)) = ${g.w0} [rad/s].`,
          `[단계 3] 공진 시 b=0 → Y_eq = a(ω₀) = R/(R²+(ω₀L)²) = ${g.aAt} [Ʊ]. i(t)=Y_eq·v(t)이므로 최댓값 I_M = V_peak·a(ω₀) = ${v.src}·${g.aAt} = ${g.peak} [A].`,
        ].join("\n");

    const label = g.isDual
      ? "교류 회로 (쌍대): 전류원 → 직렬[ L + (R∥C) ]"
      : "교류 RLC 회로: 전압원 → 병렬[ C ∥ (R+L) ]";

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_acadm_${i + 1}`,
        label,
        role: "original_circuit",
        diagramType: g.diagramType,
        diagram: g.diagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
