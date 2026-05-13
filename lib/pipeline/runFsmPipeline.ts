import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateFsm } from "@/lib/generation/topologies/fsm";
import { writeFsmText } from "@/lib/generation/topologies/fsmTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runFsmPipeline");

export async function runFsmPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateFsm({ params: analysis?.circuitType?.params, seed });
    log.info("fsm_generated", {
      D1: gen.d1Expression, D0: gen.d0Expression, Z: gen.zExpression,
      nextState: gen.nextState, output: gen.output,
    });

    const text = await writeFsmText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_state_diagram_${i + 1}`,
        label: "Mealy 상태 전이도",
        role: "state_diagram",
        diagramType: "concept_diagram",
        diagram: gen.stateDiagram,
      },
      {
        id: `fig_impl_${i + 1}`,
        label: "FSM 통합 구현 회로 (조합부)",
        role: "implementation_circuit",
        diagramType: "logic_network",
        diagram: gen.logicNetworkDiagram,
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
