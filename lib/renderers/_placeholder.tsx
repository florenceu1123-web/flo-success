import type { ReactNode } from "react";
import type { FigureVariant } from "@/types";

/** figure 헤더 (label + role + diagramType 칩) */
export function FigureHeader({ figure }: { figure: FigureVariant }) {
  return (
    <div className="text-[11px] text-blue-600 mb-1.5 flex items-center gap-2 flex-wrap">
      <span className="font-semibold">{figure.label || figure.role}</span>
      <span className="px-1.5 py-0.5 rounded bg-white border border-blue-200 font-mono text-blue-700">
        {figure.diagramType}
      </span>
      {figure.role && figure.role !== figure.label && (
        <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-700">
          {figure.role}
        </span>
      )}
    </div>
  );
}

/** diagram 데이터가 비어있을 때 표시 */
export function DiagramMissing({ figure }: { figure: FigureVariant }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <FigureHeader figure={figure} />
      <p className="text-xs text-amber-700">diagram missing</p>
    </div>
  );
}

/** 아직 type별 실구현이 없는 diagramType용 — diagram은 있으나 시각화 미지원 */
export function PlaceholderFigure({ figure, children }: { figure: FigureVariant; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3">
      <FigureHeader figure={figure} />
      {children ?? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 320 64"
          className="w-full h-auto rounded bg-blue-50/40 border border-blue-100"
        >
          <text x="160" y="38" textAnchor="middle" fontFamily="sans-serif" fontSize="13" fill="#1e3a8a">
            {figure.diagramType}
          </text>
        </svg>
      )}
    </div>
  );
}
