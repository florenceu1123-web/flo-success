/**
 * Cross Layout Renderer — CircuitGraph 기반.
 *
 *  파이프라인: netlist → buildCircuitGraph → validateCircuitGraph → render.
 *  outline·skeleton·graph·face가 모두 검증 통과한 후에만 SVG 생성.
 *
 *  렌더링 책임:
 *   - 각 GraphBranch를 시각적 선분 또는 component body로 그림.
 *   - 같은 (from, to) 쌍의 평행 branch는 index로 ±30 offset 분기.
 *   - node 좌표는 buildCircuitGraph가 부여한 (x, y) 그대로 사용.
 */

import type { CircuitComponent, CircuitGraph, CircuitNetlist, GraphBranch, GraphNode } from "@/types";
import { buildCircuitGraph } from "@/lib/graph/buildCircuitGraph";
import { validateCircuitGraph } from "@/lib/graph/validateCircuitGraph";
import { renderComponentOnEdge } from "./netlistEdgeRenderer";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);
const HALF = 28;

/** Cross 패턴 감지 — 평행 가지 + inner vertical leg 동시 존재. */
export function detectCrossPattern(netlist: CircuitNetlist): boolean {
  const groundId = netlist.ground ?? "GND";
  const isGnd = (n: string) => GROUND_LABELS.has(n) || n === groundId;
  const horizontals: CircuitComponent[] = [];
  const verticals: CircuitComponent[] = [];
  for (const c of netlist.components) {
    if ((c.pins?.length ?? 0) < 2) continue;
    const [p1, p2] = c.pins;
    if (isGnd(p1.node) && isGnd(p2.node)) continue;
    if (!isGnd(p1.node) && !isGnd(p2.node)) horizontals.push(c);
    else verticals.push(c);
  }
  const groupCount = new Map<string, number>();
  for (const c of horizontals) {
    const [p1, p2] = c.pins;
    const key = [p1.node, p2.node].sort().join("|");
    groupCount.set(key, (groupCount.get(key) ?? 0) + 1);
  }
  const hasParallel = Array.from(groupCount.values()).some((v) => v >= 2);
  const topNodes = new Set<string>();
  for (const c of horizontals) for (const p of c.pins) topNodes.add(p.node);
  for (const c of verticals) for (const p of c.pins) if (!isGnd(p.node)) topNodes.add(p.node);
  const sorted = Array.from(topNodes).sort();
  const leftmost = sorted[0];
  const rightmost = sorted[sorted.length - 1];
  const hasInner = verticals.some((c) => {
    const top = c.pins.find((p) => !isGnd(p.node));
    return top && top.node !== leftmost && top.node !== rightmost;
  });
  return hasParallel && hasInner;
}

/**
 * 메인 — netlist를 받아 CircuitGraph 구축 → 검증 → SVG.
 */
export function renderCrossLayout(netlist: CircuitNetlist): string {
  const graph = buildCircuitGraph(netlist);
  try {
    validateCircuitGraph(graph);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `<pre>CircuitGraph validation 실패: ${escapeXml(msg)}</pre>`;
  }
  return renderFromGraph(graph, netlist);
}

