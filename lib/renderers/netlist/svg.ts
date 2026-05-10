import type { CircuitNetlist } from "@/types";
import { validateNetlistRenderable } from "./validate";
import { buildPinGraph, type Point } from "./graph";
import { type RenderNode } from "./layout";
import { routeNets } from "./routing";
import { renderComponentSymbol } from "./symbols";
import { classifyCircuitPattern, type CircuitPattern } from "./pattern";
import {
  layoutSafeGrid,
  layoutSeriesChain,
  layoutLadderNetwork,
  layoutSourceResistorNetwork,
} from "./strategies";
import { hasOverlap } from "./overlap";
import { escapeSvg } from "./labels";

type LayoutFn = (netlist: CircuitNetlist, scale: number) => RenderNode[];

const SCALES = [1, 1.25, 1.5, 2];
const FINAL_SCALE = 2.5;

/**
 * spec 5 — pattern-별 layout 시도, overlap이 있으면 spacing 늘려 재시도, 끝까지 실패하면 grid fallback.
 */
function layoutWithRetry(netlist: CircuitNetlist, layoutFn: LayoutFn): RenderNode[] {
  for (const scale of SCALES) {
    const nodes = layoutFn(netlist, scale);
    if (!hasOverlap(nodes)) return nodes;
  }
  // 마지막 시도 (큰 spacing). 그래도 overlap이면 grid fallback.
  const finalAttempt = layoutFn(netlist, FINAL_SCALE);
  if (!hasOverlap(finalAttempt)) return finalAttempt;
  return layoutSafeGrid(netlist, FINAL_SCALE);
}

function pickLayoutFn(pattern: CircuitPattern): LayoutFn {
  switch (pattern) {
    case "series_chain":              return layoutSeriesChain;
    case "ladder_network":            return layoutLadderNetwork;
    case "parallel_branches":         return layoutLadderNetwork;
    case "source_resistor_network":   return layoutSourceResistorNetwork;
    case "unknown":                   return layoutSafeGrid;
  }
}

/**
 * spec 2·5·8 — 메인 dispatch + retry + grid fallback.
 *  1) validate (실패 시 에러 SVG)
 *  2) classify pattern
 *  3) layoutWithRetry (overlap 시 scale 증가)
 *  4) graph + route + symbols → SVG
 */
export function renderNetlistSVG(netlist: CircuitNetlist): string {
  return renderCircuitSVG(netlist);
}

export function renderCircuitSVG(netlist: CircuitNetlist): string {
  const validation = validateNetlistRenderable(netlist);
  if (!validation.ok) return renderValidationErrors(validation.errors);

  const pattern = classifyCircuitPattern(netlist);
  const layoutFn = pickLayoutFn(pattern);
  const renderNodes = layoutWithRetry(netlist, layoutFn);

  const graph = buildPinGraph(netlist);
  const { wires, dots } = routeNets(graph.nets, renderNodes);

  // bounding box (여백 포함) 계산
  const xs = renderNodes.flatMap((n) => [n.x, n.x + n.width]);
  const ys = renderNodes.flatMap((n) => [n.y, n.y + n.height]);
  const wireXs = wires.flatMap((w) => w.points.map((p) => p.x));
  const wireYs = wires.flatMap((w) => w.points.map((p) => p.y));
  const minX = Math.min(0, ...xs, ...wireXs) - 30;
  const maxX = Math.max(...xs, ...wireXs) + 30;
  const minY = Math.min(0, ...ys, ...wireYs) - 30;
  const maxY = Math.max(...ys, ...wireYs) + 50;
  const w = Math.max(maxX - minX, 240);
  const h = Math.max(maxY - minY, 140);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">`;

  // pattern 표시 (디버깅용 작은 텍스트, 좌상단)
  svg += `<text x="${minX + 8}" y="${minY + 14}" font-size="9" fill="#94a3b8">${escapeSvg(pattern)}</text>`;

  for (const wire of wires) svg += renderWire(wire.points);
  for (const dot of dots) svg += `<circle cx="${dot.point.x}" cy="${dot.point.y}" r="3.5" fill="black"/>`;
  for (const node of renderNodes) svg += renderComponentSymbol(node);

  svg += `</svg>`;
  return svg;
}

function renderValidationErrors(errors: string[]): string {
  const lines = errors.map((e) => `  • ${escapeSvg(e)}`).join("\n");
  return `<pre style="background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;padding:8px;border-radius:6px;font-size:11px;white-space:pre-wrap">${lines}</pre>`;
}

function renderWire(points: Point[]): string {
  const [first, ...rest] = points;
  const d = `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(" ");
  return `<path d="${d}" stroke="black" fill="none" stroke-width="2"/>`;
}
