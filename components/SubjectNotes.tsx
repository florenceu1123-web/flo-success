"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { SUBJECT_KEYS, SUBJECT_LABEL, type SubjectKey } from "@/types";
import { NOTE_MAX_FILES_PER_UPLOAD, type NotePhoto, type NoteRotation } from "@/types/notes";

/** 과목별 요점정리 사진첩 — 사진 여러 장 업로드 · 썸네일 그리드 · 확대 보기 · 설명 · 삭제. */
export default function SubjectNotes() {
  const [subject, setSubject] = useState<SubjectKey>("electronics");
  const [notes, setNotes] = useState<NotePhoto[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // 순서 변경 드래그 — dragIndex=집어든 사진, overIndex=놓을 자리.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const load = useCallback(async (subj: SubjectKey) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes?subject=${subj}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotes(data.notes ?? []);
      setCounts(data.counts ?? {});
    } catch (e) {
      setNotes([]);
      setError(`목록을 불러오지 못했습니다: ${(e as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(subject);
  }, [subject, load]);

  const upload = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      setIsUploading(true);
      setError(null);
      setNotice(null);
      try {
        const form = new FormData();
        form.append("subject", subject);
        // 상한을 넘겨 보내면 서버가 통째로 거부하므로 앞에서 잘라 여러 번 나눠 올린다.
        for (const file of images.slice(0, NOTE_MAX_FILES_PER_UPLOAD)) form.append("files", file);
        const res = await fetch("/api/notes", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        setNotes(data.notes ?? []);
        setCounts((c) => ({ ...c, [subject]: (data.notes ?? []).length }));
        const rejected: string[] = data.rejected ?? [];
        const overflow = images.length - Math.min(images.length, NOTE_MAX_FILES_PER_UPLOAD);
        const parts = [`${data.added}장 추가됨`];
        if (rejected.length) parts.push(`제외 ${rejected.length}장 — ${rejected.join(" / ")}`);
        if (overflow > 0) parts.push(`${overflow}장은 한 번에 올릴 수 있는 장수를 넘어 제외`);
        setNotice(parts.join(" · "));
      } catch (e) {
        setError(`업로드 실패: ${(e as Error).message}`);
      } finally {
        setIsUploading(false);
      }
    },
    [subject],
  );

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) void upload(files);
    // 같은 파일을 연속으로 다시 고를 수 있게 값 초기화.
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void upload(files);
  };

  // 캡처한 화면을 Ctrl+V로 바로 붙여넣기 (요점정리는 캡처가 많다).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) void upload(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  const removeNote = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/notes?subject=${subject}&id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      const next: NotePhoto[] = data.notes ?? [];
      setNotes(next);
      setCounts((c) => ({ ...c, [subject]: next.length }));
      setViewerIndex((idx) => (idx === null ? null : Math.min(idx, next.length - 1)));
      if (next.length === 0) setViewerIndex(null);
    } catch (e) {
      setError(`삭제 실패: ${(e as Error).message}`);
    }
  };

  /**
   * 새 순서를 화면에 먼저 반영하고 서버에 저장 (낙관적 갱신).
   * 실패하면 서버가 준 최신 목록으로 되돌린다 — 409는 다른 곳에서 목록이 바뀐 경우다.
   */
  const applyOrder = async (next: NotePhoto[]) => {
    const prev = notes;
    setNotes(next);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, order: next.map((p) => p.id) }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setNotes(data.notes ?? prev);
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setNotes(data.notes ?? next);
    } catch (e) {
      setError(`순서 변경 실패: ${(e as Error).message}`);
    }
  };

  /** from 위치의 사진을 빼서 to 위치에 끼워 넣는다 (자리 교환이 아니라 삽입). */
  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    if (from < 0 || to < 0 || from >= notes.length || to >= notes.length) return;
    const next = [...notes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void applyOrder(next);
  };

  /** 회전각 저장 — 화면에 먼저 반영하고 실패 시 되돌린다 (원본 파일은 건드리지 않음). */
  const rotatePhoto = async (id: string, rotation: NoteRotation) => {
    const prev = notes;
    setNotes((list) => list.map((p) => (p.id === id ? { ...p, rotation } : p)));
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, id, rotation }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setNotes(prev);
      setError(`회전 저장 실패: ${(e as Error).message}`);
    }
  };

  const saveMemo = async (id: string, memo: string) => {
    try {
      const res = await fetch("/api/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, id, memo }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotes((list) => list.map((p) => (p.id === id ? { ...p, memo } : p)));
    } catch (e) {
      setError(`설명 저장 실패: ${(e as Error).message}`);
    }
  };

  const total = SUBJECT_KEYS.reduce((s, k) => s + (counts[k] ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* 과목 앨범 선택 */}
      <section className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-blue-900">과목 앨범</h2>
          <span className="text-xs text-slate-400">전체 {total}장</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {SUBJECT_KEYS.map((key) => {
            const active = subject === key;
            const n = counts[key] ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSubject(key)}
                className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  active
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                <span className="block truncate">{SUBJECT_LABEL[key]}</span>
                <span className={`block text-xs mt-0.5 ${active ? "text-blue-500" : "text-slate-400"}`}>
                  {n}장
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 업로드 */}
      <section className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-blue-900 mb-3">
          {SUBJECT_LABEL[subject]} 요점정리 사진 올리기
        </h2>
        <label
          htmlFor="notes-input"
          onDragOver={(e) => {
            // 순서 변경 중인 썸네일이 지나갈 때는 업로드 영역이 반응하지 않게 한다.
            if (dragIndex !== null) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`block w-full cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "border-blue-500 bg-blue-100/60" : "border-blue-200 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50"
          }`}
        >
          <input
            id="notes-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPick}
          />
          <div className="space-y-2 py-4">
            <svg className="mx-auto w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M18 9h.008v.008H18V9zm2.25 9a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v12z"
              />
            </svg>
            <p className="text-sm font-medium text-blue-700">
              {isUploading ? "올리는 중..." : "사진 여러 장을 클릭하거나 끌어놓으세요"}
            </p>
            <p className="text-xs text-slate-500">
              한 번에 최대 {NOTE_MAX_FILES_PER_UPLOAD}장 · PNG · JPG · WEBP · HEIC · Ctrl+V 붙여넣기도 됩니다
            </p>
          </div>
        </label>

        {error && (
          <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>
        )}
        {notice && !error && (
          <p className="mt-3 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">{notice}</p>
        )}
      </section>

      {/* 썸네일 그리드 */}
      <section className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-blue-900">{SUBJECT_LABEL[subject]} · {notes.length}장</h2>
          {notes.length > 0 && (
            <span className="text-xs text-slate-400">
              누르면 크게 보기 · 끌어서 순서 변경 (Ctrl+←/→ 도 가능)
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-slate-400">불러오는 중...</p>
        ) : notes.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            아직 올린 사진이 없습니다. 위에 사진을 올려 {SUBJECT_LABEL[subject]} 요점정리를 모아두세요.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {notes.map((photo, i) => {
              const isDragging = dragIndex === i;
              const isDropTarget = overIndex === i && dragIndex !== null && dragIndex !== i;
              return (
                <div
                  key={photo.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onClick={() => setViewerIndex(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setViewerIndex(i);
                    }
                    // 키보드로도 순서 변경 — Ctrl+←/→ 로 한 칸씩 이동.
                    if (e.ctrlKey && e.key === "ArrowLeft") {
                      e.preventDefault();
                      moveTo(i, i - 1);
                    }
                    if (e.ctrlKey && e.key === "ArrowRight") {
                      e.preventDefault();
                      moveTo(i, i + 1);
                    }
                  }}
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox는 데이터가 없으면 드래그를 시작하지 않는다.
                    e.dataTransfer.setData("text/plain", String(i));
                  }}
                  onDragOver={(e) => {
                    if (dragIndex === null) return; // 파일 드롭은 위쪽 업로드 영역이 처리.
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOverIndex(i);
                  }}
                  onDrop={(e) => {
                    if (dragIndex === null) return;
                    e.preventDefault();
                    e.stopPropagation();
                    moveTo(dragIndex, i);
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className={`group relative aspect-square overflow-hidden rounded-xl border bg-slate-50 cursor-pointer transition-all ${
                    isDragging
                      ? "opacity-40 border-blue-300"
                      : isDropTarget
                        ? "border-blue-500 ring-2 ring-blue-400 scale-[1.02]"
                        : "border-blue-100 hover:border-blue-400"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/notes/image?subject=${subject}&id=${photo.id}`}
                    alt={photo.memo || photo.fileName}
                    loading="lazy"
                    draggable={false} /* 이미지 자체가 끌리면 타일 드래그가 시작되지 않는다 */
                    /* 정사각 타일에 object-cover라 90·270도로 돌려도 빈 곳 없이 채워진다. */
                    style={{ transform: `rotate(${photo.rotation}deg)` }}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/55 text-white text-[11px] font-medium">
                    {i + 1}
                  </span>

                  {/* 한 칸씩 이동 — 드래그가 어려운 환경(터치·좁은 화면)용 */}
                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    {i > 0 && (
                      <button
                        type="button"
                        aria-label="앞으로 이동"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTo(i, i - 1);
                        }}
                        className="w-6 h-6 rounded-md bg-white/90 border border-slate-200 text-slate-600 text-xs leading-none hover:bg-white"
                      >
                        ‹
                      </button>
                    )}
                    {i < notes.length - 1 && (
                      <button
                        type="button"
                        aria-label="뒤로 이동"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTo(i, i + 1);
                        }}
                        className="w-6 h-6 rounded-md bg-white/90 border border-slate-200 text-slate-600 text-xs leading-none hover:bg-white"
                      >
                        ›
                      </button>
                    )}
                  </div>

                  {photo.memo && (
                    <span className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] text-left truncate">
                      {photo.memo}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {viewerIndex !== null && notes[viewerIndex] && (
        <PhotoViewer
          subject={subject}
          photos={notes}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onSaveMemo={saveMemo}
          onRotate={rotatePhoto}
          onDelete={removeNote}
        />
      )}
    </div>
  );
}

const ZOOM_MAX = 8;
const ZOOM_STEP = 1.25;

/** 뷰어 상단 도구 버튼 (회전·확대) — 정사각 아이콘 버튼. */
function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

/**
 * 확대 보기 — 회전(저장됨) · 확대/축소 · 끌어서 이동.
 * 키: ESC 닫기, ←/→ 사진 이동, +/− 확대·축소, 0 화면 맞춤, R 오른쪽 회전.
 */
function PhotoViewer({
  subject,
  photos,
  index,
  onIndexChange,
  onClose,
  onSaveMemo,
  onRotate,
  onDelete,
}: {
  subject: SubjectKey;
  photos: NotePhoto[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onSaveMemo: (id: string, memo: string) => Promise<void>;
  onRotate: (id: string, rotation: NoteRotation) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const photo = photos[index];
  const [memoDraft, setMemoDraft] = useState(photo.memo);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  /** 이미지 원본 픽셀 크기 — 화면 맞춤 배율을 정확히 계산하려면 필요하다. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  /** 화면 맞춤(=1) 기준 배율. 실제 표시 배율은 fitScale × zoom. */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const rotation = photo.rotation;
  const isQuarterTurn = rotation === 90 || rotation === 270;

  // 사진이 바뀌면 편집 중이던 설명·삭제 확인 상태를 새 사진 기준으로 초기화.
  useEffect(() => {
    setMemoDraft(photo.memo);
    setConfirmDelete(false);
  }, [photo.id, photo.memo]);

  // 회전하면 맞춤 배율이 달라지므로 확대·이동만 초기화한다.
  // ★ natural(원본 픽셀 크기)은 회전해도 그대로다. 여기서 지우면 src가 안 바뀌어
  //   onLoad가 다시 뜨지 않아 크기를 영영 모르고, 이미지가 원본 크기로 튀어나온다.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [photo.id, rotation]);

  // 다른 사진으로 넘어갈 때만 원본 크기를 새로 잰다.
  useEffect(() => {
    setNatural(null);
    // 이미 캐시돼 즉시 완료된 이미지는 onLoad가 발생하지 않으므로 여기서 직접 읽는다.
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) {
      setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    }
  }, [photo.id]);

  // 창 크기가 바뀌면 맞춤 배율도 바뀐다 — 표시 영역 크기를 추적.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * 회전을 감안해 표시 영역에 꽉 차게 맞추는 배율.
   * 90·270도에서는 화면상 가로·세로가 뒤바뀌므로 원본 치수를 교환해 계산한다.
   * 작은 사진도 영역을 채우도록 확대를 허용한다 — 요점정리는 크게 보는 게 목적이다.
   */
  const fitScale = useMemo(() => {
    if (!natural || !stage.w || !stage.h) return 1;
    const w = isQuarterTurn ? natural.h : natural.w;
    const h = isQuarterTurn ? natural.w : natural.h;
    return Math.min(stage.w / w, stage.h / h);
  }, [natural, stage, isQuarterTurn]);

  const scale = fitScale * zoom;

  /** 확대된 이미지가 표시 영역을 벗어난 만큼만 이동을 허용 (화면 밖으로 날아가지 않게). */
  const clampPan = useCallback(
    (p: { x: number; y: number }) => {
      if (!natural) return { x: 0, y: 0 };
      const boxW = (isQuarterTurn ? natural.h : natural.w) * scale;
      const boxH = (isQuarterTurn ? natural.w : natural.h) * scale;
      const maxX = Math.max(0, (boxW - stage.w) / 2);
      const maxY = Math.max(0, (boxH - stage.h) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, p.x)),
        y: Math.min(maxY, Math.max(-maxY, p.y)),
      };
    },
    [natural, isQuarterTurn, scale, stage],
  );

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(1, next));
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    setPan((p) => clampPan(p));
  }, [clampPan]);

  // 휠 확대 — React의 onWheel은 passive라 preventDefault가 안 되므로 직접 등록한다.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const next = Math.min(ZOOM_MAX, Math.max(1, e.deltaY < 0 ? z * ZOOM_STEP : z / ZOOM_STEP));
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndexChange(index + 1);
      if (e.key === "+" || e.key === "=") applyZoom(zoom * ZOOM_STEP);
      if (e.key === "-" || e.key === "_") applyZoom(zoom / ZOOM_STEP);
      if (e.key === "0") applyZoom(1);
      if (e.key === "r" || e.key === "R") {
        void onRotate(photo.id, (((rotation + 90) % 360) as NoteRotation));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onIndexChange, applyZoom, zoom, onRotate, photo.id, rotation]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        /* ★ 확정 높이(h-[92vh])가 필요하다 — max-h만 주면 카드 높이가 내용에 따라 정해져
           아래 사진 영역의 flex-1이 나눠 받을 여백이 0이 되고, 사진이 담길 높이가 0으로 무너진다. */
        className="bg-white rounded-2xl overflow-hidden w-full max-w-[92vw] h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-900 truncate">{photo.fileName}</p>
            <p className="text-xs text-slate-400">
              {SUBJECT_LABEL[subject]} · {index + 1} / {photos.length} · {(photo.bytes / 1024).toFixed(0)}KB
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-xl leading-none"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* 회전 · 확대 도구 */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/60">
          <ToolButton
            label="왼쪽으로 90° 회전"
            onClick={() => void onRotate(photo.id, (((rotation + 270) % 360) as NoteRotation))}
          >
            ↺
          </ToolButton>
          <ToolButton
            label="오른쪽으로 90° 회전"
            onClick={() => void onRotate(photo.id, (((rotation + 90) % 360) as NoteRotation))}
          >
            ↻
          </ToolButton>
          <span className="text-xs text-slate-400 w-12">{rotation}°</span>

          <span className="w-px h-5 bg-slate-200 mx-1" />

          <ToolButton label="축소" onClick={() => applyZoom(zoom / ZOOM_STEP)} disabled={zoom <= 1}>
            −
          </ToolButton>
          <span className="text-xs text-slate-500 tabular-nums w-14 text-center">
            {Math.round(scale * 100)}%
          </span>
          <ToolButton label="확대" onClick={() => applyZoom(zoom * ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
            +
          </ToolButton>
          <button
            type="button"
            onClick={() => applyZoom(1)}
            disabled={zoom === 1}
            className="px-2.5 h-8 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            화면 맞춤
          </button>
          <span className="hidden md:inline text-xs text-slate-400 ml-auto">
            휠 확대 · 끌어서 이동 · 더블클릭 확대 · R 회전
          </span>
        </div>

        <div
          ref={stageRef}
          /* 사진은 absolute라 이 영역엔 흐름상 내용이 없다 — 높이는 위 카드의 확정 높이에서
             flex-1로 받아 온다(h-* 를 같이 주면 flex-basis에 밀려 무시된다). */
          className={`relative flex-1 min-h-0 overflow-hidden bg-slate-50 ${
            zoom > 1 ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
          }`}
          onDoubleClick={() => applyZoom(zoom > 1 ? 1 : 2)}
          onPointerDown={(e) => {
            if (zoom <= 1) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
            setIsPanning(true);
          }}
          onPointerMove={(e) => {
            const start = panStart.current;
            if (!start) return;
            setPan(
              clampPan({
                x: start.px + (e.clientX - start.mx),
                y: start.py + (e.clientY - start.my),
              }),
            );
          }}
          onPointerUp={() => {
            panStart.current = null;
            setIsPanning(false);
          }}
          onPointerCancel={() => {
            panStart.current = null;
            setIsPanning(false);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={`/api/notes/image?subject=${subject}&id=${photo.id}`}
            alt={photo.memo || photo.fileName}
            draggable={false}
            onLoad={(e) =>
              setNatural({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            style={{
              // 원본 크기로 두고 transform 하나로 회전·배율·이동을 모두 처리한다
              // (적용 순서는 오른쪽부터 — 회전 → 확대 → 이동 → 가운데 정렬).
              width: natural ? `${natural.w}px` : undefined,
              height: natural ? `${natural.h}px` : undefined,
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transition: isPanning ? "none" : "transform 120ms ease-out",
              // 크기를 재기 전에는 배율을 알 수 없어 원본 픽셀 크기로 잠깐 튀어 보인다 — 그때만 감춘다.
              visibility: natural ? "visible" : "hidden",
            }}
            className="absolute left-1/2 top-1/2 max-w-none select-none"
          />
          {!natural && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              사진 여는 중...
            </p>
          )}
          {index > 0 && (
            <button
              type="button"
              onClick={() => onIndexChange(index - 1)}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 border border-slate-200 shadow-sm text-slate-600 hover:bg-white"
              aria-label="이전 사진"
            >
              ‹
            </button>
          )}
          {index < photos.length - 1 && (
            <button
              type="button"
              onClick={() => onIndexChange(index + 1)}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 border border-slate-200 shadow-sm text-slate-600 hover:bg-white"
              aria-label="다음 사진"
            >
              ›
            </button>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={memoDraft}
            onChange={(e) => setMemoDraft(e.target.value)}
            onBlur={() => memoDraft !== photo.memo && void onSaveMemo(photo.id, memoDraft)}
            placeholder="설명 (예: 테브난 등가 정리 요약)"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
          />
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void onDelete(photo.id)}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium"
              >
                정말 삭제
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 rounded-lg border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50"
            >
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
