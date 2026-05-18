import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateFfMixedApplication } from "@/lib/generation/topologies/ffMixedApplication";
import { writeFfMixedText } from "@/lib/generation/topologies/ffMixedTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runFlipflopMixedPipeline");

/**
 * T-FF + JK-FF 혼합 응용회로 pipeline.
 *
 * Figure 셋:
 *  (가) implementation_circuit — logic_network (T-FF + JK-FF + 조합부)
 *  (나) state_table             — truth_table (다중 column, 일부 셀 빈칸 ㄱ/ㄴ/ㄷ...)
 *  (다) waveform                — waveform (X·CLK·Q_A·Q_B 시뮬, t₁~t₄ 마커)
 */
export async function runFlipflopMixedPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateFfMixedApplication({ params: analysis?.circuitType?.params, seed });
    log.info("ff_mixed_generated", {
      expressions: gen.expressions,
      blanks: gen.blankAnswers.map((b) => `${b.symbol}=${b.answer}`),
    });

    const text = await writeFfMixedText({ generation: gen, mode, topicLabel, contextHint });

    // (가) 회로 + (나) 상태표(ㄱ/ㄴ/ㄷ blank) + (다) 파형 템플릿(Q_A·Q_B blank)
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_impl_${i + 1}`,
        label: "(가) 구현 회로 (T-FF + JK-FF + 조합부)",
        role: "implementation_circuit",
        diagramType: "logic_network",
        diagram: gen.logicNetworkDiagram,
      },
      {
        id: `fig_state_table_${i + 1}`,
        label: "(나) 상태표",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.stateTable,
      },
      {
        id: `fig_waveform_${i + 1}`,
        label: "(다) 입력 X·클럭 및 상태 Q_A·Q_B 파형",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveformTemplate,
      },
    ];

    // 정답·풀이 영역: Q_A·Q_B 채워진 파형
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_waveform_solution_${i + 1}`,
        label: "(다) 파형 — 정답 (Q_A·Q_B 채워진 형태)",
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
