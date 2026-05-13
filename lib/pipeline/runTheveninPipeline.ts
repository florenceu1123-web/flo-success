import { createLogger } from "@/lib/logger";
import { generateThevenin, type TheveninArchetype } from "@/lib/generation/topologies/thevenin";
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
  const archetype: TheveninArchetype | undefined = mode === "exam_similar"
    ? "voltage_divider"
    : undefined;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

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
