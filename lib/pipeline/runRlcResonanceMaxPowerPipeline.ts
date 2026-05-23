import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateRlcResonanceMaxPower } from "@/lib/generation/topologies/rlcResonanceMaxPower";
import { writeRlcResonanceMaxPowerText } from "@/lib/generation/topologies/rlcResonanceMaxPowerTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runRlcResonanceMaxPowerPipeline");

/**
 * RLC 공진 + Wheatstone 5R 등가 + R_L 최대전력 (임용 7번) 파이프라인.
 *   변형: 4 variant (k 스케일링), index 라운드로빈으로 distinct.
 */
export async function runRlcResonanceMaxPowerPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateRlcResonanceMaxPower({
      params: analysis?.circuitType?.params,
      mode,
      seed,
      index: i,
    });
    log.info("rlc_resonance_max_power_generated", {
      rS: gen.answer.rS,
      C: gen.answer.Clabel,
      RL: gen.answer.RL,
      Pmax: gen.answer.PmaxLabel,
    });

    const text = await writeRlcResonanceMaxPowerText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_rlcmaxp_${i + 1}`,
        label: "공진 + 최대전력 회로 (5R Wheatstone + C + R_L + L)",
        role: "main_circuit",
        diagramType: "rlc_resonance_max_power_circuit",
        diagram: gen.circuitDiagram,
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
