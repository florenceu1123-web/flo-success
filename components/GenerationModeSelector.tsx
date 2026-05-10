"use client";

import {
  GENERATION_MODE_LABEL,
  GENERATION_POLICIES,
  type GenerationMode,
} from "@/types";

type Props = {
  selected: GenerationMode;
  onChange: (m: GenerationMode) => void;
};

const MODES: GenerationMode[] = ["exam_similar", "exam_variant"];

/** 두 가지 생성 모드 선택 (기출유사유형 / 기출변형유형) */
export default function GenerationModeSelector({ selected, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {MODES.map((m) => {
        const active = selected === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`text-left py-3 px-4 rounded-lg border transition-colors
              ${active
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 bg-white hover:border-blue-300"
              }`}
          >
            <div className={`text-sm font-semibold ${active ? "text-blue-700" : "text-slate-700"}`}>
              {GENERATION_MODE_LABEL[m]}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 leading-snug">
              {GENERATION_POLICIES[m].description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
