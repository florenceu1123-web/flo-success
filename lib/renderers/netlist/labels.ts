import type { RenderNode } from "./layout";

/** spec 6 — SVG-safe text escape. */
export function escapeSvg(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** 컴포넌트 박스의 위/아래 라벨 좌표 */
export function labelPosition(node: RenderNode, place: "below" | "above" = "below"): { x: number; y: number } {
  return {
    x: node.x + node.width / 2,
    y: place === "below" ? node.y + node.height + 24 : node.y - 12,
  };
}

export function renderLabel(text: string, x: number, y: number): string {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-size="12" dominant-baseline="middle">${escapeSvg(text)}</text>`;
}
