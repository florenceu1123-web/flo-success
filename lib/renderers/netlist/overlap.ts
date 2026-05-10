import type { RenderNode } from "./layout";

/** spec 4 — bounding box (여백 포함). */
export type Box = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const PADDING = 20;

export function getComponentBox(n: RenderNode): Box {
  return {
    id: n.component.id,
    x1: n.x - PADDING,
    y1: n.y - PADDING,
    x2: n.x + n.width + PADDING,
    y2: n.y + n.height + PADDING,
  };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

export function hasOverlap(nodes: RenderNode[]): boolean {
  const boxes = nodes.map(getComponentBox);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j])) return true;
    }
  }
  return false;
}
