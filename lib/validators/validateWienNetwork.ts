// src/lib/validators/validateWienNetwork.ts
//
// Wien Bridge RC 망 validator — series RC·shunt RC·V_out→V+ 경로·dangling 검사.

import type { CircuitNetlist } from "@/types";

export type WienValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

function fail(errors: string[]): WienValidationResult {
  return { ok: false, errors };
}

export function validateWienNetwork(circuit: CircuitNetlist): WienValidationResult {
  const errs: string[] = [];

  if (!hasSeriesRC(circuit)) {
    errs.push("NO_SERIES_RC");
  }

  if (!hasParallelRC(circuit)) {
    errs.push("NO_PARALLEL_RC");
  }

  if (!connectsOutputToPositiveInput(circuit)) {
    errs.push("NO_POSITIVE_FEEDBACK");
  }

  if (hasDanglingComponent(circuit)) {
    errs.push("DANGLING_COMPONENT");
  }

  return errs.length > 0 ? fail(errs) : { ok: true };
}

// ── Predicates ───────────────────────────────────────────────────────

/** R-C 직렬 branch 존재 — 어느 중간 노드에서 R 한쪽과 C 한쪽이 만남. */
function hasSeriesRC(circuit: CircuitNetlist): boolean {
  const comps = circuit.components ?? [];
  const Rs = comps.filter((c) => c.type === "R");
  const Cs = comps.filter((c) => c.type === "C");
  for (const r of Rs) {
    const rNodes = (r.pins ?? []).map((p) => p.node);
    for (const c of Cs) {
      const cNodes = (c.pins ?? []).map((p) => p.node);
      // 같은 node를 공유하면 직렬 chain (해당 node degree 정확히 2: R 한 끝 + C 한 끝)
      const shared = rNodes.find((n) => cNodes.includes(n));
      if (shared && isInternalChainNode(circuit, shared, [r.id, c.id])) return true;
    }
  }
  return false;
}

/** R∥C 병렬 branch — 같은 두 노드를 잇는 R과 C가 동시 존재. */
function hasParallelRC(circuit: CircuitNetlist): boolean {
  const comps = circuit.components ?? [];
  const Rs = comps.filter((c) => c.type === "R");
  const Cs = comps.filter((c) => c.type === "C");
  for (const r of Rs) {
    const rNodes = (r.pins ?? []).map((p) => p.node).sort();
    if (rNodes.length !== 2) continue;
    for (const c of Cs) {
      const cNodes = (c.pins ?? []).map((p) => p.node).sort();
      if (cNodes.length !== 2) continue;
      if (rNodes[0] === cNodes[0] && rNodes[1] === cNodes[1]) return true;
    }
  }
  return false;
}

/** V_out → V+ 경로 — 2-pin component BFS로 도달 가능한지. */
function connectsOutputToPositiveInput(circuit: CircuitNetlist): boolean {
  const comps = circuit.components ?? [];
  const opamp = comps.find((c) => c.type === "OPAMP");
  if (!opamp) return false;
  const vp = opamp.pins?.[0]?.node;
  const vo = opamp.pins?.[2]?.node;
  if (!vp || !vo) return false;

  const adj = new Map<string, Set<string>>();
  for (const c of comps) {
    if (c.id === opamp.id) continue;
    if (c.type === "OPAMP") continue;
    if (!c.pins || c.pins.length !== 2) continue;
    const [a, b] = [c.pins[0].node, c.pins[1].node];
    if (!a || !b || a === b) continue;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }

  const visited = new Set([vo]);
  const queue = [vo];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur !== vo && cur === vp) return true;
    for (const next of adj.get(cur) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}

/** dangling component — 한쪽 pin이 다른 어떤 component와도 net을 안 공유. */
function hasDanglingComponent(circuit: CircuitNetlist): boolean {
  const comps = circuit.components ?? [];
  const nodeUseCount = new Map<string, number>();
  for (const c of comps) {
    for (const p of c.pins ?? []) {
      nodeUseCount.set(p.node, (nodeUseCount.get(p.node) ?? 0) + 1);
    }
  }
  for (const c of comps) {
    if (c.type === "OPAMP" || c.type === "GND") continue;
    for (const p of c.pins ?? []) {
      // GND/Vout 등 외부 단자는 single-use도 정상이지만, 일반 component pin이 다른 곳과 안 만나면 dangling.
      const count = nodeUseCount.get(p.node) ?? 0;
      if (count <= 1 && p.node !== "GND") return true;
    }
  }
  return false;
}

/** 두 component만 만나는 internal chain node인지. */
function isInternalChainNode(
  circuit: CircuitNetlist,
  node: string,
  involvingIds: readonly string[],
): boolean {
  const comps = circuit.components ?? [];
  const touching = comps.filter((c) => (c.pins ?? []).some((p) => p.node === node));
  if (touching.length !== 2) return false;
  return touching.every((c) => involvingIds.includes(c.id));
}
