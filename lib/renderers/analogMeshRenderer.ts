import type { CircuitComponent, CircuitNetlist } from "@/types";
import {
  componentHalfWidth,
  renderComponentOnEdge,
  renderNetlistEdgeSVG,
} from "./netlistEdgeRenderer";
import { hasOpAmp, renderOpAmpCircuit, validateOpAmpCircuit } from "./opampCircuitRenderer";
import { hasBjt, renderBjtCircuit } from "./bjtCircuitRenderer";

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
const LEFT_X = 120;
const X_PITCH = 220;            // component(R 56·OPAMP 64) + label 양옆 여유
const VERTICAL_PARALLEL_GAP = 130;  // 같은 top node에 V 두 개 등 parallel일 때 source 원(r=22) + label 안 겹침

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

  // 0.05 OPAMP가 포함된 회로는 전용 renderer로 분리 (single OPAMP만; multi는 아래 fallback).
  if (hasOpAmp(netlist)) {
    const opampErrors = validateOpAmpCircuit(netlist);
    if (opampErrors.length > 0) {
      return `<pre>${escapeSvg(opampErrors.join("\n"))}</pre>`;
    }
    const svg = renderOpAmpCircuit(netlist);
    if (svg) return svg;
    // null → multi-OPAMP, 아래 generic fallback으로
  }
  // 0.06 BJT가 포함된 회로 (DC bias 회로 — 임용 7번 형식)는 전용 renderer로.
  if (hasBjt(netlist)) {
    const svg = renderBjtCircuit(netlist);
    if (svg) return svg;
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

  // 3. Component 분류 → horizontal / vertical / vertical-chain
  const horizontals: HPlace[] = [];
  const verticalsByTopNode = new Map<string, CircuitComponent[]>();
  // ★ legRoot 마킹된 multi-component vertical chain (SW+R+I 직렬 등)
  const verticalChainsByRoot = new Map<string, CircuitComponent[]>();

  for (const c of netlist.components) {
    if (c.type === "GND") continue;
    if (!c.pins || c.pins.length < 2) continue;

    // legRoot 있으면 그 root top node 아래 vertical chain
    if (c.legRoot && topNodes.includes(c.legRoot)) {
      if (!verticalChainsByRoot.has(c.legRoot)) verticalChainsByRoot.set(c.legRoot, []);
      verticalChainsByRoot.get(c.legRoot)!.push(c);
      continue;
    }

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

  // 5.3 Bottom rail wire — vertical + vertical-chain 모든 x 포함
  //   (chainXs는 5.5b에서 계산되지만 bottom rail은 그 전에 그려야 하므로 미리 계산)
  const preChainXs: number[] = [];
  for (const [rootNode, comps] of verticalChainsByRoot) {
    void comps;
    const existingSlots = verticalsByTopNode.get(rootNode)?.length ?? 0;
    const tx = topPos.get(rootNode)?.x ?? 0;
    preChainXs.push(tx + existingSlots * VERTICAL_PARALLEL_GAP);
  }
  const allVerticalXs = [...verticals.map(verticalX), ...preChainXs];
  if (allVerticalXs.length >= 2) {
    const xMin = Math.min(...allVerticalXs);
    const xMax = Math.max(...allVerticalXs);
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

  // 5.5b Vertical chains (legRoot 마킹된 SW+R+I 직렬 등) — root top node 아래 stack
  const chainXs: number[] = [];
  // chain 내 component 사이의 mid 노드 좌표를 저장 — overlay layer가 단자 dot/라벨에 사용.
  const chainMidPositions = new Map<string, Point>();
  for (const [rootNode, comps] of verticalChainsByRoot) {
    // 같은 root에 단일 vertical도 있으면 그 옆 slot, 없으면 root x 그대로
    const existingSlots = verticalsByTopNode.get(rootNode)?.length ?? 0;
    const tx = topPos.get(rootNode)?.x ?? 0;
    const cx = tx + existingSlots * VERTICAL_PARALLEL_GAP;
    chainXs.push(cx);
    // offset된 경우 top rail에서 chain x까지 stub
    if (cx !== tx) {
      parts.push(`<path d="M ${tx} ${TOP_Y} L ${cx} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`);
    }
    parts.push(renderVerticalChain(comps, cx));
    for (const c of comps) obstacles.push(bboxVertical(c, cx));
    // chain 내 mid 노드 좌표 추출 — renderVerticalChain과 동일 공식으로.
    // comps[i]의 top pin과 comps[i-1]의 bottom pin이 같은 노드 (mid 노드).
    const span = BOT_Y - TOP_Y;
    const slotH = span / comps.length;
    let prevBotY = TOP_Y;
    comps.forEach((c, i) => {
      const cy = TOP_Y + slotH * (i + 0.5);
      const half = componentHalfWidth(c);
      const topPinY = cy - half;
      if (i > 0) {
        // 이전 component bottom과 이 component top 사이의 wire 가운데가 mid 노드 시각 위치
        const midY = (prevBotY + topPinY) / 2;
        const topPinNode = c.pins?.[0]?.node;
        if (topPinNode && topPinNode !== netlist.ground && topPinNode !== rootNode) {
          chainMidPositions.set(topPinNode, { x: cx, y: midY });
        }
      }
      prevBotY = cy + half;
    });
  }

  // 5.6 Junction dots
  parts.push(renderJunctionDots(netlist, topPos, verticals, verticalX));

  // 5.7 Ground symbol — bottom rail 가운데 (vertical + chain 모두 포함)
  const groundXs = [...verticals.map(verticalX), ...chainXs];
  if (groundXs.length > 0) {
    const cx = (Math.min(...groundXs) + Math.max(...groundXs)) / 2;
    parts.push(renderGroundSymbol(cx, BOT_Y));
  }

  // ============ overlay layer (terminal/measurement/placeholder) ============
  // 회로 edge가 아니라 별도 layer. obstacles bbox 기반 collision avoidance.
  parts.push(renderOverlayLayer(netlist, topPos, verticals, verticalX, obstacles, chainMidPositions));

  // 6. viewBox
  const allXs: number[] = [
    ...Array.from(topPos.values()).map((p) => p.x),
    ...verticals.map(verticalX),
    ...chainXs,
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
    // ★ legRoot 마킹 component(vertical chain의 일부)의 pin node는 top rail node가 아님.
    //   chain 내부 mid 노드가 topNodes에 등록되면 top rail wire가 그쪽으로 삐져나옴.
    //   root top node는 어차피 다른 horizontal component가 등록하므로 안전.
    if (c.legRoot) continue;
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

/**
 * Vertical chain — SW+R+I 직렬 등 multi-component leg를 root top node 아래
 * TOP_Y → comp1 → comp2 → ... → BOT_Y(GND)로 순서대로 stack.
 */
function renderVerticalChain(comps: CircuitComponent[], x: number): string {
  if (comps.length === 0) return "";
  const span = BOT_Y - TOP_Y;
  const slotH = span / comps.length;
  let svg = "";
  let prevY = TOP_Y;
  comps.forEach((c, i) => {
    const cy = TOP_Y + slotH * (i + 0.5);
    const half = componentHalfWidth(c);
    svg += `<path d="M ${x} ${prevY} L ${x} ${cy - half}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderComponentOnEdge(c, { x, y: cy }, "vertical");
    prevY = cy + half;
  });
  svg += `<path d="M ${x} ${prevY} L ${x} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
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
  chainMidPositions?: Map<string, Point>,
): string {
  let svg = "";

  // 모든 알려진 node의 좌표 수집 (top + ground + chain mid)
  const nodePositions = new Map<string, Point>();
  for (const [n, p] of topPos) nodePositions.set(n, p);
  if (netlist.ground) {
    if (verticals.length > 0) {
      const xs = verticals.map(verticalX);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      nodePositions.set(netlist.ground, { x: cx, y: BOT_Y });
    }
  }
  // chain 내 mid 노드(예: R3+C1 직렬 사이의 단자 b)도 등록 — terminal_dot/라벨이 그려지도록.
  if (chainMidPositions) {
    for (const [n, p] of chainMidPositions) {
      if (!nodePositions.has(n)) nodePositions.set(n, p);
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
    // current: refs[0] = component id. 해당 component의 두 pin node 중간점에
    // 작은 화살표 + 라벨(i 등)을 그려 종속전원의 제어 변수가 어느 component를 흐르는지 표시.
    if (m.kind === "current" && m.refs.length >= 1) {
      const compId = m.refs[0];
      const comp = (netlist.components ?? []).find((c) => c.id === compId);
      if (!comp || (comp.pins ?? []).length < 2) continue;
      const pa = nodePositions.get(comp.pins[0].node);
      const pb = nodePositions.get(comp.pins[1].node);
      if (!pa || !pb) continue;
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const isHorizontal = Math.abs(pa.x - pb.x) > Math.abs(pa.y - pb.y);
      const COLOR = "#dc2626";
      if (isHorizontal) {
        // horizontal component: 위쪽에 좌→우 화살표 + 라벨
        const arrowY = my - 16;
        svg += `<path d="M ${mx - 14} ${arrowY} L ${mx + 14} ${arrowY}" stroke="${COLOR}" stroke-width="1.5" fill="none"/>`;
        svg += `<path d="M ${mx + 14} ${arrowY} L ${mx + 9} ${arrowY - 4} M ${mx + 14} ${arrowY} L ${mx + 9} ${arrowY + 4}" stroke="${COLOR}" stroke-width="1.5" fill="none"/>`;
        svg += `<text x="${mx}" y="${arrowY - 6}" text-anchor="middle" font-size="13" font-weight="700" fill="${COLOR}">${escapeSvg(m.label)}</text>`;
      } else {
        // vertical component: 우측에 위→아래 화살표 + 라벨
        const arrowX = mx + 18;
        svg += `<path d="M ${arrowX} ${my - 14} L ${arrowX} ${my + 14}" stroke="${COLOR}" stroke-width="1.5" fill="none"/>`;
        svg += `<path d="M ${arrowX} ${my + 14} L ${arrowX - 4} ${my + 9} M ${arrowX} ${my + 14} L ${arrowX + 4} ${my + 9}" stroke="${COLOR}" stroke-width="1.5" fill="none"/>`;
        svg += `<text x="${arrowX + 6}" y="${my + 5}" font-size="13" font-weight="700" fill="${COLOR}">${escapeSvg(m.label)}</text>`;
      }
    }
  }

  return svg;
}

/**
 * Overlay 경로 라우팅 — start→end 점선 path를 obstacle 회피로 그림.
 *  Rule-2 (wireAvoidsComponentBody): 회로 본체 통과 없이 **최단거리** 우회.
 *
 *  candidate 후보:
 *   - L-자 (수직 후 수평)
 *   - ANNO_BAND_Y 우회 (위→옆→아래)
 *   - 좌측 외곽 우회 (회로 좌측 column으로 우회 후 위→옆→아래)
 *   - 우측 외곽 우회
 *  모든 segment가 obstacle 미통과 candidate들 중 segment 길이 합이 최소인 path 선택.
 *  통과 가능 후보가 없으면 ANNO_BAND_Y 우회를 fallback (시각 깨짐 허용).
 */
function routeOverlayPath(
  x1: number, y1: number, x2: number, y2: number,
  obstacles: Bbox[],
  color: string,
): string {
  const dashed = (path: string) =>
    `<path d="${path}" stroke="${color}" fill="none" stroke-width="1.2" stroke-dasharray="3,3"/>`;

  const segOk = (sx: number, sy: number, ex: number, ey: number) =>
    !obstacles.some((o) => segmentIntersectsBbox(sx, sy, ex, ey, o));

  // path = [[x,y], ...]. segment 길이 합 계산.
  const pathLen = (pts: Array<[number, number]>): number => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
    }
    return len;
  };
  const toD = (pts: Array<[number, number]>): string =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");

  // 각 candidate path를 모든 segment OK 체크 후 등록
  const candidates: { pts: Array<[number, number]>; len: number }[] = [];
  const add = (pts: Array<[number, number]>) => {
    for (let i = 1; i < pts.length; i++) {
      if (!segOk(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])) return;
    }
    candidates.push({ pts, len: pathLen(pts) });
  };

  const detourY = Math.min(ANNO_BAND_Y, y2);

  // L-자
  add([[x1, y1], [x1, y2], [x2, y2]]);
  // ANNO_BAND_Y 직 우회
  add([[x1, y1], [x1, detourY], [x2, detourY], [x2, y2]]);
  // 좌·우 외곽 우회 — obstacle bbox의 xMin/xMax + 24 column 사용
  const xs = obstacles.flatMap((o) => [o.x, o.x + o.w]);
  if (xs.length > 0) {
    const xLeftDetour = Math.min(...xs) - 24;
    const xRightDetour = Math.max(...xs) + 24;
    add([[x1, y1], [xLeftDetour, y1], [xLeftDetour, detourY], [x2, detourY], [x2, y2]]);
    add([[x1, y1], [xRightDetour, y1], [xRightDetour, detourY], [x2, detourY], [x2, y2]]);
  }

  // 최단거리 candidate 선택
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.len - b.len);
    return dashed(toD(candidates[0].pts));
  }

  // Fallback (모든 candidate가 obstacle 통과)
  return dashed(toD([[x1, y1], [x1, detourY], [x2, detourY], [x2, y2]]));
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
