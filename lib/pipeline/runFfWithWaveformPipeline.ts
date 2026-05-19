import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateFfWithWaveform } from "@/lib/generation/topologies/ffWithWaveform";
import { writeFfWithWaveformText } from "@/lib/generation/topologies/ffWithWaveformTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runFfWithWaveformPipeline");

export async function runFfWithWaveformPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateFfWithWaveform({ params: analysis?.circuitType?.params, seed, mode });
    log.info("ff_with_waveform_generated", {
      ffType: gen.ffType,
      X: gen.xExpression,
      Y: gen.yExpression,
      hasReset: gen.hasReset,
    });

    const text = await writeFfWithWaveformText({ generation: gen, mode, topicLabel, contextHint });

    // (가) 회로 + (나) 파형 템플릿 (X·Y·Q blank, 학생이 단계 1·2에서 도시)
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_impl_${i + 1}`,
        label: `(가) 구현 회로 (${gen.ffType}-FF + 조합부${gen.hasReset ? " + 비동기 RESET" : ""})`,
        role: "implementation_circuit",
        diagramType: "logic_network",
        diagram: gen.logicNetworkDiagram,
      },
      {
        id: `fig_waveform_${i + 1}`,
        label: "(나) 입력·출력 파형",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveformTemplate,
      },
    ];

    // 정답·풀이 영역: X·Y·Q 채워진 파형
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_waveform_solution_${i + 1}`,
        label: "(나) 파형 — 정답 (X·Y·Q 채워진 형태)",
        role: "solution_waveform",
        diagramType: "waveform",
        diagram: gen.waveformSolution,
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
      solutionFigures,
    };
  });
}
