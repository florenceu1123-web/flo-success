import { generateVariant } from "../index";
import type { AnalysisResult, GeneratedProblem, SemanticStructure, TopicKey } from "@/types";

/**
 * 회로이론 exam_variant 생성기.
 * 현재는 공통 generateVariant 위임. 향후 등가변환·과도응답 특화 후처리 추가 예정.
 */
export async function generateCircuitTheoryVariant(args: {
  image: string;
  count: number;
  analysis?: AnalysisResult | null;
  topicKey?: TopicKey;
  semantic?: SemanticStructure;
}): Promise<GeneratedProblem[]> {
  return generateVariant({ ...args, subject: "circuit_theory" });
}
