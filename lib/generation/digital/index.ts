import { generateVariant } from "../index";
import type { AnalysisResult, GeneratedProblem, SemanticStructure, TopicKey } from "@/types";

/**
 * 디지털논리 exam_variant 생성기.
 * 현재는 공통 generateVariant 위임. 향후 kmap·waveform 특화 후처리 추가 예정.
 */
export async function generateDigitalVariant(args: {
  image: string;
  count: number;
  analysis?: AnalysisResult | null;
  topicKey?: TopicKey;
  semantic?: SemanticStructure;
}): Promise<GeneratedProblem[]> {
  return generateVariant({ ...args, subject: "digital_logic" });
}
