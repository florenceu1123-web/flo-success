"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { AnalysisResult } from "@/types";

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

type SavedSolution = { imageData: string; imageName: string; memo: string; savedAt: number };

/**
 * 사용자가 원본 문제별로 (1) 풀이·정답 사진을 업로드하고 (2) 실수·틀린 부분을 오답 메모로 적어
 * 서버 파일에 저장/복원. 같은 문제(imageKey)를 다시 업로드하면 저장된 사진·메모가 자동으로 뜬다.
 */
function OriginalSolutionEditor({ imageKey }: { imageKey: string | null }) {
  const [imageData, setImageData] = useState("");
  const [imageName, setImageName] = useState("");
  const [memo, setMemo] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 이미지가 바뀌면 서버에서 저장된 풀이 사진·메모를 불러온다 (없으면 빈 값).
  useEffect(() => {
    setJustSaved(false);
    setDirty(false);
    if (!imageKey) {
      setImageData("");
      setImageName("");
      setMemo("");
      setSavedAt(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/solutions?key=${encodeURIComponent(imageKey)}`);
        const data = (await res.json()) as { solution?: SavedSolution | null };
        if (cancelled) return;
        const rec = data.solution ?? null;
        setImageData(rec?.imageData ?? "");
        setImageName(rec?.imageName ?? "");
        setMemo(rec?.memo ?? "");
        setSavedAt(rec?.savedAt ?? null);
      } catch {
        if (cancelled) return;
        setImageData("");
        setImageName("");
        setMemo("");
        setSavedAt(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [imageKey]);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return;
      setImageData(result); // 전체 data URL 저장 (data:image/...;base64,...)
      setImageName(file.name);
      setDirty(true);
    };
    reader.readAsDataURL(file);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ""; // 같은 파일 재선택 허용
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const removeImage = () => {
    setImageData("");
    setImageName("");
    setDirty(true);
  };

  const onMemo = (v: string) => { setMemo(v); setDirty(true); };

  const save = async () => {
    if (!imageKey || saving) return;
    if (!imageData && !memo.trim()) {
      alert("저장할 풀이 사진이나 메모를 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/solutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: imageKey, imageData, imageName, memo }),
      });
      const data = (await res.json()) as { solution?: SavedSolution; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSavedAt(data.solution?.savedAt ?? Date.now());
      setDirty(false);
      setJustSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      alert(`저장에 실패했습니다: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!imageKey || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/solutions?key=${encodeURIComponent(imageKey)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setImageData("");
      setImageName("");
      setMemo("");
      setSavedAt(null);
      setDirty(false);
      setJustSaved(false);
    } catch (e) {
      alert(`삭제에 실패했습니다: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 풀이·정답 사진 업로드 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">원본 풀이·정답 (사진 업로드)</p>
          <div className="flex items-center gap-2 text-[11px]">
            {loading ? (
              <span className="text-slate-400">불러오는 중…</span>
            ) : justSaved ? (
              <span className="text-emerald-600 font-medium">✓ 서버에 저장됨</span>
            ) : savedAt ? (
              <span className="text-slate-400">
                {dirty ? "수정됨 (미저장)" : `저장됨 · ${new Date(savedAt).toLocaleString("ko-KR")}`}
              </span>
            ) : (
              <span className="text-slate-400">미저장</span>
            )}
          </div>
        </div>

        <label
          htmlFor="solution-image-input"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="block w-full cursor-pointer rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50 transition-colors p-4 text-center"
        >
          <input
            id="solution-image-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
          {imageData ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageData}
                alt={imageName || "풀이 사진"}
                className="mx-auto max-h-72 rounded-lg border border-blue-100"
              />
              {imageName && <p className="text-xs text-blue-600 truncate">{imageName}</p>}
              <p className="text-xs text-slate-500">다른 사진으로 교체하려면 클릭</p>
            </div>
          ) : (
            <div className="space-y-1.5 py-4">
              <svg className="mx-auto w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-medium text-blue-700">풀이·정답 사진을 클릭하거나 끌어놓으세요</p>
              <p className="text-xs text-slate-500">손으로 푼 풀이를 찍어서 올리세요 · PNG · JPG</p>
            </div>
          )}
        </label>
        {imageData && (
          <button
            type="button"
            onClick={removeImage}
            className="mt-1.5 text-[11px] text-slate-400 hover:text-rose-500 transition-colors"
          >
            사진 제거
          </button>
        )}
      </div>

      {/* 오답 메모지 */}
      <div>
        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">오답 메모지 (실수·틀린 부분)</p>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-inner">
          <textarea
            value={memo}
            onChange={(e) => onMemo(e.target.value)}
            rows={5}
            placeholder="이 문제에서 실수했던 부분, 틀렸던 이유, 다음에 조심할 점을 적어두세요.&#10;예) 테브난 등가에서 종속전원 처리 빠뜨림 / 부호 반대로 계산함"
            className="w-full rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-sm text-slate-800 leading-relaxed focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-300 resize-y"
            style={{ backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, #fde68a55 28px)" }}
          />
          <p className="mt-1 text-[11px] text-amber-500">
            같은 문제를 다시 업로드하면 이 메모가 자동으로 다시 표시됩니다.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!imageKey || loading || saving || (!dirty && !!savedAt)}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        {savedAt && (
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            className="px-3 py-2 rounded-lg border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
