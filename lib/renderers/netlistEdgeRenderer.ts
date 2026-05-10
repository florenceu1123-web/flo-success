import type { CircuitComponent, CircuitNetlist } from "@/types";

type Point = { x: number; y: number };
type Orientation = "horizontal" | "vertical";

type RenderEdge = {
  component: CircuitComponent;
  fromNode: string;
  toNode: string;
  start: Point;
  end: Point;
  fromIndex: number;
  toIndex: number;
};

type RenderContext = {
  wrapLaneIndex: number;
  topRailY: number;
  wrapBaseY: number;
  wrapGapY: number;
};

const TOP_Y = 120;
const X_PAD = 100;
const X_PITCH = 170;
const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0"]);

/**
 * Component 종류별 시각적 half-extent.
 * wire가 component 본체에 닿도록 wire-stop 위치를 결정한다.
 * 각 symbol render 함수가 그리는 path의 ±extent와 일치시켜야 갭/오버슈트 없음.
 */
export function componentHalfWidth(c: CircuitComponent): number {
  switch (c.type) {
    case "R":  return 28;   // zigzag M cx-28 ... cx+28
    case "L":  return 24;   // 4 arcs, ±24
    case "C":  return 4;    // 평행판 ±4
    case "D":  return 10;   // 삼각형+선 ±10
    case "V":  return 22;   // circle r=22
    case "I":  return 22;
    case "SW": return 14;   // 두 노드 사이 ±14
    case "VCCS":
    case "VCVS":
    case "CCCS":
    case "CCVS": return 22; // diamond ±22
    case "WIRE": return 0;  // 0-symbol wire
    default:   return 22;   // inline box 44x44 → ±22
  }
}

// =====================================================================
// Entry — netlist → graph → edges → SVG (renderEdges 호출)
// =====================================================================
export function renderNetlistEdgeSVG(netlist: CircuitNetlist): string {
  const validation = validateBasic(netlist);
  if (!validation.ok) {
    return `<pre>${escapeSvg(validation.errors.join("\n"))}</pre>`;
  }

  const { positions, indexOf } = computeNodePositions(netlist);
  const edges = buildRenderEdges(netlist, positions, indexOf);

  const edgesSvg = renderEdges(edges);
  const junctions = renderJunctions(netlist, positions);
  const grounds = renderGroundSymbols(positions, netlist.ground);

  // bounding box
  const xs = Array.from(positions.values()).map((p) => p.x);
  const ys = Array.from(positions.values()).map((p) => p.y);
  // wrap edges 가산 (대략 wrapBaseY + lanes)
  const ctxYMax = 240 + 70 * Math.max(0, edges.filter(isWrapEdge).length - 1);
  const minX = Math.min(0, ...xs) - 80;
  const maxX = Math.max(...xs) + 80;
  const minY = Math.min(0, ...ys) - 60;
  const maxY = Math.max(...ys, ctxYMax + 40) + 40;
  const w = Math.max(maxX - minX, 320);
  const h = Math.max(maxY - minY, 220);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">${edgesSvg}${junctions}${grounds}</svg>`;
}

// =====================================================================
// Validation
// =====================================================================
function validateBasic(netlist: CircuitNetlist) {
  const errors: string[] = [];
  if (!netlist.components?.length) errors.push("components가 없습니다.");
  for (const c of netlist.components ?? []) {
    if (!c.pins?.length) {
      errors.push(`${c.id}: pins 누락`);
      continue;
    }
    for (const p of c.pins) {
      if (!p.id) errors.push(`${c.id}: pin id 누락`);
      if (!p.node) errors.push(`${c.id}.${p.id}: node 누락`);
    }
    if (c.type !== "GND" && c.pins.length < 2) {
      errors.push(`${c.id}: 2단자 이상 소자인데 pins 부족`);
    }
  }
  return { ok: errors.length === 0, errors };
}

// =====================================================================
// Node positions + index 부여 (등장 순)
// =====================================================================
function computeNodePositions(netlist: CircuitNetlist): {
  positions: Map<string, Point>;
  indexOf: Map<string, number>;
} {
  const groundCandidates = new Set<string>([
    ...GROUND_LABELS,
    ...(netlist.ground ? [netlist.ground] : []),
  ]);

  const ordered: string[] = [];
  const indexOf = new Map<string, number>();
  for (const c of netlist.components) {
    for (const p of c.pins ?? []) {
      if (!indexOf.has(p.node)) {
        indexOf.set(p.node, ordered.length);
        ordered.push(p.node);
      }
    }
  }

  const positions = new Map<string, Point>();
  let topIdx = 0;
  let botIdx = 0;
  for (const node of ordered) {
    if (groundCandidates.has(node)) {
      positions.set(node, { x: X_PAD + botIdx * X_PITCH, y: 380 });
      botIdx++;
    } else {
      positions.set(node, { x: X_PAD + topIdx * X_PITCH, y: TOP_Y });
      topIdx++;
    }
  }
  return { positions, indexOf };
}

