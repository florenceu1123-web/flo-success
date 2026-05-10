import type { FigureVariant } from "@/types";
import { DiagramMissing, PlaceholderFigure } from "./_placeholder";
import { renderNetlistCircuit } from "./netlist";

/**
 * schematic diagramType renderer.
 * 1차: schematic은 netlist의 superset(positions/wires 포함)이므로 netlist 렌더러로 위임.
 * 향후 positions/wires를 활용한 정확한 도면 렌더로 교체.
 */
export function renderSchematicCircuit(figure: FigureVariant) {
  if (!figure.diagram) return <DiagramMissing figure={figure} />;
  // netlist 부분이 있으면 그대로 그려준다
  const d = figure.diagram as { components?: unknown[] };
  if (Array.isArray(d.components) && d.components.length > 0) {
    return renderNetlistCircuit(figure);
  }
  return <PlaceholderFigure figure={figure} />;
}
