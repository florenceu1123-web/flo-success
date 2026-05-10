import type { CircuitNetlist } from "@/types";

// =====================================================================
// 신규 구조 (spec 3) — 레인 기반 배치
// =====================================================================

/** 한 행(가로 레인). 같은 lane에 속한 components는 동일 y에서 가로로 정렬. */
export type CircuitLane = {
  id: string;
  y: number;
  components: string[]; // component ids in left-to-right order
};

export type RoutedComponent = {
  componentId: string;
  laneId: string;
  x: number;
  orientation: "horizontal" | "vertical";
};

// =====================================================================
// 토폴로지 분석 (spec 4)
// =====================================================================

export type TopologyInfo = {
  /** node id → 연결된 pin 수 (degree) */
  degree: Map<string, number>;
  /** degree ≥ 3 인 노드 — junction */
  branchNodes: Set<string>;
  /** source→sink 경로들. 각 경로는 노드 시퀀스. */
  paths: Array<{ source: string; sink: string; nodes: string[] }>;
  /** parallel branch 그룹 — 두 branch node 사이를 직접 연결하는 component 집합. */
  parallelGroups: Array<{ a: string; b: string; componentIds: string[] }>;
};

/**
 * netlist의 그래프 구조를 분석한다.
 *  - degree 계산
 *  - branch node(degree≥3) 찾기
 *  - source→sink path 추출 (V/I 양극 → GND)
 *  - parallel branch 분리
 */
export function analyzeTopology(netlist: CircuitNetlist): TopologyInfo {
  const degree = computeDegree(netlist);
  const branchNodes = findBranchNodes(degree);
  const paths = extractSourceSinkPaths(netlist, branchNodes);
  const parallelGroups = findParallelGroups(netlist);

  return { degree, branchNodes, paths, parallelGroups };
}

// ─── degree ─────────────────────────────────────────────────────────
function computeDegree(netlist: CircuitNetlist): Map<string, number> {
  const degree = new Map<string, number>();
  for (const c of netlist.components ?? []) {
    for (const pin of c.pins ?? []) {
      if (!pin.node) continue;
      degree.set(pin.node, (degree.get(pin.node) ?? 0) + 1);
    }
  }
  return degree;
}

// ─── branch nodes ────────────────────────────────────────────────────
function findBranchNodes(degree: Map<string, number>): Set<string> {
  const out = new Set<string>();
  for (const [node, d] of degree) {
    if (d >= 3) out.add(node);
  }
  return out;
}

// ─── source→sink paths ──────────────────────────────────────────────
/**
 * 각 source(V/I) component의 두 단자에서 시작해, GND/branch node에 도달할 때까지 직렬 경로를 따라간다.
 * 결과는 path: source → ... → sink 의 노드 시퀀스.
 */
function extractSourceSinkPaths(
  netlist: CircuitNetlist,
  branchNodes: Set<string>
): TopologyInfo["paths"] {
  const adj = buildAdjacency(netlist);
  const sourceTypes = new Set(["V", "I", "VCCS", "VCVS", "CCCS", "CCVS"]);
  const sinkNodes = new Set<string>();
  if (netlist.ground) sinkNodes.add(netlist.ground);
  for (const n of branchNodes) sinkNodes.add(n);

  const paths: TopologyInfo["paths"] = [];

  for (const c of netlist.components ?? []) {
    if (!sourceTypes.has(c.type)) continue;
    if (!c.pins || c.pins.length < 2) continue;

    const positivePin = c.pins.find((p) => p.role === "positive") ?? c.pins[0];
    const negativePin = c.pins.find((p) => p.role === "negative") ?? c.pins[1];
    const startNode = positivePin.node;
    const endNode = negativePin.node;
    if (!startNode || !endNode) continue;

    const traversed = walkSeries(adj, startNode, c.id, sinkNodes);
    if (traversed.length > 0) {
      paths.push({ source: startNode, sink: traversed[traversed.length - 1], nodes: traversed });
    }
    // negative side를 별도 경로로
    const traversed2 = walkSeries(adj, endNode, c.id, sinkNodes);
    if (traversed2.length > 0) {
      paths.push({ source: endNode, sink: traversed2[traversed2.length - 1], nodes: traversed2 });
    }
  }

  return paths;
}

/** 인접 그래프: node → [{otherNode, viaCompId}, ...] */
type Adjacency = Map<string, Array<{ other: string; via: string }>>;

function buildAdjacency(netlist: CircuitNetlist): Adjacency {
  const adj: Adjacency = new Map();
  for (const c of netlist.components ?? []) {
    if (!c.pins || c.pins.length < 2) continue;
    // bipole: 두 pin 사이 양방향 link
    for (let i = 0; i < c.pins.length; i++) {
      for (let j = i + 1; j < c.pins.length; j++) {
        const a = c.pins[i].node;
        const b = c.pins[j].node;
        if (!a || !b || a === b) continue;
        addEdge(adj, a, b, c.id);
        addEdge(adj, b, a, c.id);
      }
    }
  }
  return adj;
}

function addEdge(adj: Adjacency, from: string, to: string, via: string): void {
  const list = adj.get(from) ?? [];
  list.push({ other: to, via });
  adj.set(from, list);
}

/** start node에서 시작해 직렬(degree=2) 노드만 따라가다가 sink 또는 branch에 도달. */
function walkSeries(
  adj: Adjacency,
  start: string,
  excludeVia: string,
  sinkNodes: Set<string>
): string[] {
  const visited = new Set<string>([start]);
  const path: string[] = [start];
  let curr = start;
  let lastVia = excludeVia;

  while (true) {
    if (sinkNodes.has(curr) && curr !== start) break;
    const edges = (adj.get(curr) ?? []).filter((e) => e.via !== lastVia && !visited.has(e.other));
    if (edges.length === 0) break;
    if (edges.length > 1) break; // branch — stop here
    const next = edges[0];
    path.push(next.other);
    visited.add(next.other);
    lastVia = next.via;
    curr = next.other;
  }
  return path;
}

// ─── parallel branches ──────────────────────────────────────────────
/**
 * 두 component가 동일한 두 노드 쌍 사이에 직접 연결돼 있으면 parallel.
 * { a, b }로 정규화한 노드쌍을 키로 그룹핑.
 */
function findParallelGroups(netlist: CircuitNetlist): TopologyInfo["parallelGroups"] {
  const groups = new Map<string, { a: string; b: string; componentIds: string[] }>();
  for (const c of netlist.components ?? []) {
    if (!c.pins || c.pins.length !== 2) continue;
    const a = c.pins[0].node;
    const b = c.pins[1].node;
    if (!a || !b || a === b) continue;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const key = `${lo}|${hi}`;
    const g = groups.get(key) ?? { a: lo, b: hi, componentIds: [] };
    g.componentIds.push(c.id);
    groups.set(key, g);
  }
  return Array.from(groups.values()).filter((g) => g.componentIds.length >= 2);
}
