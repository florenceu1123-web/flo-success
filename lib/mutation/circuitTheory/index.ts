import { generateSimilar } from "../index";
import type { AnalysisResult, GeneratedProblem, SemanticStructure, TopicKey } from "@/types";

/** 회로이론 exam_similar 변형. 현재는 공통 generateSimilar 위임. */
export async function generateCircuitTheorySimilar(args: {
  image: string;
  count: number;
  analysis?: AnalysisResult | null;
  topicKey?: TopicKey;
  semantic?: SemanticStructure;
}): Promise<GeneratedProblem[]> {
  return generateSimilar({ ...args, subject: "circuit_theory" });
}
