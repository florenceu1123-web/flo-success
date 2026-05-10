"use client";

import { useRef, type ChangeEvent, type DragEvent } from "react";

type Props = {
  uploadedImage: string | null;
  fileName: string;
  onUpload: (base64: string, fileName: string) => void;
};

/** 문제 이미지 업로드 — 파일 선택 또는 drag & drop. base64를 부모에 전달. */
export default function ImageUploader({ uploadedImage, fileName, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

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
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <label
      htmlFor="image-input"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="block w-full cursor-pointer rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50 transition-colors p-6 text-center"
    >
      <input
        ref={inputRef}
        id="image-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onChange}
      />
      {uploadedImage ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/*;base64,${uploadedImage}`}
            alt={fileName}
            className="mx-auto max-h-56 rounded-lg border border-blue-100"
          />
          <p className="text-xs text-blue-600 truncate">{fileName}</p>
          <p className="text-xs text-slate-500">다른 이미지로 교체하려면 클릭</p>
        </div>
      ) : (
        <div className="space-y-2 py-6">
          <svg
            className="mx-auto w-10 h-10 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          <p className="text-sm font-medium text-blue-700">이미지를 클릭하거나 끌어놓으세요</p>
          <p className="text-xs text-slate-500">PNG · JPG · JPEG</p>
        </div>
      )}
    </label>
  );
}
