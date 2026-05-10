import { generateVariant } from "../index";
import type { AnalysisResult, GeneratedProblem, SemanticStructure, TopicKey } from "@/types";

/**
 * 전자회로 exam_variant 생성기.
 * 현재는 공통 generateVariant 위임. 향후 OPAMP/BJT 특화 후처리 추가 예정.
 */
export async function generateElectronicsVariant(args: {
  image: string;
  count: number;
  analysis?: AnalysisResult | null;
  topicKey?: TopicKey;
  semantic?: SemanticStructure;
}): Promise<GeneratedProblem[]> {
  return generateVariant({ ...args, subject: "electronics" });
}
