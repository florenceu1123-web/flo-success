import type { CircuitNetlist } from "@/types";

/** spec 1 — 회로 패턴 분류 */
export type CircuitPattern =
  | "series_chain"
  | "parallel_branches"
  | "ladder_network"
  | "source_resistor_network"
  | "unknown";

export function classifyCircuitPattern(netlist: CircuitNetlist): CircuitPattern {
  const components = netlist.components;
  const sourceCount = components.filter((c) => c.type === "V" || c.type === "I").length;
  const resistorCount = components.filter((c) => c.type === "R").length;

  const nodeDegree = countNodeDegree(netlist);

  const branchNodes = [...nodeDegree.values()].filter((d) => d >= 3).length;
  const maxDegree = nodeDegree.size > 0 ? Math.max(...nodeDegree.values()) : 0;

  if (branchNodes === 0 && components.length >= 2) {
    return "series_chain";
  }

  if (branchNodes >= 2 || maxDegree >= 3) {
    return "ladder_network";
  }

  if (sourceCount >= 1 && resistorCount >= 1) {
    return "source_resistor_network";
  }

  return "unknown";
}

export function countNodeDegree(netlist: CircuitNetlist): Map<string, number> {
  const degree = new Map<string, number>();

  for (const c of netlist.components) {
    for (const p of c.pins ?? []) {
      degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
    }
  }

  return degree;
}
