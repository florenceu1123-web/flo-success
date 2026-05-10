import type { CircuitComponent, CircuitNetlist } from "@/types";
import {
  componentHalfWidth,
  renderComponentOnEdge,
  renderNetlistEdgeSVG,
} from "./netlistEdgeRenderer";

// =====================================================================
// analog mesh renderer — 2-rail layout
//
// 알고리즘:
//  1. Ground node와 top node 분류 (GND_LABELS / netlist.ground / GND component)
//  2. Top node를 가로로 spread (TOP_Y row)
//  3. 각 component (2-pin)를 horizontal(top↔top) / vertical(top↔ground)으로 분기
//  4. 같은 top node에 vertical이 여러 개면 가로 offset으로 슬롯 할당 (parallel)
//  5. Top rail wire — 인접 top node 사이에 horizontal component가 없을 때만 채움
//  6. Bottom rail wire — vertical component들의 x 범위에 그어줌
//  7. T-junction 위치에 dot
//  8. Ground 심볼은 bottom rail 가운데에 1개
//
// Fallback:
//  - ground도 없고 top node도 없는 회로 (예: 단순 series-loop) → 기존 edge renderer
//  - 3-pin 이상 component (BJT/MOSFET/OPAMP)가 있으면 → 기존 edge renderer
// =====================================================================

type Point = { x: number; y: number };

const GROUND_LABELS = new Set([
  "GND",
  "gnd",
  "Gnd",
  "0",
  "ground",
  "Ground",
]);
const TOP_Y = 80;
const BOT_Y = 340;
const LEFT_X = 100;
const X_PITCH = 170;
const VERTICAL_PARALLEL_GAP = 80;

type HPlace = {
  component: CircuitComponent;
  node1: string;
  node2: string;
};

type VPlace = {
  component: CircuitComponent;
  topNode: string;
  groundNode: string;
  xSlot: number; // 0 = top node와 같은 x, >0 = 가로 offset (parallel)
};

