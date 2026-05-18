import type { FigureVariant, TruthTableDiagram } from "@/types";
import { DiagramMissing, FigureHeader, PlaceholderFigure } from "./_placeholder";

/**
 * truth_table diagramType renderer.
 *
 * 단일 출력 (legacy):
 *   { variables, outputLabel, rows: [{ inputs, output }] }
 * 다중 출력 (상태표 등):
 *   { variables, outputLabels, rows: [{ inputs, outputs }] }
 *
 * inputGroups/outputGroups가 있으면 컬럼들을 의미 그룹 헤더로 묶어 표시.
 * 셀 값이 string이면 그대로 표시 (빈칸 ㄱ/ㄴ/ㄷ 처리).
 */
export function renderTruthTable(figure: FigureVariant) {
  if (!figure.diagram) return <DiagramMissing figure={figure} />;
  const d = figure.diagram as Partial<TruthTableDiagram>;
  if (!Array.isArray(d.variables) || !Array.isArray(d.rows)) {
    return <PlaceholderFigure figure={figure} />;
  }

  const outputLabels: string[] =
    d.outputLabels && d.outputLabels.length > 0
      ? d.outputLabels
      : [d.outputLabel ?? "F"];
  const inputCount = d.variables.length;
  const outputCount = outputLabels.length;
  const hasGroupHeader = Boolean(d.inputGroups?.length || d.outputGroups?.length);

  const renderGroupHeader = () => {
    if (!hasGroupHeader) return null;
    const cells: React.ReactNode[] = [];
    const inputGroups = d.inputGroups ?? [{ label: "", span: inputCount }];
    const outputGroups = d.outputGroups ?? [{ label: "", span: outputCount }];
    inputGroups.forEach((g, idx) => {
      cells.push(
        <th
          key={`ig${idx}`}
          colSpan={g.span}
          className={`px-2 py-1 text-blue-700 font-medium text-center ${idx > 0 ? "border-l border-blue-100" : ""}`}
        >
          {g.label}
        </th>,
      );
    });
    outputGroups.forEach((g, idx) => {
      cells.push(
        <th
          key={`og${idx}`}
          colSpan={g.span}
          className="px-2 py-1 text-blue-700 font-medium text-center border-l border-blue-100"
        >
          {g.label}
        </th>,
      );
    });
    return <tr className="border-b border-blue-100">{cells}</tr>;
  };

  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3 overflow-x-auto space-y-2">
      <FigureHeader figure={figure} />
      <table className="text-xs border-collapse">
        <thead>
          {renderGroupHeader()}
          <tr className="border-b border-blue-100">
            {d.variables.map((v, j) => (
              <th
                key={`v${j}`}
                className={`px-2 py-1 text-blue-700 font-medium ${j > 0 && isGroupBoundary(j, d.inputGroups) ? "border-l border-blue-100" : ""}`}
              >
                {v}
              </th>
            ))}
            {outputLabels.map((label, j) => (
              <th
                key={`o${j}`}
                className={`px-2 py-1 text-blue-700 font-medium ${j === 0 || isGroupBoundary(j, d.outputGroups) ? "border-l border-blue-100" : ""}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-50">
              {r.inputs.map((cell, j) => (
                <td
                  key={`i${j}`}
                  className={`px-2 py-1 text-center text-slate-700 ${j > 0 && isGroupBoundary(j, d.inputGroups) ? "border-l border-blue-100" : ""}`}
                >
                  {renderCell(cell)}
                </td>
              ))}
              {getRowOutputs(r, outputCount).map((cell, j) => (
                <td
                  key={`o${j}`}
                  className={`px-2 py-1 text-center text-slate-900 font-medium ${j === 0 || isGroupBoundary(j, d.outputGroups) ? "border-l border-blue-100" : ""}`}
                >
                  {renderCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** group span 누적이 j와 일치하면 group 경계 */
function isGroupBoundary(j: number, groups?: Array<{ label: string; span: number }>): boolean {
  if (!groups || groups.length === 0) return false;
  let acc = 0;
  for (const g of groups) {
    acc += g.span;
    if (acc === j) return true;
  }
  return false;
}

function getRowOutputs(
  r: TruthTableDiagram["rows"][number],
  outputCount: number,
): Array<number | string> {
  if (Array.isArray(r.outputs)) return r.outputs;
  if (r.output !== undefined) return [r.output];
  return Array<number | string>(outputCount).fill("");
}

/** 빈칸/symbol cell은 작은 박스 + 글자. 아니면 그대로 표시. */
function renderCell(value: number | string | undefined): React.ReactNode {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string" && isBlankSymbol(value)) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 border border-slate-400 rounded font-semibold text-slate-800">
        {value}
      </span>
    );
  }
  return String(value);
}

const BLANK_SYMBOL_CHARS = new Set([
  "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ",
  "ⓐ", "ⓑ", "ⓒ", "ⓓ", "ⓔ", "ⓕ",
  "㉠", "㉡", "㉢", "㉣", "㉤", "㉥", "㉦", "㉧", "㉨",
]);
function isBlankSymbol(s: string): boolean {
  const t = s.trim();
  return t.length === 1 && BLANK_SYMBOL_CHARS.has(t);
}
