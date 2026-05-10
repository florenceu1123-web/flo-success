import type { CircuitComponent, CircuitNetlist, ComponentPin, PinSide } from "@/types";
import type { Point } from "./graph";
import { computeNodePositions } from "./nodePositions";
import { analyzeTopology } from "./topology";

/** spec 7·8 RenderNode */
export type RenderNode = {
  component: CircuitComponent;
  x: number;
  y: number;
  width: number;
  height: number;
};

const DEFAULT_W = 70;
const DEFAULT_H = 60;

const TYPE_SIZE: Partial<Record<CircuitComponent["type"], { w: number; h: number }>> = {
  V: { w: 60, h: 60 },
  I: { w: 60, h: 60 },
  VCCS: { w: 60, h: 60 },
  VCVS: { w: 60, h: 60 },
  CCCS: { w: 60, h: 60 },
  CCVS: { w: 60, h: 60 },
  R: { w: 80, h: 40 },
  C: { w: 60, h: 40 },
  L: { w: 80, h: 40 },
  D: { w: 60, h: 40 },
  SW: { w: 70, h: 30 },
  BJT: { w: 80, h: 80 },
  MOSFET: { w: 80, h: 80 },
  OPAMP: { w: 90, h: 70 },
  GND: { w: 30, h: 30 },
};

/**
 * Graph topology 기반 레이아웃.
 *  1) computeNodePositions로 node 좌표 결정 (chain은 가로, branch는 BFS 레벨)
 *  2) 각 component를 두 pin node anchor 사이에 배치 (수평/수직 자동)
 *  3) 다중-pin component는 첫 두 pin 기준 (그 외는 fallback grid)
 */
export function layoutComponents(netlist: CircuitNetlist): RenderNode[] {
  const topology = analyzeTopology(netlist);
  const nodePos = computeNodePositions(netlist, topology);

  const fallbackOrigin = { x: 60, y: 200 };
  const fallbackPitch = 120;

  return netlist.components.map((c, idx) => {
    const size = TYPE_SIZE[c.type] ?? { w: DEFAULT_W, h: DEFAULT_H };

    if (c.pins && c.pins.length >= 2) {
      const a = nodePos.get(c.pins[0].node);
      const b = nodePos.get(c.pins[1].node);
      if (a && b) {
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        return {
          component: c,
          x: cx - size.w / 2,
          y: cy - size.h / 2,
          width: size.w,
          height: size.h,
        };
      }
    }

    // multi-pin or unknown nodes — fallback grid
    return {
      component: c,
      x: fallbackOrigin.x + idx * fallbackPitch,
      y: fallbackOrigin.y + 220,
      width: size.w,
      height: size.h,
    };
  });
}

/** 핀의 절대 좌표. side에 따라 component 박스 둘레의 중점을 계산. 같은 side에 다중 pin이면 균등분포. */
export function getPinPoint(node: RenderNode, pin: ComponentPin): Point {
  const { x, y, width, height, component } = node;

  const sameSide = component.pins.filter((p) => p.side === pin.side);
  const idx = sameSide.findIndex((p) => p.id === pin.id);
  const total = Math.max(sameSide.length, 1);
  const t = (idx + 1) / (total + 1);

  return pinPointForSide(pin.side, x, y, width, height, t);
}

function pinPointForSide(side: PinSide, x: number, y: number, w: number, h: number, t: number): Point {
  switch (side) {
    case "left":   return { x: x,         y: y + h * t };
    case "right":  return { x: x + w,     y: y + h * t };
    case "top":    return { x: x + w * t, y: y };
    case "bottom": return { x: x + w * t, y: y + h };
  }
}
