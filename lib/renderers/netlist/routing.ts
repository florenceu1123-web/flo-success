import type { GraphNet, Point } from "./graph";
import { getPinPoint, type RenderNode } from "./layout";

export type RenderWire = {
  node: string;
  points: Point[];
};

export type RenderDot = {
  node: string;
  point: Point;
};

/**
 * Spec 4 — net 단위 wire 라우팅.
 *  - 같은 net의 pin이 2개 → 직접 직각 wire
 *  - 3개 이상 → junction point로 모아서 분기 + dot
 *  - net pin이 1개면 dangling이므로 wire를 만들지 않음 (validator가 잡음)
 */
export function routeNets(
  nets: GraphNet[],
  renderNodes: RenderNode[]
): { wires: RenderWire[]; dots: RenderDot[] } {
  const nodeMap = new Map(renderNodes.map((n) => [n.component.id, n]));

  const wires: RenderWire[] = [];
  const dots: RenderDot[] = [];

  for (const net of nets) {
    const pinPoints: Point[] = [];

    for (const ref of net.pins) {
      const compNode = nodeMap.get(ref.componentId);
      if (!compNode) continue;

      const pin = compNode.component.pins.find((p) => p.id === ref.pinId);
      if (!pin) continue;

      pinPoints.push(getPinPoint(compNode, pin));
    }

    if (pinPoints.length < 2) continue;

    if (pinPoints.length === 2) {
      wires.push({
        node: net.node,
        points: orthogonal(pinPoints[0], pinPoints[1]),
      });
      continue;
    }

    const junction = chooseJunctionPoint(pinPoints);
    dots.push({ node: net.node, point: junction });

    for (const p of pinPoints) {
      wires.push({
        node: net.node,
        points: orthogonal(p, junction),
      });
    }
  }

  return { wires, dots };
}

function chooseJunctionPoint(points: Point[]): Point {
  const avgX = points.reduce((s, p) => s + p.x, 0) / points.length;
  const avgY = points.reduce((s, p) => s + p.y, 0) / points.length;

  return {
    x: Math.round(avgX / 20) * 20,
    y: Math.round(avgY / 20) * 20,
  };
}

/** 동일 y의 두 pin이 멀리 있으면 component 라인 아래로 detour. 그 외엔 표준 manhattan. */
const SAME_Y_TOL = 2;
const DETOUR_THRESHOLD = 220; // 이 거리(px)를 넘는 동일-y wire는 detour
const DETOUR_OFFSET = 80;     // 아래로 얼마나 내릴지

function orthogonal(a: Point, b: Point): Point[] {
  if (Math.abs(a.y - b.y) <= SAME_Y_TOL) {
    if (Math.abs(a.x - b.x) > DETOUR_THRESHOLD) {
      const detourY = a.y + DETOUR_OFFSET;
      return [
        a,
        { x: a.x, y: detourY },
        { x: b.x, y: detourY },
        b,
      ];
    }
    return [a, b];
  }
  const midX = (a.x + b.x) / 2;
  return [
    a,
    { x: midX, y: a.y },
    { x: midX, y: b.y },
    b,
  ];
}
