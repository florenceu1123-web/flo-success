import type { FigureVariant } from "@/types";
import { DiagramMissing, PlaceholderFigure } from "./_placeholder";

/** kmap diagramType renderer (1차 stub). */
export function renderKmap(figure: FigureVariant) {
  if (!figure.diagram) return <DiagramMissing figure={figure} />;
  return <PlaceholderFigure figure={figure} />;
}