export function renderAnalogMeshSVG(netlist: CircuitNetlist): string {
  // 0. 사전 검증
  const errors = validateBasic(netlist);
  if (errors.length > 0) {
    return `<pre>${escapeSvg(errors.join("\n"))}</pre>`;
  }

  // 0.1 3-pin 이상이면 mesh layout 적용 불가 — fallback
  if (netlist.components.some((c) => (c.pins?.length ?? 0) > 2)) {
    return renderNetlistEdgeSVG(netlist);
  }

  // 1. Ground / top 분류
  const { topNodes, groundIds } = classifyNodes(netlist);

  // 1.1 ground도 없고 top도 비어있으면 의미 없음 — fallback
  if (groundIds.size === 0 || topNodes.length === 0) {
    return renderNetlistEdgeSVG(netlist);
  }

  // 2. Top node 좌표
  const topPos = new Map<string, Point>();
  topNodes.forEach((n, i) => {
    topPos.set(n, { x: LEFT_X + i * X_PITCH, y: TOP_Y });
  });

  // 3. Component 분류 → horizontal / vertical
  const horizontals: HPlace[] = [];
  const verticalsByTopNode = new Map<string, CircuitComponent[]>();

  for (const c of netlist.components) {
    if (c.type === "GND") continue;
    if (!c.pins || c.pins.length < 2) continue;
    const [p1, p2] = c.pins;
    const p1G = groundIds.has(p1.node);
    const p2G = groundIds.has(p2.node);
    if (p1G && p2G) continue; // ground↔ground는 무시

    if (!p1G && !p2G) {
      horizontals.push({
        component: c,
        node1: p1.node,
        node2: p2.node,
      });
    } else {
      const topNode = p1G ? p2.node : p1.node;
      if (!verticalsByTopNode.has(topNode)) {
        verticalsByTopNode.set(topNode, []);
      }
      verticalsByTopNode.get(topNode)!.push(c);
    }
  }

  // 4. Vertical 슬롯 할당 (같은 top node에 여러 vertical이 있으면 spread)
  const verticals: VPlace[] = [];
  for (const [topNode, comps] of verticalsByTopNode) {
    comps.forEach((c, i) => {
      const groundPin = c.pins.find((p) => groundIds.has(p.node));
      if (!groundPin) return;
      verticals.push({
        component: c,
        topNode,
        groundNode: groundPin.node,
        xSlot: i,
      });
    });
  }

  const verticalX = (v: VPlace): number => {
    const tx = topPos.get(v.topNode)?.x ?? 0;
    return tx + v.xSlot * VERTICAL_PARALLEL_GAP;
  };

  // ======================
  // 5. Render
  // ======================
  const parts: string[] = [];

  // 5.1 Top rail wires (인접 top node 사이에 horizontal component가 없을 때만)
  parts.push(renderTopRailWires(topNodes, topPos, horizontals));

  // 5.2 Top stubs — offset된 vertical (xSlot>0)에 대해 top rail에서 vertical x까지 가로 stub
  for (const v of verticals) {
    if (v.xSlot === 0) continue;
    const tx = topPos.get(v.topNode)?.x;
    if (tx === undefined) continue;
    const vx = verticalX(v);
    parts.push(
      `<path d="M ${tx} ${TOP_Y} L ${vx} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`,
    );
  }

  // 5.3 Bottom rail wire
  if (verticals.length >= 2) {
    const xs = verticals.map(verticalX);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    if (xMax > xMin) {
      parts.push(
        `<path d="M ${xMin} ${BOT_Y} L ${xMax} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`,
      );
    }
  }

  // 5.4 Horizontal components — bbox 수집
  const obstacles: Bbox[] = [];
  for (const h of horizontals) {
    const a = topPos.get(h.node1);
    const b = topPos.get(h.node2);
    if (!a || !b) continue;
    parts.push(renderHorizontalComponent(h.component, a, b));
    obstacles.push(bboxHorizontal(h.component, a, b));
  }

  // 5.5 Vertical components — bbox 수집
  for (const v of verticals) {
    const x = verticalX(v);
    parts.push(renderVerticalComponent(v.component, x));
    obstacles.push(bboxVertical(v.component, x));
  }

  // 5.6 Junction dots
  parts.push(renderJunctionDots(netlist, topPos, verticals, verticalX));

  // 5.7 Ground symbol — bottom rail 가운데
  if (verticals.length > 0) {
    const xs = verticals.map(verticalX);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    parts.push(renderGroundSymbol(cx, BOT_Y));
  }

  // ============ overlay layer (terminal/measurement/placeholder) ============
  // 회로 edge가 아니라 별도 layer. obstacles bbox 기반 collision avoidance.
  parts.push(renderOverlayLayer(netlist, topPos, verticals, verticalX, obstacles));

  // 6. viewBox
  const allXs: number[] = [
    ...Array.from(topPos.values()).map((p) => p.x),
    ...verticals.map(verticalX),
  ];
  const xMin = Math.min(...allXs) - 80;
  const xMax = Math.max(...allXs) + 80;
  // annotation이 있으면 위쪽 추가 여백
  const hasAnnotations = Boolean(
    (netlist.nodeAnnotations?.length ?? 0) +
    (netlist.loadPlaceholders?.length ?? 0) +
    (netlist.measurementMarks?.length ?? 0),
  );
  const yMin = (hasAnnotations ? ANNO_BAND_Y - 32 : TOP_Y - 50);
  const yMax = BOT_Y + 60;
  const w = Math.max(xMax - xMin, 320);
  const h = Math.max(yMax - yMin, 240);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="${xMin} ${yMin} ${w} ${h}">${parts.join("\n")}</svg>`;
}

// =====================================================================
// Helpers
// =====================================================================

function validateBasic(netlist: CircuitNetlist): string[] {
  const errors: string[] = [];
  if (!netlist?.components?.length) {
    errors.push("analog_netlist: components 없음");
    return errors;
  }
  for (const c of netlist.components) {
    if (!c.pins?.length) {
      errors.push(`${c.id}: pins 누락`);
      continue;
    }
    if (c.type !== "GND" && c.pins.length < 2) {
      errors.push(`${c.id}: 2단자 이상 소자인데 pins 부족`);
    }
    for (const p of c.pins) {
      if (!p.id) errors.push(`${c.id}: pin id 누락`);
      if (!p.node) errors.push(`${c.id}.${p.id ?? "?"}: node 누락`);
    }
  }
  return errors;
}

function classifyNodes(netlist: CircuitNetlist): {
  topNodes: string[];
  groundIds: Set<string>;
} {
  const groundIds = new Set<string>();
  if (netlist.ground) groundIds.add(netlist.ground);
  for (const c of netlist.components) {
    if (c.type === "GND") {
      for (const p of c.pins ?? []) groundIds.add(p.node);
    }
    for (const p of c.pins ?? []) {
      if (GROUND_LABELS.has(p.node)) groundIds.add(p.node);
    }
  }

  const seen = new Set<string>();
  const topNodes: string[] = [];
  for (const c of netlist.components) {
    if (c.type === "GND") continue;
    for (const p of c.pins ?? []) {
      if (groundIds.has(p.node)) continue;
      if (!seen.has(p.node)) {
        seen.add(p.node);
        topNodes.push(p.node);
      }
    }
  }
  return { topNodes, groundIds };
}

function renderTopRailWires(
  topNodes: string[],
  topPos: Map<string, Point>,
  horizontals: HPlace[],
): string {
  let svg = "";
  for (let i = 0; i < topNodes.length - 1; i++) {
    const n1 = topNodes[i];
    const n2 = topNodes[i + 1];
    const directly = horizontals.some(
      (h) =>
        (h.node1 === n1 && h.node2 === n2) ||
        (h.node1 === n2 && h.node2 === n1),
    );
    if (directly) continue;
    const a = topPos.get(n1);
    const b = topPos.get(n2);
    if (!a || !b) continue;
    svg += `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  return svg;
}