// =====================================================================
// Build RenderEdges (fromNode/toNode/fromIndex/toIndex 포함)
// =====================================================================
function buildRenderEdges(
  netlist: CircuitNetlist,
  positions: Map<string, Point>,
  indexOf: Map<string, number>,
): RenderEdge[] {
  const edges: RenderEdge[] = [];
  for (const c of netlist.components) {
    if (c.type === "GND") continue;
    if (!c.pins || c.pins.length < 2) continue;
    const [p1, p2] = c.pins;
    const start = positions.get(p1.node);
    const end = positions.get(p2.node);
    if (!start || !end) continue;
    edges.push({
      component: c,
      fromNode: p1.node,
      toNode: p2.node,
      start,
      end,
      fromIndex: indexOf.get(p1.node) ?? 0,
      toIndex: indexOf.get(p2.node) ?? 0,
    });
  }
  return edges;
}

// =====================================================================
// Edge dispatch — 일반 / wrap 분기
// =====================================================================
export function renderEdges(edges: RenderEdge[]): string {
  const ctx: RenderContext = {
    wrapLaneIndex: 0,
    topRailY: 120,
    wrapBaseY: 240,
    wrapGapY: 70,
  };
  return edges.map((edge) => renderEdge(edge, ctx)).join("\n");
}

function renderEdge(edge: RenderEdge, ctx: RenderContext): string {
  if (isWrapEdge(edge)) {
    return renderWrapEdge(edge, allocateWrapY(ctx));
  }
  return renderNormalEdge(edge);
}

/** wrap 판별: fromIndex > toIndex (역방향) 또는 같은 y에서 dx 음수 */
function isWrapEdge(edge: RenderEdge): boolean {
  if (edge.fromIndex > edge.toIndex) return true;
  const dx = edge.end.x - edge.start.x;
  const dy = Math.abs(edge.end.y - edge.start.y);
  return dx < 0 && dy < 8;
}

function allocateWrapY(ctx: RenderContext): number {
  const y = ctx.wrapBaseY + ctx.wrapLaneIndex * ctx.wrapGapY;
  ctx.wrapLaneIndex += 1;
  return y;
}

// =====================================================================
// Normal edge: wire → comp → wire
// =====================================================================
function renderNormalEdge(edge: RenderEdge): string {
  const orientation = decideOrientation(edge.start, edge.end);
  const center = midpoint(edge.start, edge.end);
  const half = componentHalfWidth(edge.component);

  const inPoint =
    orientation === "horizontal"
      ? { x: center.x - half, y: center.y }
      : { x: center.x, y: center.y - half };

  const outPoint =
    orientation === "horizontal"
      ? { x: center.x + half, y: center.y }
      : { x: center.x, y: center.y + half };

  return (
    orthogonalWire(edge.start, inPoint) +
    renderComponentOnEdge(edge.component, center, orientation) +
    orthogonalWire(outPoint, edge.end)
  );
}

// =====================================================================
// Wrap edge: detour lane (component는 lane 위에 배치)
// =====================================================================
function renderWrapEdge(edge: RenderEdge, detourY: number): string {
  const center = {
    x: (edge.start.x + edge.end.x) / 2,
    y: detourY,
  };
  const half = componentHalfWidth(edge.component);
  const inPoint = { x: center.x + half, y: detourY };  // start(우측) 쪽 진입
  const outPoint = { x: center.x - half, y: detourY }; // end(좌측) 쪽 출구

  return (
    `<path d="M ${edge.start.x} ${edge.start.y} L ${edge.start.x} ${detourY} L ${inPoint.x} ${detourY}" stroke="black" fill="none" stroke-width="2"/>` +
    renderComponentOnEdge(edge.component, center, "horizontal") +
    `<path d="M ${outPoint.x} ${detourY} L ${edge.end.x} ${detourY} L ${edge.end.x} ${edge.end.y}" stroke="black" fill="none" stroke-width="2"/>`
  );
}

// =====================================================================
// 보조 함수
// =====================================================================
function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function decideOrientation(a: Point, b: Point): Orientation {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx >= dy) return "horizontal";
  return "vertical";
}

