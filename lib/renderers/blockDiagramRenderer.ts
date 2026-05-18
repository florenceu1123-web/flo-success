import type { BlockDiagram } from "@/types";

/**
 * 블록도 (signal flow graph) renderer.
 *
 * 좌표 규약:
 *  - 좌측(input) → 우측(output) 가로 흐름
 *  - block: 사각형 박스 + 라벨 (α, β, A(s))
 *  - junction (⊕): 작은 원 + "+" 표기 (부호 표시는 진입 edge의 sign으로)
 *  - node: input/output은 라벨 텍스트 + 외부 단자 dot
 *  - edge: 화살표 wire (V-H-V). routeHint=below면 박스 아래 채널로 우회 (피드백)
 *
 * node/block에 (x, y) 좌표가 없으면 자동 layout (input→junction→block→output 순서로 가로 배치).
 */

type Pt = { x: number; y: number };

const PAD = 60;
const BLOCK_W = 70;
const BLOCK_H = 40;
const JUNCTION_R = 12;

export function renderBlockDiagramSVG(diagram: BlockDiagram): string {
  // 좌표 결정 — 명시 좌표 없으면 nodes/blocks 등장 순서대로 가로 배치
  const positions = new Map<string, Pt>();
  let cursorX = PAD;
  const baseY = 100;

  const items: Array<{ id: string; kind: "node" | "block"; w: number; h: number; explicit: boolean; entry: BlockDiagram["nodes"][number] | BlockDiagram["blocks"][number] }> = [];
  for (const n of diagram.nodes) {
    items.push({
      id: n.id,
      kind: "node",
      w: n.kind === "junction" ? JUNCTION_R * 2 : 24,
      h: n.kind === "junction" ? JUNCTION_R * 2 : 24,
      explicit: typeof n.x === "number",
      entry: n,
    });
  }
  for (const b of diagram.blocks) {
    items.push({
      id: b.id,
      kind: "block",
      w: b.width ?? BLOCK_W,
      h: b.height ?? BLOCK_H,
      explicit: typeof b.x === "number",
      entry: b,
    });
  }
  for (const it of items) {
    if (typeof it.entry.x === "number" && typeof it.entry.y === "number") {
      positions.set(it.id, { x: it.entry.x, y: it.entry.y });
    } else {
      positions.set(it.id, { x: cursorX + it.w / 2, y: baseY });
      cursorX += it.w + 60;
    }
  }

  // viewBox 계산
  const xs = [...positions.values()].map((p) => p.x);
  const ys = [...positions.values()].map((p) => p.y);
  const minX = Math.min(...xs) - 80;
  const maxX = Math.max(...xs) + 80;
  const minY = Math.min(...ys) - 80;
  const maxY = Math.max(...ys) + 120;
  const w = maxX - minX;
  const h = maxY - minY;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">`;

  // arrow marker
  svg += `<defs><marker id="bd_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;

  // edges
  for (const e of diagram.edges) {
    const a = positions.get(e.from);
    const b = positions.get(e.to);
    if (!a || !b) continue;
    const path = routeEdge(a, b, e.routeHint ?? "direct", maxY);
    svg += `<path d="${path}" stroke="black" fill="none" stroke-width="1.8" marker-end="url(#bd_arrow)"/>`;
    // sign (+/-) — junction 진입 직전에 표기
    if (e.sign === "-") {
      const target = diagram.nodes.find((n) => n.id === e.to);
      if (target?.kind === "junction") {
        const sx = (a.x + b.x) / 2;
        const sy = (a.y + b.y) / 2 - 10;
        svg += `<text x="${sx}" y="${sy}" font-size="14" font-weight="700" fill="#dc2626">−</text>`;
      }
    }
  }

  // blocks
  for (const b of diagram.blocks) {
    const p = positions.get(b.id);
    if (!p) continue;
    const bw = b.width ?? BLOCK_W;
    const bh = b.height ?? BLOCK_H;
    if (b.shape === "triangle") {
      // OPAMP 심볼 — 우측을 향한 삼각형 (좌측 변이 입력, 우측 꼭짓점이 출력)
      const left = p.x - bw / 2;
      const right = p.x + bw / 2;
      const top = p.y - bh / 2;
      const bottom = p.y + bh / 2;
      svg += `<path d="M ${left} ${top} L ${right} ${p.y} L ${left} ${bottom} Z" fill="white" stroke="black" stroke-width="2"/>`;
      // 라벨은 삼각형 중앙 좌측 (꼭짓점에 가깝지 않게)
      svg += `<text x="${left + bw * 0.32}" y="${p.y + 5}" text-anchor="middle" font-size="14" font-weight="600">${escapeSvg(b.label)}</text>`;
    } else {
      svg += `<rect x="${p.x - bw / 2}" y="${p.y - bh / 2}" width="${bw}" height="${bh}" fill="white" stroke="black" stroke-width="2"/>`;
      svg += `<text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-size="14" font-weight="600">${escapeSvg(b.label)}</text>`;
    }
  }

  // nodes
  for (const n of diagram.nodes) {
    const p = positions.get(n.id);
    if (!p) continue;
    if (n.kind === "junction") {
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${JUNCTION_R}" fill="white" stroke="black" stroke-width="2"/>`;
      svg += `<text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-size="14" font-weight="700">+</text>`;
    } else if (n.kind === "input") {
      svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="black"/>`;
      if (n.label) svg += `<text x="${p.x - 8}" y="${p.y + 5}" text-anchor="end" font-size="13" font-weight="600">${escapeSvg(n.label)}</text>`;
    } else {
      // output
      svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="black"/>`;
      if (n.label) svg += `<text x="${p.x + 8}" y="${p.y + 5}" font-size="13" font-weight="600">${escapeSvg(n.label)}</text>`;
    }
  }

  svg += `</svg>`;
  return svg;
}

function routeEdge(a: Pt, b: Pt, hint: "above" | "below" | "direct", maxY: number): string {
  if (hint === "direct") {
    // 같은 y면 직선, 아니면 V-H-V (대각선 방지)
    if (Math.abs(a.y - b.y) < 1) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    const midX = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`;
  }
  // above/below — 채널로 우회 (피드백 wire)
  const channelY = hint === "below" ? maxY - 40 : 30;
  return `M ${a.x} ${a.y} L ${a.x} ${channelY} L ${b.x} ${channelY} L ${b.x} ${b.y}`;
}

function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
