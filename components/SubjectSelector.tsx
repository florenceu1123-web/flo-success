"use client";

import { SUBJECT_KEYS, SUBJECT_LABEL, type SubjectKey } from "@/types";

type Props = {
  selected: SubjectKey | null;
  onChange: (s: SubjectKey) => void;
};

/** 과목 7종 선택 (전자회로·회로이론·디지털논리회로·복합형·전자기학·C언어·통신, canonical key는 영어, 라벨은 한국어) */
export default function SubjectSelector({ selected, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {SUBJECT_KEYS.map((key) => {
        const active = selected === key;
        // 교육학(교직)은 회로 과목과 구분되게 옅은 연두색 버튼으로 표시.
        const isPedagogy = key === "pedagogy";
        const cls = isPedagogy
          ? active
            ? "border-lime-500 bg-lime-200 text-lime-800"
            : "border-lime-200 bg-lime-100 text-lime-700 hover:border-lime-400 hover:bg-lime-200"
          : active
            ? "border-blue-500 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600";
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${cls}`}
          >
            {SUBJECT_LABEL[key]}
          </button>
        );
      })}
    </div>
  );
}