/**
 * 회로도 wire는 절대 대각선 금지. 모든 연결은 수평/수직 segment로만.
 * orthogonalWire: H-V-H Z-자 (midX 기반).
 *  - 같은 y → 단일 horizontal
 *  - 같은 x → 단일 vertical
 *  - 그 외 → start → (midX, start.y) → (midX, end.y) → end
 */
function orthogonalWire(a: Point, b: Point): string {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);

  if (dy < 1) {
    return `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  if (dx < 1) {
    return `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
  }

  const midX = (a.x + b.x) / 2;
  return `<path d="M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
}

function wire(a: Point, b: Point): string {
  return orthogonalWire(a, b);
}

// =====================================================================
// Junctions / Ground
// =====================================================================
function renderJunctions(netlist: CircuitNetlist, nodePos: Map<string, Point>): string {
  const degree = new Map<string, number>();
  for (const c of netlist.components) {
    for (const p of c.pins ?? []) {
      degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
    }
  }
  let svg = "";
  for (const [node, d] of degree) {
    if (d >= 3) {
      const pos = nodePos.get(node);
      if (pos) svg += `<circle cx="${pos.x}" cy="${pos.y}" r="3.5" fill="black"/>`;
    }
  }
  return svg;
}

function renderGroundSymbols(nodePos: Map<string, Point>, ground?: string): string {
  let svg = "";
  for (const [node, p] of nodePos) {
    const isGround = GROUND_LABELS.has(node) || (ground !== undefined && node === ground);
    if (!isGround) continue;
    svg += `<g transform="translate(${p.x},${p.y})">
  <line x1="0" y1="0" x2="0" y2="10" stroke="black" stroke-width="2"/>
  <line x1="-10" y1="10" x2="10" y2="10" stroke="black" stroke-width="2.4"/>
  <line x1="-7" y1="14" x2="7" y2="14" stroke="black" stroke-width="2"/>
  <line x1="-3" y1="18" x2="3" y2="18" stroke="black" stroke-width="2"/>
