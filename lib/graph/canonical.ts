/**
 * Canonical Graph 모듈 (2026-05-31, 2순위 Framework refactor).
 *
 * components(+pins) → CanonicalGraph: nodes·edges + graph features (degree·cycle·connected components)
 * + canonical numbering (BFS·degree-based 위상학적 정렬).
 *
 * 입력: ComponentInventoryItem[] with pins (2-pin component만 graph에 포함, 3+pin은 무시 v1)
 * 출력: CanonicalGraph — Motif Detector·Tags 생성·Generic Pipeline의 입력.
 */

import type { ComponentInventoryItem } from "@/lib/analysis/extractComponentInventory";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/graph/canonical");

export type CanonicalEdge = {
  /** edge 양 끝 (canonical id 순서 — from < to alphabetical). */
  from: string;
  to: string;
  /** component info — id·type·value */
  componentId: string;
  componentType: string;
  componentValue?: string;
};

export type CanonicalGraph = {
  /** canonical 순서로 정렬된 node id 배열. */
  nodes: string[];
  /** edge 배열. components 중 pins length≥2만 포함. */
  edges: CanonicalEdge[];
  /** graph features */
  features: {
    nodeCount: number;
    edgeCount: number;
    /** node별 degree (incident edge 갯수) */
    degree: Record<string, number>;
    /** cycle count = edges - nodes + connected_components (Euler) */
    cycleCount: number;
    /** connected component 갯수 */
    connectedComponentCount: number;
  };
  /** GND 노드 id (없으면 null). */
  groundId: string | null;
  /** components 중 pins 누락된 것 (3+pin OPAMP·BJT·MOSFET 또는 추출 실패) */
  skippedComponents: Array<{ id: string; type: string; reason: string }>;
};

/**
 * components(+pins) → CanonicalGraph.
 */
export function buildCanonicalGraph(inventory: ComponentInventoryItem[]): CanonicalGraph {
  // 1. nodes·edges 추출
  const nodeSet = new Set<string>();
  const edges: CanonicalEdge[] = [];
  const skipped: Array<{ id: string; type: string; reason: string }> = [];

  for (const c of inventory) {
    if (!c.pins || c.pins.length < 2) {
      skipped.push({
        id: c.id,
        type: c.type,
        reason: c.pins ? `pins length ${c.pins.length}` : "pins missing",
      });
      continue;
    }
    // 2-pin component만 처리 (v1). 3+ pin은 후속.
    const [a, b] = c.pins;
    if (a === b) {
      skipped.push({ id: c.id, type: c.type, reason: "self-loop (a===b)" });
      continue;
    }
    nodeSet.add(a);
    nodeSet.add(b);
    // edge 양 끝 alphabetical로 정렬 (canonical 일관성).
    const [from, to] = a < b ? [a, b] : [b, a];
    edges.push({
      from,
      to,
      componentId: c.id,
      componentType: c.type.toUpperCase(),
      componentValue: c.value,
    });
  }

  // 2. degree 계산
  const degree: Record<string, number> = {};
  for (const n of nodeSet) degree[n] = 0;
  for (const e of edges) {
    degree[e.from] = (degree[e.from] ?? 0) + 1;
    degree[e.to] = (degree[e.to] ?? 0) + 1;
  }

  // 3. connected components 계산 (BFS)
  const visited = new Set<string>();
  const adj = new Map<string, Set<string>>();
  for (const n of nodeSet) adj.set(n, new Set());
  for (const e of edges) {
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }
  let ccCount = 0;
  for (const n of nodeSet) {
    if (visited.has(n)) continue;
    ccCount++;
    // BFS
    const queue = [n];
    visited.add(n);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of adj.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  // 4. cycle count (Euler: E - V + C)
  const cycleCount = Math.max(0, edges.length - nodeSet.size + ccCount);

  // 5. canonical numbering — degree descending, tie-break by alphabetical.
  //   GND는 항상 마지막 (또는 별도 표시).
  const sortedNodes = [...nodeSet].sort((a, b) => {
    // GND·ground는 항상 마지막
    const aIsGnd = isGnd(a);
    const bIsGnd = isGnd(b);
    if (aIsGnd && !bIsGnd) return 1;
    if (!aIsGnd && bIsGnd) return -1;
    // degree descending
    const dDiff = (degree[b] ?? 0) - (degree[a] ?? 0);
    if (dDiff !== 0) return dDiff;
    // alphabetical
    return a < b ? -1 : a > b ? 1 : 0;
  });

  // 6. ground 식별
  const groundId = sortedNodes.find((n) => isGnd(n)) ?? null;

  const graph: CanonicalGraph = {
    nodes: sortedNodes,
    edges,
    features: {
      nodeCount: nodeSet.size,
      edgeCount: edges.length,
      degree,
      cycleCount,
      connectedComponentCount: ccCount,
    },
    groundId,
    skippedComponents: skipped,
  };

  log.info("canonical_graph_built", {
    nodeCount: graph.features.nodeCount,
    edgeCount: graph.features.edgeCount,
    cycleCount: graph.features.cycleCount,
    cc: graph.features.connectedComponentCount,
    nodes: graph.nodes,
    degrees: graph.nodes.map((n) => `${n}(${degree[n]})`),
    skipped: skipped.length > 0 ? skipped : undefined,
  });

  return graph;
}

function isGnd(node: string): boolean {
  const n = node.toUpperCase();
  return n === "GND" || n === "GROUND" || n === "0";
}
