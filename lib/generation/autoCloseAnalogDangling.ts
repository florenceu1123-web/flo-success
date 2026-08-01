import type { CircuitComponent, CircuitNetlist, GeneratedProblem } from "@/types";
import { CONNECTION_LAYOUT_RULES } from "@/lib/generation/branchTemplate";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);

/**
 * 생성된 모든 problem의 analog_netlist figure에 대해 dangling top node를 자동으로 GND로 닫음.
 *  - degree 1 인 non-ground node를 찾아 WIRE component로 GND까지 연결
 *  - free pipeline 출력에 적용 (strict는 addGroundReturnWires가 이미 처리)
 */
export function autoCloseAnalogDangling(problems: GeneratedProblem[]): void {
  for (const p of problems) {
    for (const f of p.figureVariants ?? []) {
      if (f.diagramType !== "analog_netlist" && f.diagramType !== "analog_mesh_network") continue;
      const netlist = f.diagram as CircuitNetlist | undefined;
      if (!netlist || !Array.isArray(netlist.components)) continue;

      closeDangling(netlist);
    }
  }
}

function closeDangling(netlist: CircuitNetlist): void {
  // ground node 식별
  const groundIds = new Set<string>();
  if (netlist.ground) groundIds.add(netlist.ground);
  for (const c of netlist.components) {
    if ((c.type ?? "").toUpperCase() === "GND") {
      for (const pin of c.pins ?? []) groundIds.add(pin.node);
    }
    for (const pin of c.pins ?? []) {
      if (GROUND_LABELS.has(pin.node)) groundIds.add(pin.node);
    }
  }

  // ★ 외부 단자(label_only annotation)는 degree 1이 정상 — 면제한다 (Layout 규칙 #5).
  //   validator(validateFigures)도 같은 노드를 면제하므로 기준을 일치시켜야 한다.
  //   면제하지 않으면 단자 a·b·v_o가 GND로 **단락**돼 회로 의미가 바뀐다.
  const exemptTerminals = new Set<string>();
  for (const ann of netlist.nodeAnnotations ?? []) {
    if (ann?.style === "label_only" && ann.node) exemptTerminals.add(ann.node);
  }

  // node별 degree (2-단자 이상 component만 카운트)
  const degree = new Map<string, number>();
  for (const c of netlist.components) {
    if ((c.type ?? "").toUpperCase() === "GND") continue;
    for (const pin of c.pins ?? []) {
      if (pin?.node) degree.set(pin.node, (degree.get(pin.node) ?? 0) + 1);
    }
  }

  // ground 결정 (없으면 "GND" 디폴트)
  const groundNode = netlist.ground ?? (groundIds.size > 0 ? [...groundIds][0] : "GND");
  if (!netlist.ground) netlist.ground = groundNode;
  groundIds.add(groundNode);

  // dangling node 찾아서 WIRE로 GND 연결
  let wireIdx = 1;
  // 기존 W 인덱스 회피
  for (const c of netlist.components) {
    const m = (c.id ?? "").match(/^W(\d+)$/);
    if (m) wireIdx = Math.max(wireIdx, parseInt(m[1], 10) + 1);
  }

  for (const [node, d] of degree) {
    // CONNECTION_LAYOUT_RULES.minNodeDegree (=2) — degree 미만이면 자동 닫음 트리거
    if (d >= CONNECTION_LAYOUT_RULES.minNodeDegree) continue;
    if (groundIds.has(node)) continue;
    if (exemptTerminals.has(node)) continue; // 외부 단자는 뜬 노드가 아니다

    const wire: CircuitComponent = {
      id: `W${wireIdx++}`,
      type: "WIRE",
      pins: [
        { id: "p1", node, side: "top" },
        { id: "p2", node: groundNode, side: "bottom" },
      ],
    };
    netlist.components.push(wire);
  }
}
