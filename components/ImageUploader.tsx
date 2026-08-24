"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import SubjectNotes from "@/components/SubjectNotes";
import {
  NOTE_SOURCE_ALBUM_KEY,
  noteAlbumLabel,
  notePhotoTitle,
  type NoteAlbumKey,
  type NotePhoto,
} from "@/types/notes";

type Props = {
  uploadedImage: string | null;
  fileName: string;
  onUpload: (base64: string, fileName: string) => void;
};

const ALBUM_LABEL = noteAlbumLabel(NOTE_SOURCE_ALBUM_KEY);

/**
 * 문제 이미지 업로드 — **업로드 창을 누르면 전공스샷 사진첩에서 바로 고를 수 있다**.
 *  · 창 클릭 → 사진첩 고르기 창(제목 검색 + 썸네일)
 *  · 그 안의 "내 컴퓨터에서 파일 선택" 또는 **파일을 창에 끌어놓기** → 기존 업로드 그대로
 * 어느 쪽이든 부모에는 동일하게 `(base64, fileName)`을 넘긴다.
 */
export default function ImageUploader({ uploadedImage, fileName, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      onUpload(base64, file.name);
    };
    reader.readAsDataURL(file);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // 같은 파일을 연속으로 다시 고를 수 있게 값 초기화.
    e.target.value = "";
    setPickerOpen(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPickerOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setPickerOpen(true);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="block w-full cursor-pointer rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50 transition-colors p-6 text-center"
      >
        <input ref={inputRef} id="image-input" type="file" accept="image/*" className="hidden" onChange={onChange} />
        {uploadedImage ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/*;base64,${uploadedImage}`}
              alt={fileName}
              className="mx-auto max-h-56 rounded-lg border border-blue-100"
            />
            <p className="text-xs text-blue-600 truncate">{fileName}</p>
            <p className="text-xs text-slate-500">다른 이미지로 교체하려면 클릭 ({ALBUM_LABEL}에서 고르기)</p>
          </div>
        ) : (
          <div className="space-y-2 py-6">
            <svg className="mx-auto w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm font-medium text-blue-700">클릭해서 {ALBUM_LABEL} 사진첩에서 고르기</p>
            <p className="text-xs text-slate-500">파일을 여기로 끌어놓아도 됩니다 · PNG · JPG · JPEG</p>
          </div>
        )}
      </div>

      {pickerOpen && (
        <AlbumPicker
          onClose={() => setPickerOpen(false)}
          onPicked={(base64, name) => {
            setPickerOpen(false);
            onUpload(base64, name);
          }}
        />
      )}
    </>
  );
}

/**
 * 사진첩에서 한 장 고르는 창.
 *
 * ★ 그리드를 따로 만들지 않는다 — **요점정리 사진첩(SubjectNotes)을 고르기 모드로 그대로 띄운다.**
 *   따로 만들었더니 (a) 화면이 사진첩과 미묘하게 달랐고 (b) 스크롤·열 개수 같은 걸 두 번 손봐야 했다.
 *   이제 사진첩이 바뀌면 이 창도 자동으로 같이 바뀐다(업로드·제목 칸·정렬 전부 포함).
 * ★ 스크롤 컨테이너는 **인라인 스타일**로 준다 — Tailwind가 이 파일의 새 유틸리티를
 *   못 만들어 낸 적이 있어(실측: overflow-y-auto 누락 → 아래쪽 사진을 고를 수 없었다) 의존하지 않는다.
 */
function AlbumPicker({
  onClose,
  onPicked,
}: {
  onClose: () => void;
  onPicked: (base64: string, fileName: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * 고른 사진을 base64로 바꾼다.
   * ★ 사진첩의 회전각은 **표시용**이라 원본 파일은 돌아가 있지 않다. 그대로 보내면 Vision이
   *   누워 있는 회로를 분석하므로 여기서 캔버스로 회전을 구워 넣는다.
   */
  const select = useCallback(
    // ★ album은 사진첩이 넘겨준다 — 제목 검색으로 **다른 앨범**의 사진을 고를 수 있어
    //   전공스샷으로 고정하면 그 사진의 이미지 조회가 404가 난다.
    async (photo: NotePhoto, album: NoteAlbumKey = NOTE_SOURCE_ALBUM_KEY) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/notes/image?subject=${album}&id=${photo.id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const rotation = (((photo.rotation ?? 0) % 360) + 360) % 360;
        const name = `${notePhotoTitle(photo)}.png`;
        if (rotation === 0) {
          const dataUrl: string = await new Promise((ok, ng) => {
            const reader = new FileReader();
            reader.onload = () => ok(String(reader.result));
            reader.onerror = () => ng(new Error("이미지를 읽지 못했습니다."));
            reader.readAsDataURL(blob);
          });
          onPicked(dataUrl.split(",")[1] ?? "", photo.fileName || name);
          return;
        }
        const bitmap = await createImageBitmap(blob);
        const swap = rotation === 90 || rotation === 270;
        const canvas = document.createElement("canvas");
        canvas.width = swap ? bitmap.height : bitmap.width;
        canvas.height = swap ? bitmap.width : bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("캔버스를 만들 수 없습니다.");
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        bitmap.close();
        onPicked(canvas.toDataURL("image/png").split(",")[1] ?? "", photo.fileName || name);
      } catch (e) {
        setError(`사진을 불러오지 못했습니다: ${(e as Error).message}`);
        setBusy(false);
      }
    },
    [onPicked],
  );

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${ALBUM_LABEL}에서 사진 고르기`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[92vw] h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-900">{ALBUM_LABEL}에서 고르기</p>
            <p className="text-xs text-slate-400">
              {busy
                ? "사진을 불러오는 중..."
                : "사진을 누르면 그대로 업로드됩니다 · 새로 올리거나 「사진 선택 삭제」로 지울 수도 있습니다"}
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

        {error && (
          <p className="mx-4 mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* ★ 스크롤은 인라인 스타일로 — 위 주석 참고 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1rem" }}>
          {/* ★ lockAlbum — 이 창은 전공스샷 앨범만 보여준다(앨범 줄 감춤 + 검색도 이 앨범 안에서만). */}
          <SubjectNotes
            pickMode
            initialAlbum={NOTE_SOURCE_ALBUM_KEY}
            lockAlbum
            onSelectPhoto={(p, album) => void select(p, album)}
          />
        </div>
      </div>
    </div>
  );
}
