import type { AnalysisResult, GeneratedProblem, SemanticStructure, SubjectKey, TopicKey } from "@/types";
import { generateProblems } from "./_core";

export { resolvePolicy } from "./resolvePolicy";

/**
 * exam_variant 모드 진입점 (Pipeline 5단계 중 generation 분기).
 * Subject별 세부 분기는 향후 ./digital, ./electronics, ./circuitTheory에서 확장.
 */
export async function generateVariant(args: {
  image: string;
  subject: SubjectKey;
  count: number;
  analysis?: AnalysisResult | null;
  topicKey?: TopicKey;
  semantic?: SemanticStructure;
}): Promise<GeneratedProblem[]> {
  return generateProblems({ ...args, mode: "exam_variant" });
}
