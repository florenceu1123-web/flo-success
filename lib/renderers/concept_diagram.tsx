import type { FigureVariant } from "@/types";
import { DiagramMissing, PlaceholderFigure } from "./_placeholder";

/** concept_diagram diagramType renderer (1차 stub). */
export function renderConceptDiagram(figure: FigureVariant) {
  if (!figure.diagram) return <DiagramMissing figure={figure} />;
  return <PlaceholderFigure figure={figure} />;
}
