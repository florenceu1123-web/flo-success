import type { AnalysisResult } from "@/types";

/**
 * 분석 결과를 generator에 넘기기 전에 토큰 압축·정규화한다.
 * 1차 stub: 입력 그대로 반환. 향후 SemanticStructure 추출·topology 압축 추가.
 */
export function compactAnalysis(analysis: AnalysisResult): AnalysisResult {
  return analysis;
}