</g>`;
  }
  return svg;
}

// =====================================================================
// 모든 소자에 공통 적용되는 dispatcher
// =====================================================================
export function renderComponentOnEdge(c: CircuitComponent, center: Point, orientation: Orientation): string {
  const cx = center.x, cy = center.y;
  switch (c.type) {
    case "R":  return renderResistor(c, cx, cy, orientation);
    case "L":  return renderInductor(c, cx, cy, orientation);
    case "C":  return renderCapacitor(c, cx, cy, orientation);
    case "D":  return renderDiode(c, cx, cy, orientation);
    case "V":  return renderVoltageSource(c, cx, cy, orientation);
    case "I":  return renderCurrentSource(c, cx, cy, orientation);
    case "SW": return renderSwitch(c, cx, cy, orientation);
    case "VCCS":
    case "CCCS": return renderDependent(c, cx, cy, orientation, "current");
    case "VCVS":
    case "CCVS": return renderDependent(c, cx, cy, orientation, "voltage");
    case "WIRE": return ""; // 0-symbol — surrounding wire가 곧장 연결
    default:   return renderInlineBox(c, cx, cy, orientation);
  }
}

// =====================================================================
// Symbols (모두 (c, cx, cy, orientation))
// =====================================================================
/**
 * 라벨은 항상 component shape 바깥에 위치.
 *  - 원/다이아몬드 (V/I/dep, 반지름 22)도 안전한 거리: id ±32, value ±34
 *  - horizontal: id 위, value 아래
 *  - vertical: id·value 모두 오른쪽(가로 spacing 절약)
 */
function labelsOnEdge(c: CircuitComponent, cx: number, cy: number, orientation: Orientation): string {
  const idText = escapeSvg(c.id);
  const valText = c.value !== undefined ? escapeSvg(c.value) : "";
  if (orientation === "horizontal") {
    return (
      `<text x="${cx}" y="${cy - 32}" text-anchor="middle" font-size="11" fill="#1e3a8a" font-weight="600">${idText}</text>` +
      (valText ? `<text x="${cx}" y="${cy + 38}" text-anchor="middle" font-size="11" fill="#475569">${valText}</text>` : "")
    );
  }
  return (
    `<text x="${cx + 34}" y="${cy - 4}" text-anchor="start" font-size="11" fill="#1e3a8a" font-weight="600">${idText}</text>` +
    (valText ? `<text x="${cx + 34}" y="${cy + 12}" text-anchor="start" font-size="11" fill="#475569">${valText}</text>` : "")
  );
}

function renderResistor(c: CircuitComponent, cx: number, cy: number, orientation: Orientation): string {
  if (orientation === "horizontal") {
    const path = `M ${cx - 28} ${cy} L ${cx - 21} ${cy - 10} L ${cx - 9} ${cy + 10} L ${cx + 3} ${cy - 10} L ${cx + 15} ${cy + 10} L ${cx + 24} ${cy - 8} L ${cx + 28} ${cy}`;
    return `<path d="${path}" stroke="black" fill="none" stroke-width="2"/>` + labelsOnEdge(c, cx, cy, orientation);
  }
  const path = `M ${cx} ${cy - 28} L ${cx - 10} ${cy - 21} L ${cx + 10} ${cy - 9} L ${cx - 10} ${cy + 3} L ${cx + 10} ${cy + 15} L ${cx - 8} ${cy + 24} L ${cx} ${cy + 28}`;
  return `<path d="${path}" stroke="black" fill="none" stroke-width="2"/>` + labelsOnEdge(c, cx, cy, orientation);
}

function renderInductor(c: CircuitComponent, cx: number, cy: number, orientation: Orientation): string {
  let path: string;
  if (orientation === "horizontal") {
    path = `M ${cx - 24} ${cy} a 6 6 0 0 1 12 0 a 6 6 0 0 1 12 0 a 6 6 0 0 1 12 0 a 6 6 0 0 1 12 0`;
  } else {
    path = `M ${cx} ${cy - 24} a 6 6 0 0 0 0 12 a 6 6 0 0 0 0 12 a 6 6 0 0 0 0 12 a 6 6 0 0 0 0 12`;
  }
  return `<path d="${path}" stroke="black" fill="none" stroke-width="2"/>` + labelsOnEdge(c, cx, cy, orientation);
}

function renderCapacitor(c: CircuitComponent, cx: number, cy: number, orientation: Orientation): string {
  let svg = "";
  if (orientation === "horizontal") {
    svg += `<line x1="${cx - 4}" y1="${cy - 12}" x2="${cx - 4}" y2="${cy + 12}" stroke="black" stroke-width="2.4"/>`;
    svg += `<line x1="${cx + 4}" y1="${cy - 12}" x2="${cx + 4}" y2="${cy + 12}" stroke="black" stroke-width="2.4"/>`;
  } else {
    svg += `<line x1="${cx - 12}" y1="${cy - 4}" x2="${cx + 12}" y2="${cy - 4}" stroke="black" stroke-width="2.4"/>`;
    svg += `<line x1="${cx - 12}" y1="${cy + 4}" x2="${cx + 12}" y2="${cy + 4}" stroke="black" stroke-width="2.4"/>`;
  }
  return svg + labelsOnEdge(c, cx, cy, orientation);
}

function renderDiode(c: CircuitComponent, cx: number, cy: number, orientation: Orientation): string {
  let svg = "";
  if (orientation === "horizontal") {
    svg += `<polygon points="${cx - 10},${cy - 10} ${cx - 10},${cy + 10} ${cx + 10},${cy}" fill="none" stroke="black" stroke-width="2"/>`;
    svg += `<line x1="${cx + 10}" y1="${cy - 10}" x2="${cx + 10}" y2="${cy + 10}" stroke="black" stroke-width="2.4"/>`;
  } else {
    svg += `<polygon points="${cx - 10},${cy - 10} ${cx + 10},${cy - 10} ${cx},${cy + 10}" fill="none" stroke="black" stroke-width="2"/>`;
    svg += `<line x1="${cx - 10}" y1="${cy + 10}" x2="${cx + 10}" y2="${cy + 10}" stroke="black" stroke-width="2.4"/>`;
  }
  return svg + labelsOnEdge(c, cx, cy, orientation);
}

function renderVoltageSource(c: CircuitComponent, cx: number, cy: number, orientation: Orientation): string {
  let svg = `<circle cx="${cx}" cy="${cy}" r="22" fill="white" stroke="black" stroke-width="2"/>`;
  if (orientation === "horizontal") {
    svg += `<text x="${cx - 7}" y="${cy + 5}" text-anchor="middle" font-size="14">+</text>`;
    svg += `<text x="${cx + 7}" y="${cy + 5}" text-anchor="middle" font-size="14">−</text>`;
  } else {
    svg += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="14">+</text>`;
    svg += `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="14">−</text>`;
  }
  return svg + labelsOnEdge(c, cx, cy, orientation);
}

