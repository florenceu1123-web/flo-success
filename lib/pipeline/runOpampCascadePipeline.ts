import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampCascade } from "@/lib/generation/topologies/opampCascade";
import { writeOpampCascadeText } from "@/lib/generation/topologies/opampCascadeTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";
import type { OpampCascadeDiagram } from "@/lib/renderers/opampCascadeRenderer";

const log = createLogger("lib/pipeline/runOpampCascadePipeline");

export async function runOpampCascadePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampCascade({ params: analysis?.circuitType?.params, seed, mode });
    log.info("opamp_cascade_generated", { values: gen.values, answer: gen.answer });

    const text = await writeOpampCascadeText({ generation: gen, mode, topicLabel, contextHint });

    const v = gen.values;
    const diagram: OpampCascadeDiagram = {
      V_i_label: "v_i(t)",
      R_1_label: `${v.R_1}kΩ`,
      R_2_label: `${v.R_2}kΩ`,
      R_3_label: `${v.R_3}kΩ`,
      R_4_label: `${v.R_4}kΩ`,
      R_5_label: `${v.R_5}kΩ`,
      R_6_label: `${v.R_6}kΩ`,
    };

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_opamp_cascade_${i + 1}`,
        label: "(가) 2-OPAMP cascade 응용 회로",
        role: "original_circuit",
        diagramType: "opamp_cascade",
        diagram: diagram as unknown as Record<string, unknown>,
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
