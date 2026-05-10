import type { AnalysisResult, GeneratedProblem, SemanticStructure, SubjectKey, TopicKey } from "@/types";
import { generateProblems } from "@/lib/generation/_core";

/**
 * exam_similar 모드 진입점 (Pipeline 5단계 중 mutation 분기).
 * 토폴로지 보존 + 수치만 변경. Subject별 세부 분기는 ./{subject}.
 */
export async function generateSimilar(args: {
  image: string;
  subject: SubjectKey;
  count: number;
  analysis?: AnalysisResult | null;
  topicKey?: TopicKey;
  semantic?: SemanticStructure;
}): Promise<GeneratedProblem[]> {
  return generateProblems({ ...args, mode: "exam_similar" });
}
