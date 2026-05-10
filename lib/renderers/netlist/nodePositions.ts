import type { CircuitNetlist } from "@/types";
import type { Point } from "./graph";
import type { TopologyInfo } from "./topology";

const NODE_X_SPACING = 140;
const NODE_Y_SPACING = 110;
const PADDING_X = 80;
const PADDING_Y = 80;

/**
 * 그래프 토폴로지 기반 node 좌표 결정.
 *  - 모든 노드 degree ≤ 2 (단순 chain/cycle): 좌→우 한 줄 배치
 *  - 그 외 (branch 존재): GND 또는 max-degree 노드에서 BFS, level별로 가로 배치
 */
export function computeNodePositions(
  netlist: CircuitNetlist,
  topology: TopologyInfo
): Map<string, Point> {
  const nodes = Array.from(topology.degree.keys());
  if (nodes.length === 0) return new Map();

  if (isSimpleChainOrCycle(topology)) {
    return horizontalChainLayout(netlist, topology, nodes);
  }
  return bfsLayout(netlist, topology, nodes);
}

function isSimpleChainOrCycle(topology: TopologyInfo): boolean {
  for (const [, deg] of topology.degree) {
    if (deg > 2) return false;
  }
  return true;
}

/** 노드 간 인접 그래프 (component를 통해 연결된 노드 쌍) */
function buildNodeAdjacency(netlist: CircuitNetlist): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const c of netlist.components) {
    if (!c.pins || c.pins.length < 2) continue;
    for (let i = 0; i < c.pins.length; i++) {
      for (let j = i + 1; j < c.pins.length; j++) {
        const a = c.pins[i].node;
        const b = c.pins[j].node;
        if (!a || !b || a === b) continue;
        add(a, b);
        add(b, a);
      }
    }
  }
  return adj;
}

/** 모든 degree ≤ 2 인 경우: 한 줄 배치 (cycle도 같은 줄, 닫힘 wire는 routing이 처리). */
function horizontalChainLayout(
  netlist: CircuitNetlist,
  topology: TopologyInfo,
  allNodes: string[]
): Map<string, Point> {
  const adj = buildNodeAdjacency(netlist);
  const positions = new Map<string, Point>();

  // 시작 노드: degree 1(chain endpoint) → ground(그래프에 존재할 때만) → 첫 노드
  const start =
    allNodes.find((n) => (topology.degree.get(n) ?? 0) === 1) ??
    (netlist.ground && topology.degree.has(netlist.ground) ? netlist.ground : undefined) ??
    allNodes[0];

  const visited = new Set<string>();
  let curr: string | undefined = start;
  let i = 0;

  while (curr && !visited.has(curr)) {
    positions.set(curr, { x: PADDING_X + i * NODE_X_SPACING, y: PADDING_Y });
    visited.add(curr);
    i++;
    const next = Array.from(adj.get(curr) ?? []).find((n) => !visited.has(n));
    curr = next;
  }

  // 끊긴 sub-graph가 있으면 다음 줄에 이어서
  let row = 1;
  for (const n of allNodes) {
    if (!positions.has(n)) {
      positions.set(n, { x: PADDING_X, y: PADDING_Y + row * NODE_Y_SPACING });
      row++;
    }
  }
  return positions;
}

/** branch 있는 회로: GND 또는 max-degree 노드에서 BFS. level → y, level 내 순서 → x. */
function bfsLayout(
  netlist: CircuitNetlist,
  topology: TopologyInfo,
  allNodes: string[]
): Map<string, Point> {
  const adj = buildNodeAdjacency(netlist);
  const root =
    (netlist.ground && topology.degree.has(netlist.ground) ? netlist.ground : undefined) ??
    allNodes.reduce(
      (best, n) =>
        (topology.degree.get(n) ?? 0) > (topology.degree.get(best) ?? 0) ? n : best,
      allNodes[0],
    );

  const level = new Map<string, number>();
  const queue: string[] = [root];
  level.set(root, 0);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const lv = level.get(curr)!;
    for (const n of adj.get(curr) ?? []) {
      if (!level.has(n)) {
        level.set(n, lv + 1);
        queue.push(n);
      }
    }
  }

  // 끊긴 sub-graph 처리
  let extraLevel = (Math.max(0, ...Array.from(level.values()))) + 1;
  for (const n of allNodes) if (!level.has(n)) level.set(n, extraLevel++);

  const byLevel = new Map<number, string[]>();
  for (const [n, lv] of level) {
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(n);
  }

  const positions = new Map<string, Point>();
  const sortedLvs = Array.from(byLevel.keys()).sort((a, b) => a - b);
  for (const lv of sortedLvs) {
    const ns = byLevel.get(lv)!;
    ns.forEach((n, i) => {
      positions.set(n, { x: PADDING_X + i * NODE_X_SPACING, y: PADDING_Y + lv * NODE_Y_SPACING });
    });
  }
  return positions;
}
