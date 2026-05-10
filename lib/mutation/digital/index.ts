import { generateSimilar } from "../index";
import type { AnalysisResult, GeneratedProblem, SemanticStructure, TopicKey } from "@/types";

/** 디지털논리 exam_similar 변형. 현재는 공통 generateSimilar 위임. */
export async function generateDigitalSimilar(args: {
  image: string;
  count: number;
  analysis?: AnalysisResult | null;
  topicKey?: TopicKey;
  semantic?: SemanticStructure;
}): Promise<GeneratedProblem[]> {
  return generateSimilar({ ...args, subject: "digital_logic" });
}
