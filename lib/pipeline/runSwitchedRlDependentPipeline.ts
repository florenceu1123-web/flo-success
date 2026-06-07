import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateSwitchedRlDependent } from "@/lib/generation/topologies/switchedRlDependent";
import { writeSwitchedRlDependentText } from "@/lib/generation/topologies/switchedRlDependentTextWriter";
import { generateInParallel } from "./_common";
import type { FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runSwitchedRlDependentPipeline");

/**
 * 스위치 RL + 종속전원(2i_A) 과도응답 (임용 2022 B-7) — 고정 토폴로지 archetype.
 *   종속전원 CCVS·스위치 상태전이를 generic 경로가 못 다뤄 잃는 문제 회피.
 */
export async function runSwitchedRlDependentPipeline(args: {
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { count, topicKey, mode } = args;
  const variant = mode === "exam_variant";
  return generateInParallel(count, async (i, seed) => {
    const gen = generateSwitchedRlDependent({ seed, variant });
    log.info("switched_rl_dependent_generated", {
      V1: gen.values.V1, V2: gen.values.V2,
      iL0: gen.solution.iL0, iLinf: gen.solution.iLinf, tau: gen.solution.tau,
    });
    const text = writeSwitchedRlDependentText({ generation: gen });
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_main_${i + 1}`,
        label: "주어진 회로 (스위치 RL + 종속전원)",
        role: "original_circuit",
        diagramType: "analog_netlist",
        diagram: gen.netlist,
      },
    ];
    return {
      id: randomUUID(),
      content: text.content,
      conditions: text.conditions,
      question: text.question,
      answer: text.answer,
      solution: text.solution,
      topicKey,
      figureVariants,
    };
  });
}
