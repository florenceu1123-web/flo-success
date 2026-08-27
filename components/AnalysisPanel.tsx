"use client";

import type { AnalysisResult } from "@/types";
import { OriginalSolutionEditor } from "./OriginalSolutionEditor";

type Props = {
  analysis: AnalysisResult | null;
  isLoading: boolean;
  /** 업로드 이미지 기반 안정 키 — 직접 입력한 풀이·정답 저장/복원용 */
  imageKey?: string | null;
};

/** 업로드된 문제의 주제·관련 개념 + 사용자가 직접 입력·저장하는 원본 풀이 */
export default function AnalysisPanel({ analysis, isLoading, imageKey }: Props) {
  if (isLoading) {
    return (
      <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-24 bg-blue-100 rounded" />
          <div className="h-3 w-full bg-slate-100 rounded" />
          <div className="h-3 w-5/6 bg-slate-100 rounded" />
        </div>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
        이미지를 업로드하면 주제 분석과 관련 개념이 여기에 표시됩니다.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm space-y-5">
      <header>
        <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">주제</p>
        <h3 className="mt-1 text-lg font-bold text-blue-900">{analysis.topic}</h3>
      </header>

      <div>
        <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-2">해석</p>
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{analysis.interpretation}</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-2">관련 개념</p>
        <ul className="flex flex-wrap gap-1.5">
          {analysis.relatedConcepts.map((c, i) => (
            <li key={i} className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
              {c}
            </li>
          ))}
        </ul>
      </div>

      <OriginalSolutionEditor imageKey={imageKey ?? null} />
    </section>
  );
}
