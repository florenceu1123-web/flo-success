import { createLogger } from "@/lib/logger";
import { generateThevenin, type TheveninArchetype } from "@/lib/generation/topologies/thevenin";
import { writeTheveninText } from "@/lib/generation/topologies/theveninTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
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
    const text = await writeTheveninText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