function renderHorizontalComponent(
  c: CircuitComponent,
  a: Point,
  b: Point,
): string {
  const cx = (a.x + b.x) / 2;
  const cy = a.y;
  const half = componentHalfWidth(c);
  let svg = "";
  if (cx - half > a.x) {
    svg += `<path d="M ${a.x} ${a.y} L ${cx - half} ${cy}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  svg += renderComponentOnEdge(c, { x: cx, y: cy }, "horizontal");
  if (b.x > cx + half) {
    svg += `<path d="M ${cx + half} ${cy} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  return svg;
}

function renderVerticalComponent(c: CircuitComponent, x: number): string {
  const cy = (TOP_Y + BOT_Y) / 2;
  const half = componentHalfWidth(c);
  let svg = "";
  svg += `<path d="M ${x} ${TOP_Y} L ${x} ${cy - half}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderComponentOnEdge(c, { x, y: cy }, "vertical");
  svg += `<path d="M ${x} ${cy + half} L ${x} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  return svg;
}

function renderJunctionDots(
  netlist: CircuitNetlist,
  topPos: Map<string, Point>,
  verticals: VPlace[],
  verticalX: (v: VPlace) => number,
): string {
  let svg = "";

  // Top node dots: degree ≥ 3 (rail 두 방향 + leg)
  const degree = new Map<string, number>();
  for (const c of netlist.components) {
    if (c.type === "GND") continue;
    for (const p of c.pins ?? []) {
      if (topPos.has(p.node)) {
        degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
      }
    }
  }
  for (const [node, d] of degree) {
    if (d < 3) continue;
    const pos = topPos.get(node);
    if (pos) svg += `<circle cx="${pos.x}" cy="${pos.y}" r="3.5" fill="black"/>`;
  }

  // Bottom rail T-junction dots: vertical x가 min/max 사이에 있을 때
  if (verticals.length >= 3) {
    const xs = verticals.map(verticalX);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    for (const x of xs) {
      if (x > xMin && x < xMax) {
        svg += `<circle cx="${x}" cy="${BOT_Y}" r="3.5" fill="black"/>`;
      }
    }
  }

  // Top stub T-junction dots: offset vertical이 있는 top node는 leg + rail이 만나므로 dot 필요
  // (이미 degree≥3에 포함되지만, 같은 top node에 vertical 2개+horizontal 0개일 때는 degree=2라 누락)
  // 따라서 같은 top node에 vertical이 2개 이상이면 dot 추가
  const verticalCountByTop = new Map<string, number>();
  for (const v of verticals) {
    verticalCountByTop.set(
      v.topNode,
      (verticalCountByTop.get(v.topNode) ?? 0) + 1,
    );
  }
  for (const [node, count] of verticalCountByTop) {
    if (count >= 2 && (degree.get(node) ?? 0) < 3) {
      const pos = topPos.get(node);
      if (pos) svg += `<circle cx="${pos.x}" cy="${pos.y}" r="3.5" fill="black"/>`;
    }
  }

  return svg;
}

// =====================================================================
// Overlay layer — terminal/measurement/placeholder 라우팅
// 회로 edge가 아닌 별도 layer로 처리. obstacle bbox 기반 collision avoidance.
// =====================================================================

type Bbox = { x: number; y: number; w: number; h: number; type: string };

/** horizontal component bbox 추정 (component_half + label margin 포함) */
function bboxHorizontal(c: CircuitComponent, a: Point, b: Point): Bbox {
  const cx = (a.x + b.x) / 2;
  const cy = a.y;
  const half = componentHalfWidth(c);
  return { x: cx - half - 4, y: cy - 36, w: 2 * half + 8, h: 72, type: c.type };
}

/** vertical component bbox 추정 */
function bboxVertical(c: CircuitComponent, x: number): Bbox {
  const cy = (TOP_Y + BOT_Y) / 2;
  const half = componentHalfWidth(c);
  return { x: x - 28, y: cy - half - 4, w: 56, h: 2 * half + 8, type: c.type };
}

/** point가 bbox 안에 있나 */
function pointInBbox(px: number, py: number, b: Bbox): boolean {
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}

/** 직선 segment가 bbox와 교차하나 (단순 sweep 검사) */
function segmentIntersectsBbox(x1: number, y1: number, x2: number, y2: number, b: Bbox): boolean {
  // 둘 중 하나가 안에 있으면 교차
  if (pointInBbox(x1, y1, b) || pointInBbox(x2, y2, b)) return true;
  // bbox 4 변과 교차 검사
  return (
    segIntersectsSeg(x1, y1, x2, y2, b.x, b.y, b.x + b.w, b.y) ||
    segIntersectsSeg(x1, y1, x2, y2, b.x + b.w, b.y, b.x + b.w, b.y + b.h) ||
    segIntersectsSeg(x1, y1, x2, y2, b.x + b.w, b.y + b.h, b.x, b.y + b.h) ||
    segIntersectsSeg(x1, y1, x2, y2, b.x, b.y + b.h, b.x, b.y)
  );
}

function segIntersectsSeg(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
): boolean {
  const d1 = (bx2 - bx1) * (ay1 - by1) - (by2 - by1) * (ax1 - bx1);
  const d2 = (bx2 - bx1) * (ay2 - by1) - (by2 - by1) * (ax2 - bx1);
  const d3 = (ax2 - ax1) * (by1 - ay1) - (ay2 - ay1) * (bx1 - ax1);
  const d4 = (ax2 - ax1) * (by2 - ay1) - (ay2 - ay1) * (bx2 - ax1);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * 회로 edge 위 라벨 위치를 bbox 충돌 회피해 결정.
 * 후보 위치들 시도, 안 충돌하는 첫 좌표 반환.
 */
function findFreeLabelPos(baseX: number, baseY: number, obstacles: Bbox[]): Point {
  const candidates: Point[] = [
    { x: baseX, y: baseY },
    { x: baseX, y: baseY - 10 },
    { x: baseX, y: baseY - 20 },
    { x: baseX + 10, y: baseY },
    { x: baseX - 10, y: baseY },
  ];
  for (const c of candidates) {
    if (!obstacles.some((o) => pointInBbox(c.x, c.y, o))) return c;
  }
  return candidates[0];
}

const ANNO_BAND_Y = TOP_Y - 56;  // 회로 위쪽 overlay band

/**
 * Overlay layer entry — 모든 overlay item을 obstacle 회피하며 렌더.
 *  - terminals (a/b nodeAnnotations + dot)
 *  - load placeholders (R_L 박스, 점선 wire)
 *  - measurement marks (V_ab probe, +/- 표시)
 */
function renderOverlayLayer(
  netlist: CircuitNetlist,
  topPos: Map<string, Point>,
  verticals: VPlace[],
  verticalX: (v: VPlace) => number,
  obstacles: Bbox[],
): string {
  let svg = "";

  // 모든 알려진 node의 좌표 수집 (top + ground)
  const nodePositions = new Map<string, Point>();
  for (const [n, p] of topPos) nodePositions.set(n, p);
  if (netlist.ground) {
    if (verticals.length > 0) {
      const xs = verticals.map(verticalX);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      nodePositions.set(netlist.ground, { x: cx, y: BOT_Y });
    }
  }

  // 단자 라벨 → node id 역매핑 (R_L betweenNodes fallback 용)
  // 예: nodeAnnotations에 "a"/"b" 라벨이 있으면 그 node id를 알아둠
  const labelToNode = new Map<string, string>();
  for (const ann of netlist.nodeAnnotations ?? []) {
    labelToNode.set(ann.label.trim().toLowerCase(), ann.node);
  }

  // ============ node annotations (단자 점 + 라벨) ============
  for (const ann of netlist.nodeAnnotations ?? []) {
    const pos = nodePositions.get(ann.node);
    if (!pos) continue;
    const isTop = Math.abs(pos.y - TOP_Y) < 1;
    if (ann.style === "terminal_dot") {
      svg += `<circle cx="${pos.x}" cy="${pos.y}" r="4.5" fill="#dc2626" stroke="black" stroke-width="1"/>`;
    }
    // 라벨: bbox 회피하여 위치 결정
    const baseY = isTop ? pos.y - 12 : pos.y + 26;
    const labelPos = findFreeLabelPos(pos.x + 9, baseY, obstacles);
    svg += `<text x="${labelPos.x}" y="${labelPos.y}" font-size="14" font-weight="700" fill="#dc2626">${escapeSvg(ann.label)}</text>`;
  }

  // ============ load placeholders ============
  // 회로 위쪽 ANNO_BAND_Y band에 박스. 점선 wire는 obstacle 회피.
  for (const ph of netlist.loadPlaceholders ?? []) {
    let [n1, n2] = ph.betweenNodes;
    let a = nodePositions.get(n1);
    let b = nodePositions.get(n2);
    if (!a || !b) {
      const fa = labelToNode.get("a");
      const fb = labelToNode.get("b");
      if (fa && fb) {
        n1 = fa; n2 = fb;
        a = nodePositions.get(n1);
        b = nodePositions.get(n2);
      }
    }
    if (!a || !b) continue;

    const boxCx = (a.x + b.x) / 2;
    const boxCy = ANNO_BAND_Y;
    const w = 60;
    const h = 28;
    svg += `<rect x="${boxCx - w / 2}" y="${boxCy - h / 2}" width="${w}" height="${h}" fill="white" stroke="#9333ea" stroke-width="2" stroke-dasharray="5,3"/>`;
    svg += `<text x="${boxCx}" y="${boxCy + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#9333ea">${escapeSvg(ph.label)}</text>`;
    // node → 박스 라우팅: 위로 곧장 가는 path (회로 영역 위 ANNO_BAND_Y로 빠지므로 obstacle과 안 충돌)
    svg += routeOverlayPath(a.x, a.y - 6, boxCx - w / 2, boxCy, obstacles, "#9333ea");
    svg += routeOverlayPath(b.x, b.y - 6, boxCx + w / 2, boxCy, obstacles, "#9333ea");
  }

  // ============ measurement marks (V_ab probe overlay) ============
  for (const m of netlist.measurementMarks ?? []) {
    if (m.kind === "voltage" && m.refs.length >= 2) {
      let [n1, n2] = m.refs;
      let a = nodePositions.get(n1);
      let b = nodePositions.get(n2);
      if (!a || !b) {
        const fa = labelToNode.get("a");
        const fb = labelToNode.get("b");
        if (fa && fb) {
          n1 = fa; n2 = fb;
          a = nodePositions.get(n1);
          b = nodePositions.get(n2);
        }
      }
      if (!a || !b) continue;

      // +/- 마크 — bbox 회피하여 위치 결정
      const plusPos = findFreeLabelPos(a.x - 14, a.y + 4, obstacles);
      const minusPos = findFreeLabelPos(b.x + 14, b.y + 4, obstacles);
      svg += `<text x="${plusPos.x}" y="${plusPos.y}" text-anchor="end" font-size="14" font-weight="700" fill="#0891b2">+</text>`;
      svg += `<text x="${minusPos.x}" y="${minusPos.y}" text-anchor="start" font-size="14" font-weight="700" fill="#0891b2">−</text>`;

      // V_ab 라벨 — 회로 외곽 band, load placeholder 위
      const hasLoad = (netlist.loadPlaceholders ?? []).length > 0;
      const labelY = hasLoad ? ANNO_BAND_Y - 22 : ANNO_BAND_Y;
      const labelCx = (a.x + b.x) / 2;
      svg += `<text x="${labelCx}" y="${labelY}" text-anchor="middle" font-size="13" font-weight="700" fill="#0891b2">${escapeSvg(m.label)}</text>`;
    }
    // current는 component 좌표 추적이 필요해서 v1차는 skip
  }

  return svg;
}

/**
 * Overlay 경로 라우팅 — start→end 점선 path를 그리되 obstacle 회피.
 *  - 직선 시도 (수직/수평/L자)
 *  - 충돌 시 ANNO_BAND_Y로 우회 (위로 올라갔다가 옆으로 가서 내려옴)
 */
function routeOverlayPath(
  x1: number, y1: number, x2: number, y2: number,
  obstacles: Bbox[],
  color: string,
): string {
  // 시도 1: L-자 (수직 후 수평)
  const lShape1 = { vx: x1, hy: y2 };
  const seg1a = !obstacles.some((o) => segmentIntersectsBbox(x1, y1, x1, y2, o));
  const seg1b = !obstacles.some((o) => segmentIntersectsBbox(x1, y2, x2, y2, o));
  if (seg1a && seg1b) {
    return `<path d="M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}" stroke="${color}" fill="none" stroke-width="1.2" stroke-dasharray="3,3"/>`;
  }
  // 시도 2: ANNO_BAND_Y 우회 (위로 ↑ → 옆으로 → 아래로 ↓)
  const detourY = Math.min(ANNO_BAND_Y, y2);
  return `<path d="M ${x1} ${y1} L ${x1} ${detourY} L ${x2} ${detourY} L ${x2} ${y2}" stroke="${color}" fill="none" stroke-width="1.2" stroke-dasharray="3,3"/>`;
}

function renderGroundSymbol(cx: number, cy: number): string {
  return `<g transform="translate(${cx},${cy})">
  <line x1="0" y1="0" x2="0" y2="10" stroke="black" stroke-width="2"/>
  <line x1="-10" y1="10" x2="10" y2="10" stroke="black" stroke-width="2.4"/>
  <line x1="-7" y1="14" x2="7" y2="14" stroke="black" stroke-width="2"/>
  <line x1="-3" y1="18" x2="3" y2="18" stroke="black" stroke-width="2"/>
</g>`;
}

function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
