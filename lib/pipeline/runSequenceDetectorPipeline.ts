import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateSequenceDetector } from "@/lib/generation/topologies/sequenceDetector";
import { writeSequenceDetectorText } from "@/lib/generation/topologies/sequenceDetectorTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";
import type { StateCode } from "@/lib/generation/topologies/sequenceDetector";
import type {
  SequenceBlockDiagram,
  SequenceStateDiagram,
  SequenceStateTable,
} from "@/lib/renderers/sequenceDetectorRenderer";

const log = createLogger("lib/pipeline/runSequenceDetectorPipeline");

const ALL_STATES = ["00", "01", "10", "11"] as const;

/**
 * 시퀀스 검출기 pipeline (임용 8번 정보과 형식).
 *
 *   1) generateSequenceDetector — 패턴 기반 FSM 생성 + 빈칸·SOP 답 도출
 *   2) writeSequenceDetectorText — GPT로 본문+질문+풀이 작성, 솔버 답 강제
 *   3) 3 figure assemble: 블록도(가) + 상태도(나, 빈칸) + 상태표(다, 빈칸 + don't care)
 */
export async function runSequenceDetectorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateSequenceDetector({ params: analysis?.circuitType?.params, seed });
    log.info("seq_detector_generated", {
      pattern: gen.pattern,
      blanks: gen.blanks,
      sop: gen.sop,
    });

    const text = await writeSequenceDetectorText({ generation: gen, mode, topicLabel, contextHint });

    const blockDiagram: SequenceBlockDiagram = {
      inputLabel: "y",
      outputLabel: "z",
      boxLabel: "시퀀스 검출기",
    };
    const stateDiagram: SequenceStateDiagram = {
      states: (ALL_STATES as readonly string[]).map((code) => ({
        code: code as unknown as StateCode,
        isUsed: gen.usedStates.has(code as unknown as StateCode),
      })),
      transitions: gen.transitions,
      blankSourceState: gen.blanks.sourceState,
    };
    const stateTable: SequenceStateTable = {
      transitions: gen.transitions,
      hideAnswers: true,  // (다)는 학생 빈칸. don't care 행만 'x' 표시.
    };

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_seq_block_${i + 1}`,
        label: `(가) 시퀀스 '${gen.pattern}' 검출기 블록도`,
        role: "main_circuit",
        diagramType: "sequence_block",
        diagram: blockDiagram as unknown as Record<string, unknown>,
      },
      {
        id: `fig_seq_state_${i + 1}`,
        label: "(나) 상태 전이도 (㉠㉡㉢㉣ 채우기)",
        role: "state_diagram",
        diagramType: "sequence_state_diagram",
        diagram: stateDiagram as unknown as Record<string, unknown>,
      },
      {
        id: `fig_seq_table_${i + 1}`,
        label: "(다) 상태표 (학생 채우기, x = don't care)",
        role: "truth_table",
        diagramType: "sequence_state_table",
        diagram: stateTable as unknown as Record<string, unknown>,
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
