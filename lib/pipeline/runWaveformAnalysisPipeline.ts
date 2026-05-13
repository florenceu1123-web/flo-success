import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateWaveformAnalysis } from "@/lib/generation/topologies/waveformAnalysis";
import { writeWaveformAnalysisText } from "@/lib/generation/topologies/waveformAnalysisTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runWaveformAnalysisPipeline");

export async function runWaveformAnalysisPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateWaveformAnalysis({ params: analysis?.circuitType?.params, seed });
    log.info("waveform_analysis_generated", {
      F: gen.fExpression, sequence: gen.outputSequence.join(""),
    });

    const text = await writeWaveformAnalysisText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_impl_${i + 1}`,
        label: "조합 회로",
        role: "implementation_circuit",
        diagramType: "logic_network",
        diagram: gen.logicNetworkDiagram,
      },
      {
        id: `fig_waveform_${i + 1}`,
        label: "입력·출력 파형",
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
