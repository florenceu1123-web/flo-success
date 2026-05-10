import type { CircuitComponent, CircuitNetlist } from "@/types";
import type { RenderNode } from "./layout";

/** Pattern-별 안전한 template layout 모음. 모두 (netlist, scale) → RenderNode[] 시그니처. */

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

function sizeOf(type: CircuitComponent["type"]) {
  return TYPE_SIZE[type] ?? { w: DEFAULT_W, h: DEFAULT_H };
}

/** series chain — 한 행에 좌→우 일정 간격으로 정렬. */
export function layoutSeriesChain(netlist: CircuitNetlist, scale: number): RenderNode[] {
  const PITCH = Math.round(160 * scale);
  const Y = 100;
  const X0 = 80;
  return netlist.components.map((c, i) => {
    const sz = sizeOf(c.type);
    const cx = X0 + i * PITCH;
    return {
      component: c,
      x: cx - sz.w / 2,
      y: Y - sz.h / 2,
      width: sz.w,
      height: sz.h,
    };
  });
}

/** ladder / parallel branches — 두 rail (top·bottom) 사이에 component를 세로로 균등 배치. */
export function layoutLadderNetwork(netlist: CircuitNetlist, scale: number): RenderNode[] {
  const PITCH_X = Math.round(140 * scale);
  const ROW_H = Math.round(120 * scale);
  const X0 = 80;
  const Y_TOP = 80;
  const cols = Math.max(netlist.components.length, 1);
  return netlist.components.map((c, i) => {
    const sz = sizeOf(c.type);
    const cx = X0 + i * PITCH_X;
    const cy = Y_TOP + ROW_H / 2;
    return {
      component: c,
      x: cx - sz.w / 2,
      y: cy - sz.h / 2,
      width: sz.w,
      height: sz.h,
    };
  });
  void cols;
}

/** source-resistor network — source 좌측 1개, R/L/C/D 순으로 우측 일렬. */
export function layoutSourceResistorNetwork(netlist: CircuitNetlist, scale: number): RenderNode[] {
  const PITCH = Math.round(150 * scale);
  const Y = 110;
  const X0 = 80;

  // 정렬: source 먼저, 그 다음 나머지 순
  const sources = netlist.components.filter((c) => c.type === "V" || c.type === "I");
  const others = netlist.components.filter((c) => !(c.type === "V" || c.type === "I"));
  const ordered = [...sources, ...others];

  const positionById = new Map<string, { x: number; y: number }>();
  ordered.forEach((c, i) => {
    const sz = sizeOf(c.type);
    const cx = X0 + i * PITCH;
    positionById.set(c.id, { x: cx - sz.w / 2, y: Y - sz.h / 2 });
  });

  return netlist.components.map((c) => {
    const sz = sizeOf(c.type);
    const p = positionById.get(c.id) ?? { x: 80, y: 100 };
    return { component: c, x: p.x, y: p.y, width: sz.w, height: sz.h };
  });
}

/** safe fallback grid — 4-col 격자. spacing scale 적용. */
export function layoutSafeGrid(netlist: CircuitNetlist, scale: number): RenderNode[] {
  const cellW = Math.round(150 * scale);
  const cellH = Math.round(110 * scale);
  const cols = 4;
  return netlist.components.map((c, i) => {
    const sz = sizeOf(c.type);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = 100 + col * cellW;
    const cy = 100 + row * cellH;
    return {
      component: c,
      x: cx - sz.w / 2,
      y: cy - sz.h / 2,
      width: sz.w,
      height: sz.h,
    };
  });
}
