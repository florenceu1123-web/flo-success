import type { CircuitNetlist } from "@/types";

/**
 * Spec 2 — 렌더 가능한 netlist인지 사전 검증.
 *  - components 존재
 *  - 각 component에 pins 배열 존재
 *  - pin마다 id/node/side 누락 없음
 *  - 2-단자 소자(R/C/L/V/I/SW/VCCS/VCVS/CCCS/CCVS)는 pins 길이 ≥ 2
 */
export function validateNetlistRenderable(netlist: CircuitNetlist) {
  const errors: string[] = [];

  if (!netlist.components?.length) {
    errors.push("components가 없습니다.");
  }

  for (const c of netlist.components ?? []) {
    if (!c.pins?.length) {
      errors.push(`${c.id}: pins 누락`);
      continue;
    }

    const VALID_SIDES = ["left", "right", "top", "bottom"];
    for (const pin of c.pins) {
      if (!pin.id) errors.push(`${c.id}: pin id 누락`);
      if (!pin.node) errors.push(`${c.id}.${pin.id}: node 누락`);
      if (!pin.side) errors.push(`${c.id}.${pin.id}: side 누락`);
      else if (!VALID_SIDES.includes(pin.side)) {
        errors.push(`${c.id}.${pin.id}: side="${pin.side}"는 invalid. left|right|top|bottom 중 하나. (semantic은 role에)`);
      }
    }

    const twoTerminal = ["R", "C", "L", "V", "I", "SW", "VCCS", "VCVS", "CCCS", "CCVS"];
    if (twoTerminal.includes(c.type) && c.pins.length < 2) {
      errors.push(`${c.id}: 2단자 소자인데 pins가 2개 미만`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
