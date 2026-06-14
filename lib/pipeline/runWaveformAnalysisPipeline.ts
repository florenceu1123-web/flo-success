import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateWaveformAnalysis } from "@/lib/generation/topologies/waveformAnalysis";
import { writeWaveformAnalysisText } from "@/lib/generation/topologies/waveformAnalysisTextWriter";
import { writeTimingToLogicText } from "@/lib/generation/topologies/timingToLogicTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
  type WaveformDiagram,
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

  const timingGivenDeriveCircuit = Boolean(analysis?.circuitType?.params?.timingGivenDeriveCircuit);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateWaveformAnalysis({ params: analysis?.circuitType?.params, seed });
    log.info("waveform_analysis_generated", {
      F: gen.fExpression, sequence: gen.outputSequence.join(""), timingGivenDeriveCircuit,
    });

    // ★ 임용 8번 (타이밍→논리 도출): 타이밍 도표만 given. kmap·회로는 학생 도출물 → solutionFigures.
    if (timingGivenDeriveCircuit) {
      const text = writeTimingToLogicText({ generation: gen });
      // 타이밍 도표 — 중간신호 Y blank 트랙 제거 (원본은 A·B·C·F만). F는 given(채워짐).
      const timingDiagram: WaveformDiagram = {
        ...gen.waveformDiagram,
        signals: gen.waveformDiagram.signals.filter((s) => !s.blank && s.name !== "Y"),
      };
      // 풀이용 회로 — ㉠ 빈칸 제거(완성 회로 제시).
      const solutionCircuit = { ...gen.logicNetworkDiagram, blanks: undefined };
      const figureVariants: FigureVariant[] = [
        {
          id: `fig_timing_${i + 1}`,
          label: "입력·출력 타이밍 도표 (A·B·C·F)",
          role: "waveform",
          diagramType: "waveform",
          diagram: timingDiagram,
        },
      ];
      const solutionFigures: FigureVariant[] = [
        {
          id: `fig_kmap_sol_${i + 1}`,
          label: "[단계 1] 출력 F 카르노 도 (정답)",
          role: "kmap",
          diagramType: "kmap",
          diagram: gen.kmapAnswer,
        },
        {
          id: `fig_circuit_sol_${i + 1}`,
          label: "[단계 2] 최소화된 F의 논리회로",
          role: "implementation_circuit",
          diagramType: "logic_network",
          diagram: solutionCircuit,
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
        semantic: {
          hasStateTransition: false,
          hasEquivalentTransformation: false,
          hasWaveformEvolution: true,
          requiresMultiFigure: false,
        },
        figureVariants,
        solutionFigures,
      };
    }

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
      {
        id: `fig_kmap_${i + 1}`,
        label: "출력 F 카르노맵 (빈칸)",
        role: "kmap",
        diagramType: "kmap",
        diagram: gen.kmapDiagram,
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