function renderCurrentSource(c: CircuitComponent, cx: number, cy: number, orientation: Orientation): string {
  let svg = `<circle cx="${cx}" cy="${cy}" r="22" fill="white" stroke="black" stroke-width="2"/>`;
  if (orientation === "horizontal") {
    svg += `<line x1="${cx - 12}" y1="${cy}" x2="${cx + 12}" y2="${cy}" stroke="black" stroke-width="2"/>`;
    svg += `<polyline points="${cx + 6},${cy - 5} ${cx + 12},${cy} ${cx + 6},${cy + 5}" stroke="black" fill="none" stroke-width="2"/>`;
  } else {
    svg += `<line x1="${cx}" y1="${cy + 12}" x2="${cx}" y2="${cy - 12}" stroke="black" stroke-width="2"/>`;
    svg += `<polyline points="${cx - 5},${cy - 6} ${cx},${cy - 12} ${cx + 5},${cy - 6}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  return svg + labelsOnEdge(c, cx, cy, orientation);
}

function renderSwitch(c: CircuitComponent, cx: number, cy: number, orientation: Orientation): string {
  const open = c.state !== "closed";
  let svg = "";
  if (orientation === "horizontal") {
    svg += `<circle cx="${cx - 14}" cy="${cy}" r="3" fill="white" stroke="black" stroke-width="2"/>`;
    svg += `<circle cx="${cx + 14}" cy="${cy}" r="3" fill="white" stroke="black" stroke-width="2"/>`;
    svg += open
      ? `<path d="M ${cx - 14} ${cy} L ${cx + 6} ${cy - 14}" stroke="black" fill="none" stroke-width="2"/>`
      : `<path d="M ${cx - 14} ${cy} L ${cx + 14} ${cy}" stroke="black" fill="none" stroke-width="2"/>`;
  } else {
    svg += `<circle cx="${cx}" cy="${cy - 14}" r="3" fill="white" stroke="black" stroke-width="2"/>`;
    svg += `<circle cx="${cx}" cy="${cy + 14}" r="3" fill="white" stroke="black" stroke-width="2"/>`;
    svg += open
      ? `<path d="M ${cx} ${cy - 14} L ${cx + 14} ${cy + 6}" stroke="black" fill="none" stroke-width="2"/>`
      : `<path d="M ${cx} ${cy - 14} L ${cx} ${cy + 14}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  return svg + labelsOnEdge(c, cx, cy, orientation);
}

function renderDependent(c: CircuitComponent, cx: number, cy: number, orientation: Orientation, kind: "current" | "voltage"): string {
  let svg = `<polygon points="${cx},${cy - 22} ${cx + 22},${cy} ${cx},${cy + 22} ${cx - 22},${cy}" fill="white" stroke="black" stroke-width="2"/>`;
  if (kind === "voltage") {
    if (orientation === "horizontal") {
      svg += `<text x="${cx - 7}" y="${cy + 5}" text-anchor="middle" font-size="13">+</text>`;
      svg += `<text x="${cx + 7}" y="${cy + 5}" text-anchor="middle" font-size="13">−</text>`;
    } else {
      svg += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="13">+</text>`;
      svg += `<text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="13">−</text>`;
    }
  } else {
    if (orientation === "horizontal") {
      svg += `<line x1="${cx - 10}" y1="${cy}" x2="${cx + 10}" y2="${cy}" stroke="black" stroke-width="2"/>`;
      svg += `<polyline points="${cx + 5},${cy - 5} ${cx + 10},${cy} ${cx + 5},${cy + 5}" stroke="black" fill="none" stroke-width="2"/>`;
    } else {
      svg += `<line x1="${cx}" y1="${cy + 10}" x2="${cx}" y2="${cy - 10}" stroke="black" stroke-width="2"/>`;
      svg += `<polyline points="${cx - 5},${cy - 5} ${cx},${cy - 10} ${cx + 5},${cy - 5}" stroke="black" fill="none" stroke-width="2"/>`;
    }
  }
  const labelText = `${escapeSvg(c.gain ?? c.value ?? c.id)}`;
  if (orientation === "horizontal") {
    svg += `<text x="${cx}" y="${cy - 30}" text-anchor="middle" font-size="11">${labelText}</text>`;
  } else {
    svg += `<text x="${cx + 28}" y="${cy + 4}" text-anchor="start" font-size="11">${labelText}</text>`;
  }
  return svg;
}

function renderInlineBox(c: CircuitComponent, cx: number, cy: number, orientation: Orientation): string {
  const w = orientation === "horizontal" ? 44 : 28;
  const h = orientation === "horizontal" ? 28 : 44;
  return (
    `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="white" stroke="black" stroke-width="2"/>` +
    `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11">${escapeSvg(c.type)}</text>` +
    labelsOnEdge(c, cx, cy, orientation)
  );
}

// =====================================================================
function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
