import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateCounterDacComparator } from "@/lib/generation/topologies/counterDacComparator";
import { writeCounterDacComparatorText } from "@/lib/generation/topologies/counterDacComparatorTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runCounterDacComparatorPipeline");

export async function runCounterDacComparatorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateCounterDacComparator({ params: analysis?.circuitType?.params, seed });
    log.info("counter_dac_comparator_generated", {
      values: gen.values,
      answer: gen.answer,
    });
    const text = await writeCounterDacComparatorText({ generation: gen, mode, topicLabel, contextHint });

    // (가) 단일 mixed_circuit — logic + analog 통합. (나) waveform.
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_mixed_${i + 1}`,
        label: "(가) 응용회로 (JK 카운터 + DAC + 비교기)",
        role: "main_circuit",
        diagramType: "mixed_circuit",
        diagram: gen.mixedCircuit,
      },
      {
        id: `fig_waveform_${i + 1}`,
        label: "(나) 클럭·Q_A'·Q_B'·V_o 파형",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveformDiagram,
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
