import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateTheveninSwitchedRc } from "@/lib/generation/topologies/theveninSwitchedRc";
import { writeTheveninSwitchedRcText } from "@/lib/generation/topologies/theveninSwitchedRcTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";
import type {
  TheveninOriginalDiagram,
  TheveninEquivalentDiagram,
} from "@/lib/renderers/theveninSwitchedRcRenderer";

const log = createLogger("lib/pipeline/runTheveninSwitchedRcPipeline");

/**
 * 임용 9번 정보과 pipeline — Thevenin + Switched RC.
 *
 *   1) generateTheveninSwitchedRc: 변형 수치 + Thevenin 해석 + RC step 응답 자동 도출
 *   2) writeTheveninSwitchedRcText: GPT로 본문+풀이 작성, 솔버 답 강제
 *   3) 2 figure assemble: (가) 원본 회로 + (나) Thevenin 등가
 */
export async function runTheveninSwitchedRcPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateTheveninSwitchedRc({ params: analysis?.circuitType?.params, seed });
    log.info("thev_rc_generated", { values: gen.values, answer: gen.answer });

    const text = await writeTheveninSwitchedRcText({ generation: gen, mode, topicLabel, contextHint });

    const v = gen.values;
    const a = gen.answer;
    const original: TheveninOriginalDiagram = {
      V_s_label: `${v.V_s}V`,
      R_top_label: `${v.R_top}Ω`,
      C_1_label: `${v.C_1}F`,
      C_2_label: `${v.C_2}F`,
      R_a_label: `${v.R_a}Ω`,
      R_b_label: `${v.R_b}Ω`,
      R_c_label: `${v.R_c}Ω`,
      I_s_label: `${v.I_s}A`,
      swState: "closed_to_term1",  // 원본은 t<0 상태로 표기
    };
    const equivalent: TheveninEquivalentDiagram = {
      V_s_label: `${v.V_s}V`,
      R_top_label: `${v.R_top}Ω`,
      C_1_label: `${v.C_1}F`,
      C_2_label: `${v.C_2}F`,
      V_Th_label: `V_Th = ${a.V_Th}V`,
      R_Th_label: `R_Th = ${a.R_Th}Ω`,
      swState: "closed_to_term2",  // 등가회로는 t≥0 상태
    };

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_thev_orig_${i + 1}`,
        label: "(가) 원본 회로 (RC + SW + 점선박스)",
        role: "original_circuit",
        diagramType: "thevenin_original_circuit",
        diagram: original as unknown as Record<string, unknown>,
      },
      {
        id: `fig_thev_equiv_${i + 1}`,
        label: "(나) Thevenin 등가 회로",
        role: "equivalent_circuit",
        diagramType: "thevenin_equivalent_circuit",
        diagram: equivalent as unknown as Record<string, unknown>,
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
