import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateTffStateTableBlank } from "@/lib/generation/topologies/tffStateTableBlank";
import { writeTffStateTableBlankText } from "@/lib/generation/topologies/tffStateTableBlankTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runTffStateTableBlankPipeline");

/**
 * 임용 7번 정보과 — T-FF 2개 + 입력 C + 상태표 빈칸 + K-map 도출 pipeline.
 *
 * Figure 셋 (2개):
 *  (가) implementation_circuit — logic_network (NOT·게이트·T-FF 2개·입력 C)
 *  (나) truth_table             — 상태표 8행 + ㉠~㉧ 빈칸
 *
 *  K-map은 풀이 [단계 3] 산출물 — figure로 노출 X (필요시 정답·풀이 영역에 표시).
 */
export async function runTffStateTableBlankPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateTffStateTableBlank({ params: analysis?.circuitType?.params, seed });
    log.info("tff_state_table_blank_generated", {
      expressions: gen.expressions,
      qaNextSop: gen.qaNextSop,
      qbNextSop: gen.qbNextSop,
      blanks: gen.blankAnswers.map((b) => `${b.symbol}=${b.answer}`),
    });

    const text = await writeTffStateTableBlankText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_impl_${i + 1}`,
        label: "(가) T-FF 2개 + 입력 C 순서논리회로",
        role: "implementation_circuit",
        diagramType: "logic_network",
        diagram: gen.logicNetworkDiagram,
      },
      {
        id: `fig_state_table_${i + 1}`,
        label: "(나) 상태표 (㉠~㉧ 빈칸)",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.stateTable,
      },
    ];

    // 풀이 [단계 3] K-map은 정답·풀이 영역에 시각화.
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_qa_kmap_${i + 1}`,
        label: "[단계 3] Q_A(t+1) 카르노도",
        role: "kmap_qa_next",
        diagramType: "kmap",
        diagram: gen.qaNextKmap,
      },
      {
        id: `fig_qb_kmap_${i + 1}`,
        label: "[단계 3] Q_B(t+1) 카르노도",
        role: "kmap_qb_next",
        diagramType: "kmap",
        diagram: gen.qbNextKmap,
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
