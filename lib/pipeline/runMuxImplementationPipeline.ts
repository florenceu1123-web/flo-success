import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateMuxImplementation } from "@/lib/generation/topologies/muxImplementation";
import { writeMuxImplementationText } from "@/lib/generation/topologies/muxImplementationTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runMuxImplementationPipeline");

/**
 * 4×1 MUX 등가구현 파이프라인 — 두 figure 동시 emit.
 *   (가) logic_network: 3 NOT + 3 OR + 1 AND
 *   (나) mux_diagram: 4×1 MUX, 선택선 S_1=A, S_0=B, I_0/I_1 빈칸(㉠/㉡)
 */
export async function runMuxImplementationPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateMuxImplementation({ params: analysis?.circuitType?.params, mode, seed, index: i });
    log.info("mux_implementation_generated", {
      pos: gen.values.posExpr,
      sop: gen.values.sopExpr,
      blanks: `blank1=${gen.answer.blank1}, blank2=${gen.answer.blank2}`,
    });

    const text = await writeMuxImplementationText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_gar_${i + 1}`,
        label: "(가) 조합논리회로",
        role: "main_circuit",
        diagramType: "mux_gar_circuit",
        diagram: gen.garDiagram,
      },
      {
        id: `fig_na_${i + 1}`,
        label: "(나) 4×1 MUX 등가회로",
        role: "implementation_circuit",
        diagramType: "mux_diagram",
        diagram: gen.naDiagram,
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
