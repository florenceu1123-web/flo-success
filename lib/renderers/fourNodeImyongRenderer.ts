/**
 * DC ladder layout — N-column 일반화. universal_dc 핵심 layout.
 *
 *  사용자 명시 제약 (4-노드 imyong 10번 형식에서 시작 → N-노드 일반화):
 *   1) V 소스의 +단자(VS_PLUS)와 GND를 같은 세로선에 두지 말 것
 *   2) 측정 노드들은 좌→우로 컬럼 정렬, V 소스는 가장 좌측 외부 컬럼
 *   3) GND symbol은 중앙 아래
 *   4) V 소스는 좌측 leg vertical full-height + bottom rail wire로 GND 연결
 *   5) 평행 horizontal branches는 같은 두 노드 사이에서 ±offset stack
 *
 *  알고리즘:
 *   - V 소스 식별 (+단자 non-GND, −단자 GND).
 *   - horizontal branch(양 단자 non-GND) walk로 column 순서 결정.
 *   - 각 top node는 한 column (LEFT_X + i × COL_PITCH).
 *   - bottom row는 wire-only(전기적으로 GND 동일), GND symbol은 중앙.
 *   - vertical leg(한 pin GND)는 해당 column에 full-height 배치.
 *   - 같은 두 top 노드 사이 horizontal branches는 canonicalPair로 그룹핑 후 offset stack.
 *
 *  V 소스 +단자가 GND가 아니면 트리거 → 단순 V↔GND 회로엔 다른 layout 사용.
 */

import type { CircuitComponent, CircuitNetlist, NodeAnnotation } from "@/types";
import { renderComponentOnEdge } from "./netlistEdgeRenderer";
import { canonicalPair } from "@/lib/graph/groupEdgesByNodePair";
import { routeEdges, type RoutedEdge } from "@/lib/graph/routeEdges";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);

const LEFT_X = 120;
const COL_PITCH = 200;
const TOP_Y = 80;
const BOT_Y = 360;
const HALF = 28;

/**
 * DC ladder pattern 감지.
 *
 *  조건:
 *   - V 소스 정확히 1개 (양 단자 non-GND, 정확히 +단자가 non-GND)
 *   - non-GND 노드 ≥ 2 (단순 V↔GND 회로 제외)
 *   - 모든 horizontal branch가 connected (top rail이 하나의 path)
 */
export function detectFourNodeImyong(netlist: CircuitNetlist): null | {
  columns: string[];     // 좌→우 column 순서 (V 소스 +단자가 0)
  ground: string;
  vSource: CircuitComponent;
} {
  const ground = netlist.ground ?? "GND";
  const isGnd = (n: string) => GROUND_LABELS.has(n) || n === ground;

  // V 소스 식별.
  const vSources = netlist.components.filter((c) => c.type === "V");
  if (vSources.length !== 1) return null;
  const vSrc = vSources[0];
  if (vSrc.pins.length < 2) return null;
  const [vPin1, vPin2] = vSrc.pins;
  const vPositive =
    vPin1.role === "positive" ? vPin1 :
    vPin2.role === "positive" ? vPin2 :
    vPin1;
  const vNegative = vPositive === vPin1 ? vPin2 : vPin1;
  if (isGnd(vPositive.node)) return null;  // V·+가 GND면 다른 패턴
  if (!isGnd(vNegative.node)) return null;  // V·−가 GND가 아니면 floating
  const vsPlus = vPositive.node;

  // non-GND 노드 수집.
  const nonGndNodes = new Set<string>();
  for (const c of netlist.components) {
    for (const p of c.pins) {
      if (!isGnd(p.node)) nonGndNodes.add(p.node);
    }
  }
  if (nonGndNodes.size < 2) return null;  // V↔GND 단독 회로는 별도 처리

  // horizontal adjacency (non-GND↔non-GND, V 소스 제외).
  const adj = new Map<string, Set<string>>();
  for (const c of netlist.components) {
    if (c.pins.length < 2) continue;
    const [p1, p2] = c.pins;
    if (isGnd(p1.node) || isGnd(p2.node)) continue;
    if (c.type === "V") continue;
    if (!adj.has(p1.node)) adj.set(p1.node, new Set());
    if (!adj.has(p2.node)) adj.set(p2.node, new Set());
    adj.get(p1.node)!.add(p2.node);
    adj.get(p2.node)!.add(p1.node);
  }

  // VS_PLUS에서 시작하는 BFS path — top rail이 하나의 connected component.
  if (!adj.has(vsPlus)) return null;  // V·+가 horizontal 연결 없음
  const visited = new Set<string>([vsPlus]);
  const columns: string[] = [vsPlus];
  // 단순 walk — degree=1 endpoint까지. 분기가 있으면 longest path 우선.
  let current = vsPlus;
  while (true) {
    const neighbors = [...(adj.get(current) ?? [])].filter((n) => !visited.has(n));
    if (neighbors.length === 0) break;
    // 분기 시 가장 다음 단계 connection이 많은 노드 우선 — heuristic.
    neighbors.sort((a, b) => (adj.get(b)?.size ?? 0) - (adj.get(a)?.size ?? 0));
    const next = neighbors[0];
    visited.add(next);
    columns.push(next);
    current = next;
  }
  // 미방문 non-GND가 있으면 (branch 가지 등) 일단 append — column 순서로 fallback.
  for (const n of nonGndNodes) {
    if (!visited.has(n)) {
      columns.push(n);
      visited.add(n);
    }
  }

  if (columns.length < 2) return null;
  return { columns, ground, vSource: vSrc };
}

