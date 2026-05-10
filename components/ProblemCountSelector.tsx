"use client";

type Props = {
  value: number;
  onChange: (n: number) => void;
  options?: number[];
};

const DEFAULT_OPTIONS = [1, 3, 5];

/** 문제 생성 개수 선택 (1·3·5 기본) */
export default function ProblemCountSelector({ value, onChange, options = DEFAULT_OPTIONS }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-500">생성 개수</span>
      <div className="flex gap-1">
        {options.map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`w-9 h-9 rounded-md text-sm font-semibold border transition-colors
                ${active
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
                }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
