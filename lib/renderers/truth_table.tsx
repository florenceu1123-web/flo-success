import type { FigureVariant, TruthTableDiagram } from "@/types";
import { DiagramMissing, FigureHeader, PlaceholderFigure } from "./_placeholder";

/**
 * truth_table diagramType renderer.
 * 권장 shape({variables, rows})면 표 렌더, 비어있으면 DiagramMissing, 그 외 PlaceholderFigure.
 */
export function renderTruthTable(figure: FigureVariant) {
  if (!figure.diagram) return <DiagramMissing figure={figure} />;
  const d = figure.diagram as Partial<TruthTableDiagram>;
  if (!Array.isArray(d.variables) || !Array.isArray(d.rows)) {
    return <PlaceholderFigure figure={figure} />;
  }
  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3 overflow-x-auto space-y-2">
      <FigureHeader figure={figure} />
      <table className="text-xs border-collapse">
        <thead>
          <tr className="border-b border-blue-100">
            {d.variables.map((v) => (
              <th key={v} className="px-2 py-1 text-blue-700 font-medium">{v}</th>
            ))}
            <th className="px-2 py-1 text-blue-700 font-medium border-l border-blue-100">F</th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-50">
              {r.inputs.map((b, j) => (
                <td key={j} className="px-2 py-1 text-center text-slate-700">{b}</td>
              ))}
              <td className="px-2 py-1 text-center text-slate-900 font-medium border-l border-blue-100">
                {String(r.output)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
