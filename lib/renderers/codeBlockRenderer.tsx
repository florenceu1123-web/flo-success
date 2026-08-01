import type { CodeBlockDiagram, FigureVariant } from "@/types";
import { DiagramMissing, FigureHeader, PlaceholderFigure } from "./_placeholder";

/**
 * C언어 코드 스니펫 렌더러 — monospace <pre> 블록 (줄번호 포함).
 *
 * 회로 렌더러들과 달리 SVG가 아니라 React node를 직접 반환한다(코드는 텍스트가 자연스럽고
 * 폭이 가변적이라 SVG 좌표 배치가 불리). truth_table·waveform과 동일한 패턴.
 */
export function renderCodeBlock(figure: FigureVariant) {
  if (!figure.diagram) return <DiagramMissing figure={figure} />;
  const d = figure.diagram as CodeBlockDiagram;
  const code = typeof d?.code === "string" ? d.code : "";
  if (!code.trim()) return <PlaceholderFigure figure={figure} />;

  const lines = code.replace(/\n$/, "").split("\n");
  const lang = d.language || "c";

  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3 space-y-2">
      <FigureHeader figure={figure} />
      {d.caption ? (
        <div className="text-xs font-medium text-slate-500">{d.caption}</div>
      ) : null}
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {lang}
          </span>
        </div>
        <pre className="m-0 p-0 text-[13px] leading-relaxed">
          <code>
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="select-none w-8 shrink-0 pr-2 text-right text-slate-300 tabular-nums">
                  {i + 1}
                </span>
                <span className="whitespace-pre px-3 text-slate-800 font-mono">
                  {line || " "}
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
