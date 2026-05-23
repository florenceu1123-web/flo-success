/**
 * Parallel branch lane routing — 같은 두 semantic node 사이 여러 edge를 독립 rail로.
 *
 *   현재 단순 offset 렌더링:
 *     같은 라인 위에 component 두 개를 stack — 시각적 겹침 위험.
 *   바뀐 구조:
 *     각 parallel edge가 ★ 독립 horizontal rail ★ — semantic node에서 분기되는
 *     stub → lane rail → 도착 stub의 path. lane offset은 lane index 기반.
 *
 *   Routing path는 bend point들로 구성. bend point는 ★ semantic이 아닌 transient ★.
 *
 *   파이프라인:
 *     groupEdgesByNodePair → assignLanes → 각 edge에 path 부여 → render
 */

import type { Edge, Node } from "./semanticRender";
import { groupEdgesByNodePair } from "./groupEdgesByNodePair";

/** 2D 좌표. */
export type Point = { readonly x: number; readonly y: number };

/**
 * RoutedEdge — semantic edge에 시각 routing 정보 부여.
 *   path는 from.position부터 to.position까지 bend point를 거치는 polyline.
 *   path 길이 ≥ 2 (시작·끝점 최소).
 */
export type RoutedEdge = {
  readonly edgeId: string;
  readonly from: string;
  readonly to: string;
  /** 0-base lane index — parallel group 내 위치. 단일 edge는 0. */
  readonly laneIndex: number;
  /** lane의 본선 offset (수평이면 y 오프셋, 수직이면 x 오프셋). 단일 lane은 0. */
  readonly laneOffset: number;
  /** routing polyline. path[0] = from anchor, path[last] = to anchor. */
  readonly path: readonly Point[];
};

/** Routing 방향 — horizontal(top rail 위)이냐 vertical(leg)이냐 결정. */
export type RouteOrientation = "horizontal" | "vertical";

/** Lane pitch — parallel edge 사이 시각 분리 거리. */
const LANE_PITCH = 48;

/**
 * 같은 group 내 lane offset 계산 — 대칭 stack.
 *   N=1: [0]
 *   N=2: [-LANE_PITCH/2, +LANE_PITCH/2]
 *   N=3: [-LANE_PITCH, 0, +LANE_PITCH]
 *   N=k: (i - (k-1)/2) * LANE_PITCH / max(1, ceil((k-1)/2))
 *   → 결국 (i - (k-1)/2) * LANE_PITCH/2 도 가능. 여기서는 단순 ±half pitch.
 */
function laneOffsetForIndex(i: number, count: number): number {
  if (count <= 1) return 0;
  if (count === 2) return i === 0 ? -LANE_PITCH / 2 : LANE_PITCH / 2;
  // N≥3: 균등 stack
  const half = (count - 1) / 2;
  return (i - half) * LANE_PITCH;
}

/**
 * Route edges — 같은 node pair 그룹화 + lane 할당 + path 계산.
 *
 *   nodePos: semantic node id → 2D 좌표 매핑 (renderer가 제공)
 *   orientation: 같은 그룹의 routing 방향 — "horizontal"이면 path는 좌→우, lane offset은 y.
 *
 *   path 구성 (horizontal):
 *     (fromX, fromY) → (fromX, fromY + offset) → (toX, toY + offset) → (toX, toY)
 *     offset=0이면 직선: (fromX, fromY) → (toX, toY)
 *   path 구성 (vertical):
 *     (fromX, fromY) → (fromX + offset, fromY) → (fromX + offset, toY) → (toX, toY)
 */
export function routeEdges(
  edges: readonly Edge[],
  nodePos: Readonly<Record<string, Point>>,
  orientation: RouteOrientation = "horizontal",
): RoutedEdge[] {
  const groups = groupEdgesByNodePair(
    edges.map((e) => ({ a: e.from, b: e.to, original: e })),
  );
  const result: RoutedEdge[] = [];
  for (const [, group] of groups) {
    const count = group.length;
    group.forEach((g, laneIndex) => {
      const e = g.original;
      const from = nodePos[e.from];
      const to = nodePos[e.to];
      if (!from || !to) return;
      const offset = laneOffsetForIndex(laneIndex, count);
      const path = buildPath(from, to, offset, orientation);
      result.push({
        edgeId: e.id,
        from: e.from,
        to: e.to,
        laneIndex,
        laneOffset: offset,
        path,
      });
    });
  }
  return result;
}

function buildPath(
  from: Point,
  to: Point,
  offset: number,
  orientation: RouteOrientation,
): Point[] {
  if (offset === 0) return [from, to];
  if (orientation === "horizontal") {
    return [
      from,
      { x: from.x, y: from.y + offset },
      { x: to.x, y: to.y + offset },
      to,
    ];
  }
  return [
    from,
    { x: from.x + offset, y: from.y },
    { x: to.x + offset, y: to.y },
    to,
  ];
}

/**
 * Bend point 좌표 — path의 양 끝점 사이 중간점들.
 *   각 bend point는 임의 id ("__bend_<edgeId>_<i>") + semantic:false + transient:true.
 *   RenderGraph 노드 list에 추가 가능 (semantic node에는 추가하지 않음).
 */
export function bendPointsOf(re: RoutedEdge): Array<Node & { x: number; y: number }> {
  // path[0]과 path[last]는 semantic node anchor (별도 노드 아님)
  if (re.path.length <= 2) return [];
  const points = re.path.slice(1, -1);
  return points.map((p, i) => ({
    id: `__bend_${re.edgeId}_${i}`,
    semantic: false as const,
    transient: true as const,
    x: p.x,
    y: p.y,
  }));
}

