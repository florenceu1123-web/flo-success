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
        label: "(가) 상태 전이도",
        role: "state_diagram",
        diagramType: "concept_diagram",
        diagram: gen.stateDiagram,
      },
      {
        id: `fig_impl_${i + 1}`,
        label: "(나) FSM 구현 회로 (D 플립플롭 + 2×1 MUX)",
        role: "implementation_circuit",
        diagramType: "logic_network",
        diagram: gen.logicNetworkDiagram,
      },
      {
        id: `fig_mux_table_${i + 1}`,
        label: "(다) 2×1 MUX 동작 특성",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: {
          variables: ["S"],
          outputLabel: "F (출력)",
          rows: [
            { inputs: [0], output: "I₀" },
            { inputs: [1], output: "I₁" },
          ],
        },
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
