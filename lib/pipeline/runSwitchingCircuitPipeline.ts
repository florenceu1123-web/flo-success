import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateSwitchingCircuit } from "@/lib/generation/topologies/switchingCircuit";
import { writeSwitchingCircuitText } from "@/lib/generation/topologies/switchingCircuitTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runSwitchingCircuitPipeline");

/**
 * DC 스위칭 회로 파이프라인 — state_before / state_after 두 figure 생성.
 */
export async function runSwitchingCircuitPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateSwitchingCircuit({ params: analysis?.circuitType?.params, seed });
    log.info("switching_circuit_generated", {
      target: gen.target,
      open: gen.target === "Va" ? gen.openSolution.Va : gen.openSolution.Ir1,
      closed: gen.target === "Va" ? gen.closedSolution.Va : gen.closedSolution.Ir1,
      values: gen.values,
    });

    const text = await writeSwitchingCircuitText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_state_before_${i + 1}`,
        label: "스위치 열린 상태 (t<0 또는 SW open)",
        role: "state_before",
        diagramType: "analog_netlist",
        diagram: gen.netlistOpen,
      },
      {
        id: `fig_state_after_${i + 1}`,
        label: "스위치 닫힌 상태 (SW closed)",
        role: "state_after",
        diagramType: "analog_netlist",
        diagram: gen.netlistClosed,
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
