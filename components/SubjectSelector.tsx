"use client";

import { SUBJECT_KEYS, SUBJECT_LABEL, type SubjectKey } from "@/types";

type Props = {
  selected: SubjectKey | null;
  onChange: (s: SubjectKey) => void;
};

/** 과목 4종 선택 (전자회로·회로이론·디지털논리회로·복합형, canonical key는 영어, 라벨은 한국어) */
export default function SubjectSelector({ selected, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {SUBJECT_KEYS.map((key) => {
        const active = selected === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors
              ${active
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
              }`}
          >
            {SUBJECT_LABEL[key]}
          </button>
        );
      })}
    </div>
  );
}
