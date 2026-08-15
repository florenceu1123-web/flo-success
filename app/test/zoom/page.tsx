"use client";

/**
 * 임시 시각 검증 페이지 — 원본 풀이·정답 사진의 확대 보기.
 * Vision·GPT 호출 없이 AnalysisPanel만 렌더해서 확대 버튼·뷰어를 확인한다.
 */
import AnalysisPanel from "@/components/AnalysisPanel";
import type { AnalysisResult } from "@/types";

const MOCK: AnalysisResult = {
  topic: "확대 보기 시각 검증",
  interpretation: "원본 풀이·정답 사진의 확대 기능을 확인하기 위한 임시 페이지입니다.",
  relatedConcepts: ["확대", "회전", "이동"],
  fillInTheBlanks: [],
} as AnalysisResult;

export default function ZoomTestPage() {
  return (
    <main className="max-w-2xl mx-auto p-6">
      <AnalysisPanel analysis={MOCK} isLoading={false} imageKey="img66nfs4" />
    </main>
  );
}
