import type { CircuitNetlist } from "@/types";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);

/**
 * Pin의 id/side가 누락됐을 때 자동 보정.
 *  - pin.id 누락 → 인덱스 기반 "p1", "p2" 부여
 *  - pin.side 누락 → vertical/horizontal 분류로 추정 (한 pin이 ground면 top/bottom, 둘 다 non-ground면 left/right)
 * GPT가 가끔 pin metadata를 빼먹어도 렌더 가능하도록 한다.
 */
export function ensurePinFields(netlist: CircuitNetlist): void {
  const groundIds = new Set<string>();
  if (netlist.ground) groundIds.add(netlist.ground);
  for (const c of netlist.components ?? []) {
    if ((c.type ?? "").toUpperCase() === "GND") {
      for (const p of c.pins ?? []) groundIds.add(p.node);
    }
    for (const p of c.pins ?? []) {
      if (p?.node && GROUND_LABELS.has(p.node)) groundIds.add(p.node);
    }
  }

  for (const c of netlist.components ?? []) {
    if (!c.pins?.length) continue;
    const isVertical = c.pins.length >= 2 && (
      groundIds.has(c.pins[0]?.node) || groundIds.has(c.pins[1]?.node)
    );
    c.pins.forEach((pin, i) => {
      if (!pin) return;
      if (!pin.id) pin.id = `p${i + 1}`;
      if (!pin.side) {
        if (isVertical) {
          // vertical leg: ground pin은 bottom, 반대는 top
          if (groundIds.has(pin.node)) pin.side = "bottom";
          else pin.side = "top";
        } else {
          // horizontal: 첫 pin left, 두 번째 right
          pin.side = i === 0 ? "left" : "right";
        }
      }
    });
  }
}

/**
 * Spec 2 — 렌더 가능한 netlist인지 사전 검증.
 *  - components 존재
 *  - 각 component에 pins 배열 존재
 *  - pin마다 id/node/side 누락 없음 (id·side는 ensurePinFields로 자동 보정 후 검사)
 *  - 2-단자 소자(R/C/L/V/I/SW/VCCS/VCVS/CCCS/CCVS)는 pins 길이 ≥ 2
 */
export function validateNetlistRenderable(netlist: CircuitNetlist) {
  // 자동 보정: pin id/side 누락된 경우 채워줌
  ensurePinFields(netlist);

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