function renderFromGraph(graph: CircuitGraph, netlist: CircuitNetlist): string {
  const compById = new Map(netlist.components.map((c) => [c.id, c] as const));
  const nodeById = new Map<string, GraphNode>();
  for (const n of graph.nodes) nodeById.set(n.id, n);

  const parts: string[] = [];

  // 같은 (from,to) 쌍 branches 그룹핑 — 평행 가지.
  const branchGroups = new Map<string, GraphBranch[]>();
  for (const b of graph.branches) {
    const key = [b.from, b.to].sort().join("|");
    if (!branchGroups.has(key)) branchGroups.set(key, []);
    branchGroups.get(key)!.push(b);
  }

  // Layer 1 — 모든 wire branch 먼저 그림 (배경 wire 깔기).
  for (const b of graph.branches) {
    if (b.element !== "wire") continue;
    const from = nodeById.get(b.from)!;
    const to = nodeById.get(b.to)!;
    parts.push(line(from.x, from.y, to.x, to.y));
  }

  // Layer 2 — component branches. 평행 가지면 index 기반 ±30 offset.
  for (const [, group] of branchGroups) {
    const compBranches = group.filter((b) => b.element !== "wire");
    if (compBranches.length === 0) continue;
    const isParallel = compBranches.length >= 2;
    const N = compBranches.length;

    compBranches.forEach((b, i) => {
      const comp = b.componentId ? compById.get(b.componentId) : undefined;
      const from = nodeById.get(b.from)!;
      const to = nodeById.get(b.to)!;
      const isHoriz = b.orientation === "horizontal";

      // offset 계산 — 평행 가지면 index 기반 대칭 stack.
      let dxOffset = 0;
      let dyOffset = 0;
      if (isParallel) {
        const offset = (i - (N - 1) / 2) * 30;
        if (isHoriz) dyOffset = offset;
        else dxOffset = offset;
      }

      const x1 = from.x + dxOffset;
      const y1 = from.y + dyOffset;
      const x2 = to.x + dxOffset;
      const y2 = to.y + dyOffset;

      // 평행 stub (offset이 있으면 wire 본선에 연결)
      if (Math.abs(dxOffset) + Math.abs(dyOffset) > 0.5) {
        parts.push(line(from.x, from.y, x1, y1));
        parts.push(line(to.x, to.y, x2, y2));
      }

      // wire 본선에서 component 위치를 비워야 깔끔 — 작은 white rect으로 가림.
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      parts.push(`<rect x="${cx - HALF - 2}" y="${cy - HALF}" width="${(HALF + 2) * 2}" height="${HALF * 2}" fill="white"/>`);
      // wire from-cy/cx-half ~ cy/cx+half-to
      if (isHoriz) {
        parts.push(line(x1, y1, cx - HALF, cy));
        parts.push(line(cx + HALF, cy, x2, y2));
      } else {
        parts.push(line(x1, y1, cx, cy - HALF));
        parts.push(line(cx, cy + HALF, x2, y2));
      }

      // component body
      if (comp) {
        parts.push(renderComponentOnEdge(comp, { x: cx, y: cy }, isHoriz ? "horizontal" : "vertical"));
      }
    });
  }

  // Layer 3 — junction dots: degree ≥ 3 노드.
  const degree = new Map<string, number>();
  for (const b of graph.branches) {
    degree.set(b.from, (degree.get(b.from) ?? 0) + 1);
    degree.set(b.to, (degree.get(b.to) ?? 0) + 1);
  }
  for (const n of graph.nodes) {
    if ((degree.get(n.id) ?? 0) >= 3 && n.kind !== "ground") {
      parts.push(dot(n.x, n.y));
    }
  }

  // Layer 4 — ground symbol: 가운데 bottom 위치.
  const grounds = graph.nodes.filter((n) => n.kind === "ground");
  if (grounds.length > 0) {
    const xs = grounds.map((n) => n.x);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    parts.push(groundSymbol(cx, grounds[0].y));
  }

  // SVG viewBox
  const allXs = graph.nodes.map((n) => n.x);
  const allYs = graph.nodes.map((n) => n.y);
  const svgW = Math.max(...allXs) + 100;
  const svgH = Math.max(...allYs) + 60;

  // face 수 코멘트 (디버그)
  const meshCount = graph.faces.filter((f) => f.role === "mesh").length;
  parts.unshift(`<!-- CircuitGraph: nodes=${graph.nodes.length} branches=${graph.branches.length} mesh_faces=${meshCount} -->`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n${parts.join("\n")}\n</svg>`;
}

// ─── helpers ───────────────────────────────────
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="black" fill="none" stroke-width="2"/>`;
}

function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.5" fill="black"/>`;
}

function groundSymbol(cx: number, y: number): string {
  return `<g transform="translate(${cx},${y})">
    <line x1="0" y1="0" x2="0" y2="10" stroke="black" stroke-width="2"/>
    <line x1="-10" y1="10" x2="10" y2="10" stroke="black" stroke-width="2.4"/>
    <line x1="-7" y1="14" x2="7" y2="14" stroke="black" stroke-width="2"/>
    <line x1="-3" y1="18" x2="3" y2="18" stroke="black" stroke-width="2"/>
  </g>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
