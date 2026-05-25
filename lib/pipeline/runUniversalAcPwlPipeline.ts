import { createLogger } from "@/lib/logger";
import { generateUniversalAcPwl } from "@/lib/generation/topologies/universalAcPwl";
import { writeUniversalAcPwlText } from "@/lib/generation/topologies/universalAcPwlTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runUniversalAcPwlPipeline");

/**
 * Universal AC PWL pipeline (임용 6번 형식 — SW + 다이오드 + AC clamp).
 *
 *  path:
 *    1) generateUniversalAcPwl — params·seed 기반 변형 수치 + netlist + 시뮬 답 추출
 *       (내부에서 simulateTimeStepPwl + extractImyong6Answers 호출)
 *    2) writeUniversalAcPwlText — GPT로 문제 문장·풀이 작성, 솔버 수치 강제
 *    3) assembleProblem — netlist를 figure로, text와 묶어 GeneratedProblem 반환
 */
export async function runUniversalAcPwlPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateUniversalAcPwl({ params: analysis?.circuitType?.params, seed });
    log.info("generated", {
      values: gen.values,
      answer: gen.answer,
    });
    const text = await writeUniversalAcPwlText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: "SW + 다이오드 + 교류 클램프 회로 (임용 6번 형식)",
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
    });
  });
}
