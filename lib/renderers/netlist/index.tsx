import type { CircuitNetlist, FigureVariant } from "@/types";
import { DiagramMissing, FigureHeader } from "../_placeholder";
import { renderNetlistEdgeSVG } from "../netlistEdgeRenderer";

/**
 * netlist diagramType의 React 래퍼.
 * 실제 SVG 생성은 lib/renderers/netlistEdgeRenderer.ts (edge 기반: wire ─ symbol ─ wire).
 */
export function renderNetlistCircuit(figure: FigureVariant) {
  if (!figure.diagram) return <DiagramMissing figure={figure} />;
  const svg = renderNetlistEdgeSVG(figure.diagram as CircuitNetlist);
  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3 space-y-2">
      <FigureHeader figure={figure} />
      <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
