import { createLogger } from "@/lib/logger";
import { generateThevenin, generateTheveninDual, type TheveninArchetype } from "@/lib/generation/topologies/thevenin";
import { writeTheveninText } from "@/lib/generation/topologies/theveninTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import { solveMNA } from "@/lib/solver/mna";
import { verifyWithSpice } from "@/lib/verification/verifyWithSpice";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runTheveninPipeline");

/**
 * Thevenin 회로이론 문제 end-to-end 파이프라인.
 *  1) Topology + 값 생성 (코드 결정론)
 *  2) Solver로 V_th, R_th 계산 (코드)
 *  3) GPT는 (회로 + 정답) → 문제문장 + 풀이만 작성
 *  4) GeneratedProblem assemble — figureVariants는 코드 netlist 그대로
 *  GPT가 회로 자체를 만들지 않으므로 dangling/role-swap/inventory miss 전부 차단.
 */
export async function runTheveninPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  // ★ 기출변형유형 = 쌍대(dual): 테브난 등가(전압원·직렬 R) → 노턴 등가(전류원·병렬 R).
  //   V↔I, R↔G, 직렬↔병렬. 결정론 텍스트(GPT 없음). I_N=V_th/R₀, R_N=R₀²/R_th.
  if (mode === "exam_variant") {
    return generateInParallel(count, async (i, seed) => {
      const gen = generateTheveninDual({ seed });
      const v = gen.values;
      log.info("thevenin_dual_generated", { In: gen.answer.In, Rn: gen.answer.Rn, values: v });
      const text = {
        content: [
          `그림은 직류 전류원(I₁=${v.I1}A)과 두 저항(R₁=${v.R1d}Ω, R₂=${v.R2d}Ω)으로 구성된 2단자(a–b) 회로이다.`,
          `이는 테브난 등가(전압원·직렬 저항) 문제의 **쌍대 회로**(전류원·병렬 저항)이다.`,
          `단자 a–b에서 본 **노턴 등가회로**(전류원 I_N ∥ 저항 R_N)를 구하시오.`,
        ].join(" "),
        conditions: [
          `전류원 I₁=${v.I1}A ∥ R₁=${v.R1d}Ω (노드 n₁–접지), R₂=${v.R2d}Ω (n₁–a 직렬)`,
          `쌍대 관계: 전압원↔전류원, 직렬 R↔병렬 R, 테브난(V_th·R_th)↔노턴(I_N·R_N)`,
        ],
        question: [
          `[단계 1] 단자 a–b를 단락했을 때의 단락전류 I_N(노턴 전류)을 구한다.`,
          `[단계 2] 전원을 죽이고 a–b에서 본 등가저항 R_N을 구한다. (노턴 등가: I_N ∥ R_N)`,
        ].join("\n"),
        answer: [
          `[단계 1] I_N = ${gen.answer.In} A`,
          `[단계 2] R_N = ${gen.answer.Rn} Ω   (노턴 등가: ${gen.answer.In}A 전류원 ∥ ${gen.answer.Rn}Ω)`,
        ].join("\n"),
        solution: [
          `[단계 1] 단자 a–b 단락 → R₂를 통해 흐르는 전류가 I_N. 전류원 I₁이 R₁과 R₂(단락측)로 분류:`,
          `  I_N = I₁·R₁/(R₁+R₂) = ${v.I1}·${v.R1d}/(${v.R1d}+${v.R2d}) = ${gen.answer.In} A.`,
          `[단계 2] 전류원 개방 → a에서 본 저항 = R₂ + R₁ = ${v.R2d}+${v.R1d} = ${gen.answer.Rn} Ω.`,
          `  (★ 원본 테브난의 V_th=${v.Vth}V·R_th=${v.Rth}Ω의 쌍대: I_N=V_th/R₀, R_N=R₀²/R_th, R₀=${v.R0}.)`,
        ].join("\n"),
      };
      return assembleProblem({
        text, netlist: gen.netlist,
        figureLabel: "주어진 회로 (노턴 형식, 쌍대)", figureRole: "original_circuit",
        figureIdSuffix: i + 1, topicKey,
      });
    });
  }

  const archetype: TheveninArchetype = "voltage_divider";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateThevenin({ archetype, params: analysis?.circuitType?.params, seed });
    log.info("thevenin_generated", { archetype: gen.archetype, Vth: gen.answer.Vth, Rth: gen.answer.Rth, values: gen.values });

    // ngspice 교차 검증 (가능하면) — 솔버 결과 vs SPICE 결과 비교, 불일치만 로그
    void verifyAsync(gen);

    const text = await writeTheveninText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}

/**
 * Fire-and-forget ngspice 검증. ngspice 미설치 시 silent skip.
 */
async function verifyAsync(gen: { solverNet: import("@/lib/solver/mna").SolverNetwork; terminalA: string; terminalB: string; answer: { Vth: number; Rth: number } }) {
  try {
    const solverResult = solveMNA(gen.solverNet);
    const verify = await verifyWithSpice({
      net: gen.solverNet,
      solverResult,
      verifyNodes: [gen.terminalA],
    });
    if (verify.attempted && !verify.ok) {
      log.warn("spice_verification_failed", { discrepancies: verify.discrepancies });
    } else if (verify.attempted && verify.ok) {
      log.info("spice_verification_passed");
    }
  } catch (e) {
    log.warn("spice_verification_error", { message: (e as Error).message });
  }
}
