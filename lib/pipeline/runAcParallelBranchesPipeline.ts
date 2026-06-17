import { createLogger } from "@/lib/logger";
import {
  generateAcParallelBranches,
  generateAcParallelBranchesDual,
} from "@/lib/generation/topologies/acParallelBranches";
import { writeAcParallelBranchesText } from "@/lib/generation/topologies/acParallelBranchesTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcParallelBranchesPipeline");

export async function runAcParallelBranchesPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  // ★ 기출변형유형 = 코일↔커패시터 교환 (dual): C1∥C2∥R∥L. 결정론 텍스트.
  if (mode === "exam_variant") {
    return generateInParallel(count, async (i, seed) => {
      const gen = generateAcParallelBranchesDual({ seed });
      const v = gen.values;
      log.info("ac_parallel_branches_dual_generated", { values: v });
      const ph = (m: number, a: number) => `${m}∠${a}°`;
      const text = {
        content:
          `그림은 교류 전원이 포함된 회로이다(기출변형: 코일↔커패시터 교환). 마디 N_L의 커패시터 C₁에 흐르는 전류 페이저가 I_C1 = ${ph(v.I_L1_mag, v.I_L1_ang)}[A]이고, 인덕터 L에 흐르는 전류가 I_L = ${ph(v.I_C_mag, v.I_C_ang)}[A]일 때, i_R1(t)의 페이저 I_R1[A]를 단계별로 구하여 순서대로 서술하시오. (단, 페이저 크기는 실효값이다.)`,
        conditions: [
          `ω = ${v.omega} rad/s, R_top = ${v.R_top}Ω, R = ${v.R}Ω`,
          `N_L 가지: C₁ = ${fmtNum(v.L1)}F. N_R 가지: C₂ = ${fmtNum(v.L2)}F ∥ R ∥ L = ${fmtNum(v.C)}H.`,
          `주어진 페이저: I_C1 = ${ph(v.I_L1_mag, v.I_L1_ang)}, I_L = ${ph(v.I_C_mag, v.I_C_ang)} (실효값).`,
        ],
        question: [
          `[단계 1] 마디 N_R의 전압 V[V]를 구한다 (V = I_L·jωL).`,
          `[단계 2] [단계 1]을 이용해 C₂ 전류 I_C2[A]와 전류원 I_S[A]를 구한다 (KCL at N_R).`,
          `[단계 3] [단계 2]를 이용해 R_top 전류 I_R1[A]를 구한다 (KCL at N_L: I_R1 = I_C1 + I_S).`,
        ].join("\n"),
        answer: [
          `[단계 1] V = ${ph(v.V_C_mag, v.V_C_ang)} V`,
          `[단계 2] I_C2 = ${ph(v.I_L2_mag, v.I_L2_ang)} A,  I_S = ${ph(v.I_S_mag, v.I_S_ang)} A`,
          `[단계 3] I_R1 = ${ph(v.I_R1_mag, v.I_R1_ang)} A`,
        ].join("\n"),
        solution: [
          `[단계 1] 특수 가지(인덕터)에 I_L이 흐르므로 N_R 전압 V = I_L·jωL = ${ph(v.I_C_mag, v.I_C_ang)}·j${fmtNum(v.omega * v.C)} = ${ph(v.V_C_mag, v.V_C_ang)}V.`,
          `[단계 2] I_C2 = V/(1/jωC₂) = V·jωC₂ = ${ph(v.I_L2_mag, v.I_L2_ang)}A. I_R = V/R. KCL at N_R: I_S = I_C2 + I_R + I_L = ${ph(v.I_S_mag, v.I_S_ang)}A.`,
          `[단계 3] KCL at N_L: I_R1 = I_C1 + I_S = ${ph(v.I_L1_mag, v.I_L1_ang)} + ${ph(v.I_S_mag, v.I_S_ang)} = ${ph(v.I_R1_mag, v.I_R1_ang)}A.`,
        ].join("\n"),
      };
      return assembleProblem({
        text,
        netlist: gen.netlist,
        figureLabel: "교류 다중 가지 회로 (기출변형: C₁ ∥ C₂ ∥ R ∥ L — 코일↔커패시터 교환)",
        figureRole: "original_circuit",
        figureIdSuffix: i + 1,
        topicKey,
      });
    });
  }

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcParallelBranches({ params: analysis?.circuitType?.params, seed });
    log.info("ac_parallel_branches_generated", { values: gen.values });

    const text = await writeAcParallelBranchesText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: "교류 다중 가지 회로 (임용 5번, V_s + R + L₁ + I_S + L₂ + R + C 병렬)",
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
    });
  });
}

function fmtNum(x: number): string {
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  return String(Math.round(x * 10000) / 10000);
}
