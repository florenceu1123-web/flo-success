"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { AnalysisResult } from "@/types";
import ImageZoomViewer from "./ImageZoomViewer";

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

type SavedGeneratedShot = { imageData: string; imageName: string; label?: string; addedAt: number };

/**
 * ★ 「이 본문으로 생성했던 문제」 보관함 — 여러 장을 올려 두고 나중에 같은 본문을 다시 올리면
 *   그대로 다시 뜬다(원본 풀이·오답 메모와 같은 imageKey에 함께 저장).
 *
 *   · 여러 장 한 번에 선택/드래그 가능
 *   · 장마다 구분용 라벨("유사 3번", "변형 — 테브난")을 적을 수 있다
 *   · 썸네일 클릭 = 확대 보기
 */
function GeneratedShotsBox({
  shots,
  onChange,
}: {
  shots: SavedGeneratedShot[];
  onChange: (next: SavedGeneratedShot[]) => void;
}) {
  const [zoom, setZoom] = useState<SavedGeneratedShot | null>(null);
  const MAX = 20;

  const addFiles = (files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) {
      alert("이미지 파일만 올릴 수 있습니다.");
      return;
    }
    const room = MAX - shots.length;
    if (room <= 0) {
      alert(`보관함은 최대 ${MAX}장까지입니다.`);
      return;
    }
    const take = imgs.slice(0, room);
    Promise.all(
      take.map(
        (f) =>
          new Promise<SavedGeneratedShot | null>((resolve) => {
            const r = new FileReader();
            r.onload = () =>
              resolve(
                typeof r.result === "string"
                  ? { imageData: r.result, imageName: f.name, label: "", addedAt: Date.now() }
                  : null,
              );
            r.onerror = () => resolve(null);
            r.readAsDataURL(f);
          }),
      ),
    ).then((added) => {
      const ok = added.filter((x): x is SavedGeneratedShot => !!x);
      if (ok.length) onChange([...shots, ...ok]);
      if (imgs.length > room) alert(`${room}장만 추가했습니다(최대 ${MAX}장).`);
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">
          생성한 문제 보관함 (이 본문으로 만든 문제)
        </p>
        <span className="text-[11px] text-slate-400">{shots.length} / {MAX}장</span>
      </div>

      <label
        htmlFor="generated-shots-input"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className="block w-full cursor-pointer rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 hover:border-indigo-400 hover:bg-indigo-50 transition-colors p-3 text-center"
      >
        <input
          id="generated-shots-input"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = ""; // 같은 파일 재선택 허용
          }}
        />
        <p className="text-sm font-medium text-indigo-700">생성했던 문제 이미지를 클릭하거나 끌어놓으세요</p>
        <p className="text-xs text-slate-500">여러 장 한 번에 올릴 수 있습니다 · PNG · JPG</p>
      </label>

      {shots.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {shots.map((g, i) => (
            <li key={`${g.addedAt}-${i}`} className="rounded-xl border border-indigo-100 bg-white p-2">
              <button
                type="button"
                onClick={() => setZoom(g)}
                className="block w-full"
                title="클릭하면 크게 봅니다"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={g.imageData}
                  alt={g.label || g.imageName}
                  className="w-full h-28 object-cover rounded-lg border border-slate-100"
                />
              </button>
              <input
                value={g.label ?? ""}
                onChange={(e) => {
                  const next = [...shots];
                  next[i] = { ...g, label: e.target.value };
                  onChange(next);
                }}
                placeholder="예) 유사 3번 / 변형 — 테브난"
                className="mt-1.5 w-full rounded-md border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none"
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 truncate max-w-[70%]" title={g.imageName}>
                  {g.imageName}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(shots.filter((_, k) => k !== i))}
                  className="text-[10px] text-slate-400 hover:text-rose-500"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {zoom && (
        <ImageZoomViewer
          src={zoom.imageData}
          alt={zoom.label || zoom.imageName}
          title={zoom.label || zoom.imageName}
          subtitle="생성한 문제"
          onClose={() => setZoom(null)}
        />
      )}

      <p className="mt-1.5 text-[11px] text-slate-400">
        아래 <b>저장</b>을 눌러야 서버에 보관됩니다. 같은 본문을 다시 올리면 이 목록이 자동으로 복원됩니다.
      </p>
    </div>
  );
}
type SavedSolution = {
  imageData: string; imageName: string; memo: string;
  /** 이 본문으로 생성했던 문제 스샷들(구버전 레코드엔 없음). */
  generated?: SavedGeneratedShot[];
  savedAt: number;
};

/**
 * 사용자가 원본 문제별로 (1) 풀이·정답 사진을 업로드하고 (2) 실수·틀린 부분을 오답 메모로 적어
 * 서버 파일에 저장/복원. 같은 문제(imageKey)를 다시 업로드하면 저장된 사진·메모가 자동으로 뜬다.
 */
function OriginalSolutionEditor({ imageKey }: { imageKey: string | null }) {
  const [imageData, setImageData] = useState("");
  const [imageName, setImageName] = useState("");
  const [memo, setMemo] = useState("");
  /** ★ 이 본문(원본 문제)으로 **생성했던 문제** 스샷 보관함 — 여러 장. */
  const [generated, setGenerated] = useState<SavedGeneratedShot[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 확대 보기 열림 여부 — 사진을 크게 보며 풀이를 확인할 때 쓴다. */
  const [zoomOpen, setZoomOpen] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 이미지가 바뀌면 서버에서 저장된 풀이 사진·메모를 불러온다 (없으면 빈 값).
  useEffect(() => {
    setJustSaved(false);
    setDirty(false);
    setZoomOpen(false); // 다른 문제로 넘어가면 열려 있던 확대 보기를 닫는다
    if (!imageKey) {
      setImageData("");
      setImageName("");
      setMemo("");
      setGenerated([]);
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
        setGenerated(rec?.generated ?? []);
        setSavedAt(rec?.savedAt ?? null);
      } catch {
        if (cancelled) return;
        setImageData("");
        setImageName("");
        setMemo("");
        setGenerated([]);
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
    setZoomOpen(false);
    setDirty(true);
  };

  const onMemo = (v: string) => { setMemo(v); setDirty(true); };

  const save = async () => {
    if (!imageKey || saving) return;
    if (!imageData && !memo.trim() && !generated.length) {
      alert("저장할 풀이 사진·메모·생성 문제를 넣어 주세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/solutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: imageKey, imageData, imageName, memo, generated }),
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
      setGenerated([]);
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
              <div className="relative inline-block mx-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageData}
                  alt={imageName || "풀이 사진"}
                  className="max-h-72 rounded-lg border border-blue-100"
                />
                {/* ★ label 안이라 기본 동작(파일 선택창)을 막아야 확대만 열린다. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setZoomOpen(true);
                  }}
                  className="absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/90 border border-blue-200 text-xs font-medium text-blue-700 shadow-sm hover:bg-white hover:border-blue-400 transition-colors"
                  title="확대해서 보기"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15zm-3-7.5h6m-3-3v6" />
                  </svg>
                  확대
                </button>
              </div>
              {imageName && <p className="text-xs text-blue-600 truncate">{imageName}</p>}
              <p className="text-xs text-slate-500">확대해서 보려면 [확대] · 다른 사진으로 교체하려면 클릭</p>
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

        {zoomOpen && imageData && (
          <ImageZoomViewer
            src={imageData}
            alt={imageName || "원본 풀이·정답 사진"}
            title={imageName || "원본 풀이·정답"}
            subtitle="원본 풀이·정답 사진"
            onClose={() => setZoomOpen(false)}
          />
        )}
      </div>

      {/* ★ 이 본문으로 생성했던 문제 보관함 — 여러 장 업로드 가능 */}
      <GeneratedShotsBox shots={generated} onChange={(next) => { setGenerated(next); setDirty(true); }} />

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