/**
 * Top node id → 라벨 매핑 (nodeAnnotations 우선, 없으면 표시 안 함).
 */
function labelForNode(node: string, annotations: NodeAnnotation[] | undefined): string | undefined {
  if (!annotations) return undefined;
  const ann = annotations.find((a) => a.node === node);
  return ann?.label;
}

/**
 * DC ladder renderer.
 */
export function renderFourNodeImyong(
  netlist: CircuitNetlist,
  detected: NonNullable<ReturnType<typeof detectFourNodeImyong>>,
): string {
  const { columns, ground } = detected;
  const isGnd = (n: string) => GROUND_LABELS.has(n) || n === ground;

  // 노드 좌표.
  const colX = (i: number) => LEFT_X + i * COL_PITCH;
  const colOf = (node: string) => columns.indexOf(node);
  const nodePos: Record<string, { x: number; y: number }> = {};
  columns.forEach((n, i) => {
    nodePos[n] = { x: colX(i), y: TOP_Y };
  });

  // 컴포넌트 분류.
  const horizontals: CircuitComponent[] = [];
  const verticals: CircuitComponent[] = [];
  for (const c of netlist.components) {
    if ((c.pins?.length ?? 0) < 2) continue;
    const [p1, p2] = c.pins;
    if (isGnd(p1.node) && isGnd(p2.node)) continue;
    if (!isGnd(p1.node) && !isGnd(p2.node)) horizontals.push(c);
    else verticals.push(c);
  }

  const svg: string[] = [];

  // ── 1) Bottom rail wire (leftmost column - rightmost column horizontally).
  const N = columns.length;
  svg.push(`<path d="M ${colX(0)} ${BOT_Y} L ${colX(N - 1)} ${BOT_Y}" stroke="black" stroke-width="2" fill="none"/>`);

  // ── 2) Horizontal branches — routeEdges로 lane 부여 + 독립 rail로 렌더.
  //   같은 두 노드 사이 평행 가지는 각자 horizontal rail에 (lane offset ±half-pitch)
  //   stub(semantic node → lane y) + lane rail(component body 가운데) + stub(반대편).
  type HEdge = { id: string; from: string; to: string; comp: CircuitComponent };
  const hEdges: HEdge[] = horizontals.map((c, i) => ({
    id: c.id ?? `h_${i}`,
    from: c.pins[0].node,
    to: c.pins[1].node,
    comp: c,
  }));
  const routed: RoutedEdge[] = routeEdges(hEdges, nodePos, "horizontal");
  const edgeById = new Map(hEdges.map((e) => [e.id, e]));
  for (const re of routed) {
    const e = edgeById.get(re.edgeId);
    if (!e) continue;
    // path: from anchor → (bend in) → (bend out) → to anchor.
    // offset = 0이면 [from, to] (직선), offset != 0이면 4-점 polyline.
    const pts = re.path;
    // 0~last-1 segment 별로 그림. 마지막 segment(가운데, component 들어가는 segment)는 일부 빈 공간으로.
    if (pts.length === 2) {
      // 단일 lane (offset=0) — 직선 위에 component.
      const [a, b] = pts;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      svg.push(`<rect x="${cx - HALF - 2}" y="${cy - HALF}" width="${(HALF + 2) * 2}" height="${HALF * 2}" fill="white"/>`);
      const xMin = Math.min(a.x, b.x);
      const xMax = Math.max(a.x, b.x);
      svg.push(`<path d="M ${xMin} ${cy} L ${cx - HALF} ${cy}" stroke="black" stroke-width="2" fill="none"/>`);
      svg.push(`<path d="M ${cx + HALF} ${cy} L ${xMax} ${cy}" stroke="black" stroke-width="2" fill="none"/>`);
      svg.push(renderComponentOnEdge(e.comp, { x: cx, y: cy }, "horizontal"));
    } else {
      // 4-점 polyline — stub_in + lane_rail + stub_out.
      // pts[0]=fromAnchor, pts[1]=bend_in, pts[2]=bend_out, pts[3]=toAnchor.
      const [a, bi, bo, b] = pts;
      const laneY = bi.y;
      // stubs
      svg.push(`<path d="M ${a.x} ${a.y} L ${bi.x} ${bi.y}" stroke="black" stroke-width="2" fill="none"/>`);
      svg.push(`<path d="M ${b.x} ${b.y} L ${bo.x} ${bo.y}" stroke="black" stroke-width="2" fill="none"/>`);
      // lane rail (component 양옆)
      const cx = (bi.x + bo.x) / 2;
      const cy = laneY;
      svg.push(`<rect x="${cx - HALF - 2}" y="${cy - HALF}" width="${(HALF + 2) * 2}" height="${HALF * 2}" fill="white"/>`);
      const xMin = Math.min(bi.x, bo.x);
      const xMax = Math.max(bi.x, bo.x);
      svg.push(`<path d="M ${xMin} ${cy} L ${cx - HALF} ${cy}" stroke="black" stroke-width="2" fill="none"/>`);
      svg.push(`<path d="M ${cx + HALF} ${cy} L ${xMax} ${cy}" stroke="black" stroke-width="2" fill="none"/>`);
      svg.push(renderComponentOnEdge(e.comp, { x: cx, y: cy }, "horizontal"));
    }
  }

  // ── 3) Vertical legs — full-height between top node and bottom rail.
  for (const c of verticals) {
    const top = c.pins.find((p) => !isGnd(p.node));
    if (!top) continue;
    const tp = nodePos[top.node];
    if (!tp) continue;
    const cy = (tp.y + BOT_Y) / 2;
    svg.push(`<rect x="${tp.x - HALF}" y="${cy - HALF - 2}" width="${HALF * 2}" height="${(HALF + 2) * 2}" fill="white"/>`);
    svg.push(`<path d="M ${tp.x} ${tp.y} L ${tp.x} ${cy - HALF}" stroke="black" stroke-width="2" fill="none"/>`);
    svg.push(`<path d="M ${tp.x} ${cy + HALF} L ${tp.x} ${BOT_Y}" stroke="black" stroke-width="2" fill="none"/>`);
    svg.push(renderComponentOnEdge(c, { x: tp.x, y: cy }, "vertical"));
  }

  // ── 4) Junction dots (degree ≥ 3 top 노드).
  const degree = new Map<string, number>();
  for (const c of [...horizontals, ...verticals]) {
    for (const p of c.pins) {
      degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
    }
  }
  for (const n of columns) {
    if ((degree.get(n) ?? 0) >= 3) {
      const p = nodePos[n];
      svg.push(`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="black"/>`);
    }
  }

  // ── 5) GND symbol — bottom rail 중앙.
  const gndCx = (colX(0) + colX(N - 1)) / 2;
  svg.push(`<g transform="translate(${gndCx},${BOT_Y})">
    <line x1="0" y1="0" x2="0" y2="10" stroke="black" stroke-width="2"/>
    <line x1="-10" y1="10" x2="10" y2="10" stroke="black" stroke-width="2.4"/>
    <line x1="-7" y1="14" x2="7" y2="14" stroke="black" stroke-width="2"/>
    <line x1="-3" y1="18" x2="3" y2="18" stroke="black" stroke-width="2"/>
  </g>`);

  // ── 6) Node labels — nodeAnnotations 기준. label_only 스타일은 노드 위에 텍스트.
  for (const n of columns) {
    const label = labelForNode(n, netlist.nodeAnnotations);
    if (!label) continue;
    const p = nodePos[n];
    svg.push(`<text x="${p.x + 10}" y="${p.y - 8}" font-size="14" fill="#1e3a8a" font-weight="600">${escapeSvg(label)}</text>`);
  }

  // unused — canonicalPair re-export 보존 (외부 사용 가능성).
  void canonicalPair;
  void colOf;

  const svgW = colX(N - 1) + 100;
  const svgH = BOT_Y + 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n${svg.join("\n")}\n</svg>`;
}

function escapeSvg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
