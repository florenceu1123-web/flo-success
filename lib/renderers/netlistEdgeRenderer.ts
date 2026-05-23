import type { CircuitComponent, CircuitNetlist } from "@/types";
import { CONNECTION_LAYOUT_RULES } from "@/lib/generation/branchTemplate";

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
const X_PAD = 120;
const X_PITCH = 220;   // component(R width=56, OPAMP=64) + label(±34) + node circle 여유
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
    case "OPAMP": return 32; // 삼각형 base 좌측 ±32
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
  const { edges, localGndPoints } = buildRenderEdges(netlist, positions, indexOf);

  const edgesSvg = renderEdges(edges);
  // 3-pin 이상 (OPAMP 등) — buildRenderEdges에서 skip된 component를 여기서 별도 렌더.
  // GND-attached pin은 local 위치로 wire가 그려지고 그 위치들이 multiPinGndPoints에 누적.
  const multiPinGndPoints: GroundMark[] = [];
  const multiPinSvg = netlist.components
    .filter((c) => c.pins && c.pins.length > 2)
    .map((c) => renderMultiPinComponent(c, positions, netlist.positions, multiPinGndPoints, netlist.ground))
    .join("");
  const junctions = renderJunctions(netlist, positions);
  // 분산된 GND symbol — 각 GND-attached pin 옆에 별도 표시 (단일 위치 long wire 회피).
  const grounds = renderDistributedGroundSymbols([...localGndPoints, ...multiPinGndPoints]);

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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">${edgesSvg}${multiPinSvg}${junctions}${grounds}</svg>`;
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
// Node positions — 그래프 BFS-level 기반 배치
//
//  알고리즘:
//   1. 2-pin component만으로 노드 인접 그래프 구성 (OPAMP/BJT/MOSFET 등 3+pin은 그래프에서 제외 — flow를 흐트러뜨림)
//   2. ground 노드를 root로 BFS → 각 노드에 level 부여
//   3. level → x 좌표(좌→우 흐름), 같은 level 내 다중 노드는 y 분산
//   4. ground는 bottom rail (y=380) 중앙 정렬
//
//  cascade(OPAMP 2단) 같은 회로에서 V_input → R → OPAMP_in → R → OPAMP_out → R → Vo가 좌→우로 자연스럽게.
// =====================================================================
function computeNodePositions(netlist: CircuitNetlist): {
  positions: Map<string, Point>;
  indexOf: Map<string, number>;
} {
  const groundCandidates = new Set<string>([
    ...GROUND_LABELS,
    ...(netlist.ground ? [netlist.ground] : []),
  ]);

  // ★ generator가 positions hint를 제공한 경우 그것을 우선 사용 (archetype-aware layout).
  //   BFS-level 휴리스틱은 일반 case fallback.
  if (netlist.positions && Object.keys(netlist.positions).length > 0) {
    const positions = new Map<string, Point>();
    const indexOf = new Map<string, number>();
    // 등장 순으로 인덱스 부여 (wrap 판별용)
    const seen: string[] = [];
    for (const c of netlist.components) {
      for (const p of c.pins ?? []) {
        if (!positions.has(p.node)) {
          const hint = netlist.positions[p.node];
          if (hint) positions.set(p.node, { x: hint.x, y: hint.y });
          indexOf.set(p.node, seen.length);
          seen.push(p.node);
        }
      }
    }
    // hint가 누락된 node가 있으면 falls through to BFS — 모두 있으면 즉시 반환
    const allCovered = seen.every((n) => positions.has(n));
    if (allCovered) return { positions, indexOf };
  }

  // 1. 모든 노드 수집 + 등장 순 기록 (tie-breaker로 사용)
  const allNodes = new Set<string>();
  const firstSeen = new Map<string, number>();
  for (const c of netlist.components) {
    for (const p of c.pins ?? []) {
      if (!allNodes.has(p.node)) {
        firstSeen.set(p.node, firstSeen.size);
        allNodes.add(p.node);
      }
    }
  }

  // 2. 2-pin 인접 그래프 (3+pin component인 OPAMP/BJT/MOSFET은 그래프에서 제외)
  const adj = new Map<string, Set<string>>();
  for (const c of netlist.components) {
    if (c.type === "GND") continue;
    if (!c.pins || c.pins.length !== 2) continue;
    const a = c.pins[0].node;
    const b = c.pins[1].node;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }

  // 3. BFS — ground 우선, 없으면 첫 노드
  const level = new Map<string, number>();
  const root = [...allNodes].find((n) => groundCandidates.has(n)) ?? [...allNodes][0];
  if (root !== undefined) {
    level.set(root, 0);
    const queue: string[] = [root];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const lvl = level.get(curr)!;
      for (const n of adj.get(curr) ?? []) {
        if (!level.has(n)) {
          level.set(n, lvl + 1);
          queue.push(n);
        }
      }
    }
  }
  // 분리된 sub-graph (예: OPAMP만으로 연결된 노드)는 max+1 부터
  let extraLevel = (level.size === 0 ? 0 : Math.max(...level.values())) + 1;
  for (const n of allNodes) {
    if (!level.has(n)) level.set(n, extraLevel++);
  }

  // 4. level별 그룹화 — ground는 별도
  const topByLevel = new Map<number, string[]>();
  for (const [n, lv] of level) {
    if (groundCandidates.has(n)) continue;
    if (!topByLevel.has(lv)) topByLevel.set(lv, []);
    topByLevel.get(lv)!.push(n);
  }
  // 같은 level 내 노드는 등장 순으로 정렬 (안정성)
  for (const arr of topByLevel.values()) {
    arr.sort((a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0));
  }

  // 5. x = level * X_PITCH (level 0이 ground라 top은 level 1부터 좌측에 시작)
  //    같은 level 다중 노드는 y로 +60씩 분산
  const sortedLevels = Array.from(topByLevel.keys()).sort((a, b) => a - b);
  const positions = new Map<string, Point>();
  const indexOf = new Map<string, number>();
  const ordered: string[] = [];

  sortedLevels.forEach((lv, col) => {
    const ns = topByLevel.get(lv)!;
    ns.forEach((n, i) => {
      positions.set(n, { x: X_PAD + col * X_PITCH, y: TOP_Y + i * 60 });
      indexOf.set(n, ordered.length);
      ordered.push(n);
    });
  });

  // ground node들은 bottom rail의 top 노드 X 범위 중앙
  const topXs = Array.from(positions.values()).map((p) => p.x);
  const midX = topXs.length > 0 ? (Math.min(...topXs) + Math.max(...topXs)) / 2 : X_PAD;
  let groundCol = 0;
  for (const n of allNodes) {
    if (!groundCandidates.has(n)) continue;
    positions.set(n, { x: midX + groundCol * X_PITCH, y: 380 });
    indexOf.set(n, ordered.length);
    ordered.push(n);
    groundCol++;
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
): { edges: RenderEdge[]; localGndPoints: GroundMark[] } {
  const groundLabels = new Set<string>([...GROUND_LABELS, ...(netlist.ground ? [netlist.ground] : [])]);
  const edges: RenderEdge[] = [];
  const localGndPoints: GroundMark[] = [];
  // Rule-3 lane 분리: 같은 (a,b) node pair에 여러 component(parallel)가 있으면
  // y/x offset으로 분산 — laneOffsetMinPx 간격으로 stack 인덱스 부여.
  const pairCount = new Map<string, number>();
  const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const c of netlist.components) {
    if (c.type === "GND") continue;
    if (!c.pins || c.pins.length < 2) continue;
    // 3-pin 이상 (OPAMP/BJT/MOSFET 등)은 edge 모델 부적합 — 별도 renderMultiPinComponent에서 처리.
    if (c.pins.length > 2) continue;
    const [p1, p2] = c.pins;
    let start = positions.get(p1.node);
    let end = positions.get(p2.node);
    if (!start || !end) continue;

    // ★ GND-attached: GND endpoint를 component 옆 local 위치로 (단일 위치 long wire 회피).
    const p1IsGnd = groundLabels.has(p1.node);
    const p2IsGnd = groundLabels.has(p2.node);
    if (p1IsGnd && !p2IsGnd) {
      const localGnd: GroundMark = { x: end.x, y: end.y + 100 };
      localGndPoints.push(localGnd);
      start = localGnd;
    } else if (p2IsGnd && !p1IsGnd) {
      const localGnd: GroundMark = { x: start.x, y: start.y + 100 };
      localGndPoints.push(localGnd);
      end = localGnd;
    }

    // Rule-3 — same node-pair multi-component lane offset
    const key = pairKey(p1.node, p2.node);
    const stackIdx = pairCount.get(key) ?? 0;
    pairCount.set(key, stackIdx + 1);
    if (stackIdx > 0) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const isHorizontal = Math.abs(dx) > Math.abs(dy);
      const off = CONNECTION_LAYOUT_RULES.laneOffsetMinPx * 2 * stackIdx;
      // horizontal pair는 y 분산, vertical pair는 x 분산
      if (isHorizontal) {
        start = { x: start.x, y: start.y + off };
        end = { x: end.x, y: end.y + off };
      } else {
        start = { x: start.x + off, y: start.y };
        end = { x: end.x + off, y: end.y };
      }
    }

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
  return { edges, localGndPoints };
}

