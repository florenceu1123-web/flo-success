import { generateSimilar } from "../index";
import type { AnalysisResult, GeneratedProblem, SemanticStructure, TopicKey } from "@/types";

/** 전자회로 exam_similar 변형. 현재는 공통 generateSimilar 위임. */
export async function generateElectronicsSimilar(args: {
  image: string;
  count: number;
  analysis?: AnalysisResult | null;
  topicKey?: TopicKey;
  semantic?: SemanticStructure;
}): Promise<GeneratedProblem[]> {
  return generateSimilar({ ...args, subject: "electronics" });
}