/**
 * 3-pin 이상 component (OPAMP/BJT/MOSFET 등)를 위한 별도 렌더.
 *  - body 위치는 pin centroid
 *  - 각 pin → body 외곽까지 orthogonal wire (body 내부에 wire 그리지 않음 → fill="white"가 wire 가리지 않게)
 *  - OPAMP 한정: pins[0,1]은 left 입력측(cx-32), pins[2]는 right 출력측(cx+32). body symbol 좌·우와 일치.
 */
function renderMultiPinComponent(
  c: CircuitComponent,
  positions: Map<string, Point>,
  componentPositions?: Record<string, { x: number; y: number }>,
  outLocalGndPoints?: GroundMark[],
  groundNodeId?: string,
): string {
  if (!c.pins || c.pins.length < 3) return "";
  // pin → 좌표 매핑 (각 pin 따라 GND-attach 여부 추적용으로 따로 보관)
  const groundLabels = new Set<string>([...GROUND_LABELS, ...(groundNodeId ? [groundNodeId] : [])]);
  const pinInfo = c.pins.map((p) => ({
    node: p.node,
    isGnd: groundLabels.has(p.node),
    pt: positions.get(p.node),
  }));
  const pinPoints = pinInfo.map((pi) => pi.pt).filter((p): p is Point => !!p);
  if (pinPoints.length < 3) return "";

  // body 위치 — generator hint(componentPositions[c.id]) 우선, 없으면 pin centroid.
  const hint = componentPositions?.[c.id];
  const cx = hint?.x ?? pinPoints.reduce((s, p) => s + p.x, 0) / pinPoints.length;
  const cy = hint?.y ?? pinPoints.reduce((s, p) => s + p.y, 0) / pinPoints.length;

  const isOpamp = c.type === "OPAMP";
  // OPAMP는 body(±32) + pin stub(16) = 외부 dot at ±48. wire는 dot까지.
  const bodyHalf = 32;
  const stubLen = 16;
  const opampOutX = bodyHalf + stubLen;   // 48

  // 각 pin → stub dot(또는 body 외곽) wire. OPAMP는 입력/출력 방향에 맞춰 좌·우 분리.
  // ★ GND-attached pin은 wire를 멀리 단일 GND까지 끌지 않고 stub dot에서 짧게 끝낸 뒤 local GND symbol.
  let wires = "";
  pinInfo.forEach((pi, idx) => {
    if (!pi.pt) return;
    let endX: number;
    let endY: number;
    if (isOpamp) {
      if (idx < 2) {
        endX = cx - opampOutX;
        endY = cy + (idx === 0 ? -OPAMP_PIN_DY : OPAMP_PIN_DY);
      } else {
        endX = cx + opampOutX;
        endY = cy;
      }
    } else {
      endX = pi.pt.x < cx ? cx - bodyHalf : cx + bodyHalf;
      endY = cy;
    }
    if (pi.isGnd) {
      // GND pin: pin이 향하는 방향(상단=up / 하단=down)으로 GND symbol.
      const goesUp = endY < cy;
      const dy = goesUp ? -30 : 30;
      const gndPt: GroundMark = { x: endX, y: endY + dy, up: goesUp };
      outLocalGndPoints?.push(gndPt);
      wires += `<path d="M ${endX} ${endY} L ${gndPt.x} ${gndPt.y}" stroke="black" fill="none" stroke-width="2"/>`;
    } else {
      // ★ OPAMP 입력(idx<2): vp(+)는 위쪽 lane, vn(−)은 아래쪽 lane으로 wire 분리 — 두 입력이
      //   서로 다른 node에 연결되어 있을 때 겹쳐 보이는 것을 방지.
      //   두 입력이 같은 node에 연결된 케이스(드물지만 voltage_follower 등)는 일반 라우팅.
      const vpNode = pinInfo[0]?.node;
      const vnNode = pinInfo[1]?.node;
      const sameInputs = isOpamp && vpNode === vnNode;
      if (isOpamp && idx < 2 && !sameInputs) {
        const laneOffset = idx === 0 ? -30 : 30;   // vp 위쪽, vn 아래쪽
        const laneY = endY + laneOffset;
        wires += `<path d="M ${endX} ${endY} L ${endX} ${laneY} L ${pi.pt.x} ${laneY} L ${pi.pt.x} ${pi.pt.y}" stroke="black" fill="none" stroke-width="2"/>`;
      } else {
        wires += `<path d="M ${pi.pt.x} ${pi.pt.y} L ${endX} ${pi.pt.y} L ${endX} ${endY}" stroke="black" fill="none" stroke-width="2"/>`;
      }
    }
  });

  // body symbol — renderComponentOnEdge가 OPAMP 케이스 처리.
  const body = renderComponentOnEdge(c, { x: cx, y: cy }, "horizontal");

  return wires + body;
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
/**
 * Junction dot 렌더 — CONNECTION_LAYOUT_RULES.Rule-7 구현.
 *   - degree ≥ junctionDotOnDegreeAtLeast (=3): T-junction/fan-out → dot 표시 (같은 net임을 의미)
 *   - degree = 2 node: 단순 corner 또는 wire 통과 → dot 안 찍음
 *   - cross-over (별개 net의 교차)는 wire 끊김으로 표현되어 자동으로 dot 없음.
 */
function renderJunctions(netlist: CircuitNetlist, nodePos: Map<string, Point>): string {
  const degree = new Map<string, number>();
  for (const c of netlist.components) {
    for (const p of c.pins ?? []) {
      degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
    }
  }
  let svg = "";
  for (const [node, d] of degree) {
    if (d >= CONNECTION_LAYOUT_RULES.junctionDotOnDegreeAtLeast) {
      const pos = nodePos.get(node);
      if (pos) svg += `<circle cx="${pos.x}" cy="${pos.y}" r="3.5" fill="black"/>`;
    }
  }
  return svg;
}

/** GND 표시 위치 + 방향. up=true면 wire가 위로 가고 symbol이 거꾸로 (위로 향함). */
type GroundMark = { x: number; y: number; up?: boolean };

function renderDistributedGroundSymbols(points: GroundMark[]): string {
  let svg = "";
  for (const p of points) {
    const f = p.up ? -1 : 1;
    svg += `<g transform="translate(${p.x},${p.y})">
  <line x1="0" y1="0" x2="0" y2="${10 * f}" stroke="black" stroke-width="2"/>
  <line x1="-10" y1="${10 * f}" x2="10" y2="${10 * f}" stroke="black" stroke-width="2.4"/>
  <line x1="-7" y1="${14 * f}" x2="7" y2="${14 * f}" stroke="black" stroke-width="2"/>
  <line x1="-3" y1="${18 * f}" x2="3" y2="${18 * f}" stroke="black" stroke-width="2"/>
</g>`;
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
    case "OPAMP": return renderOpamp(c, cx, cy);
    case "WIRE": return ""; // 0-symbol — surrounding wire가 곧장 연결
    default:   return renderInlineBox(c, cx, cy, orientation);
  }
}

/**
 * OPAMP 표준 삼각형 심볼 — body 외부에 명시적 pin stub(짧은 가로선 + terminal dot).
 *  - vp(+, 좌측 상단): body 좌면(cx-32, cy-14)에서 외부(cx-48)까지 stub + dot
 *  - vn(−, 좌측 하단): body 좌면(cx-32, cy+14)에서 외부(cx-48)까지 stub + dot
 *  - vo (우측 tip): body 우면(cx+32, cy)에서 외부(cx+48)까지 stub + dot
 *  node wire는 dot 위치에서 끝나야 함 (renderMultiPinComponent의 endpoint와 동일).
 */
const OPAMP_BODY_HALF = 32;
const OPAMP_PIN_STUB = 16;
const OPAMP_PIN_DY = 14;
function renderOpamp(c: CircuitComponent, cx: number, cy: number): string {
  const path = `M ${cx - OPAMP_BODY_HALF} ${cy - 28} L ${cx - OPAMP_BODY_HALF} ${cy + 28} L ${cx + OPAMP_BODY_HALF} ${cy} Z`;
  const pinDotX_left = cx - OPAMP_BODY_HALF - OPAMP_PIN_STUB;
  const pinDotX_right = cx + OPAMP_BODY_HALF + OPAMP_PIN_STUB;
  const stubs =
    // vp(+) pin stub: 좌측 상단
    `<path d="M ${cx - OPAMP_BODY_HALF} ${cy - OPAMP_PIN_DY} L ${pinDotX_left} ${cy - OPAMP_PIN_DY}" stroke="black" fill="none" stroke-width="2"/>` +
    `<circle cx="${pinDotX_left}" cy="${cy - OPAMP_PIN_DY}" r="2.5" fill="black"/>` +
    // vn(−) pin stub: 좌측 하단
    `<path d="M ${cx - OPAMP_BODY_HALF} ${cy + OPAMP_PIN_DY} L ${pinDotX_left} ${cy + OPAMP_PIN_DY}" stroke="black" fill="none" stroke-width="2"/>` +
    `<circle cx="${pinDotX_left}" cy="${cy + OPAMP_PIN_DY}" r="2.5" fill="black"/>` +
    // vo pin stub: 우측 tip
    `<path d="M ${cx + OPAMP_BODY_HALF} ${cy} L ${pinDotX_right} ${cy}" stroke="black" fill="none" stroke-width="2"/>` +
    `<circle cx="${pinDotX_right}" cy="${cy}" r="2.5" fill="black"/>`;
  return (
    stubs +
    `<path d="${path}" stroke="black" fill="white" stroke-width="2"/>` +
    `<text x="${cx - 22}" y="${cy - 10}" text-anchor="middle" font-size="14">+</text>` +
    `<text x="${cx - 22}" y="${cy + 18}" text-anchor="middle" font-size="14">−</text>` +
    `<text x="${cx}" y="${cy - 36}" text-anchor="middle" font-size="11" fill="#1e3a8a" font-weight="600">${escapeSvg(c.id)}</text>`
  );
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
  // 가변 저항 (rheostat): value가 정확히 "R" (universal pipeline의 가변 R 표기)이면 사선 화살표 추가.
  const isVariable = String(c.value ?? "").trim() === "R";
  if (orientation === "horizontal") {
    const path = `M ${cx - 28} ${cy} L ${cx - 21} ${cy - 10} L ${cx - 9} ${cy + 10} L ${cx + 3} ${cy - 10} L ${cx + 15} ${cy + 10} L ${cx + 24} ${cy - 8} L ${cx + 28} ${cy}`;
    let svg = `<path d="${path}" stroke="black" fill="none" stroke-width="2"/>`;
    if (isVariable) {
      // 사선 화살표 — 좌하→우상 (IEEE rheostat convention)
      svg += `<defs><marker id="rheoArrow_${c.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="black"/></marker></defs>`;
      svg += `<line x1="${cx - 18}" y1="${cy + 14}" x2="${cx + 18}" y2="${cy - 14}" stroke="black" stroke-width="1.5" marker-end="url(#rheoArrow_${c.id})"/>`;
    }
    return svg + labelsOnEdge(c, cx, cy, orientation);
  }
  const path = `M ${cx} ${cy - 28} L ${cx - 10} ${cy - 21} L ${cx + 10} ${cy - 9} L ${cx - 10} ${cy + 3} L ${cx + 10} ${cy + 15} L ${cx - 8} ${cy + 24} L ${cx} ${cy + 28}`;
  let svg = `<path d="${path}" stroke="black" fill="none" stroke-width="2"/>`;
  if (isVariable) {
    // 수직 저항용 사선 화살표 — 좌하→우상
    svg += `<defs><marker id="rheoArrow_${c.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="black"/></marker></defs>`;
    svg += `<line x1="${cx - 14}" y1="${cy + 18}" x2="${cx + 14}" y2="${cy - 18}" stroke="black" stroke-width="1.5" marker-end="url(#rheoArrow_${c.id})"/>`;
  }
  return svg + labelsOnEdge(c, cx, cy, orientation);
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
