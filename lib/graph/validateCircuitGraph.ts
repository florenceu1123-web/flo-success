/**
 * CircuitGraph 검증 — render 이전 단계.
 *
 *   ★ Core Rule (절대 규칙):
 *     모든 소자는 반드시 branch(edge)에 존재한다.
 *     소자는 node에 attach되지 않는다.
 *
 *   검증 항목:
 *     1. 모든 branch의 from·to가 valid node id.
 *     2. 자기 자신을 가리키는 branch 금지 (self-loop).
 *     3. 모든 회로 소자(wire 제외)가 branch로 존재 — node attachment 금지.
 *     4. internal face(role="mesh") 최소 1개 이상.
 *     5. 각 internal face의 boundary branch 수 ≥ 3.
 *
 *   throw on failure — render는 validation 통과한 graph만 받아야 한다.
 */

import type { CircuitGraph } from "@/types";

export function validateCircuitGraph(g: CircuitGraph): true {
  const nodeIds = new Set(g.nodes.map((n) => n.id));
  for (const b of g.branches) {
    if (!nodeIds.has(b.from)) {
      throw new Error(`branch ${b.id} has invalid from node: ${b.from}`);
    }
    if (!nodeIds.has(b.to)) {
      throw new Error(`branch ${b.id} has invalid to node: ${b.to}`);
    }
    if (b.from === b.to) {
      throw new Error(`branch ${b.id} connects node to itself (소자는 node에 attach될 수 없다)`);
    }
  }
  // ★ Core Rule 검증 — 소자는 반드시 branch에. nodes에는 component 정보가 박혀선 안 됨.
  //   GraphNode 스키마 자체에 component 필드가 없으므로 구조적으로 강제되지만,
  //   추가로 모든 element가 from≠to 인지 (이미 위에서 체크), 그리고 branches에 등장하는지 확인.
  const branchElementCount = g.branches.filter((b) => b.element !== "wire").length;
  // 0개여도 invalid는 아님 (wire-only graph). 단, branch 자체가 0이면 의미 없음.
  if (g.branches.length === 0) {
    throw new Error("branch 0개 — 모든 소자는 branch에 존재해야 함");
  }
  void branchElementCount;

  const internalFaces = g.faces.filter((f) => f.role === "mesh");
  if (internalFaces.length === 0) {
    throw new Error("mesh face가 생성되지 않았습니다.");
  }
  for (const f of internalFaces) {
    if (f.boundary.length < 3) {
      throw new Error(`face ${f.id} is not a valid closed mesh (boundary=${f.boundary.length})`);
    }
  }

  // ── 전압원 +단자 ↔ GND short 검증 ────────────────────
  //   1) +단자가 literal GND 노드
  //   2) +단자에서 wire-only path로 GND 도달 가능
  //   (둘 다 V 전압원을 의미 없게 만드는 short circuit)
  //   convention: V branch의 from = + 단자, to = − 단자 (cellGridToCircuitGraph).
  const groundIds = new Set(
    g.nodes.filter((n) => n.kind === "ground").map((n) => n.id),
  );
  if (groundIds.size > 0) {
    const wireAdj = new Map<string, Set<string>>();
    for (const b of g.branches) {
      if (b.element !== "wire") continue;
      if (!wireAdj.has(b.from)) wireAdj.set(b.from, new Set());
      if (!wireAdj.has(b.to)) wireAdj.set(b.to, new Set());
      wireAdj.get(b.from)!.add(b.to);
      wireAdj.get(b.to)!.add(b.from);
    }
    const reachableViaWire = (start: string): Set<string> => {
      const visited = new Set<string>([start]);
      const queue = [start];
      while (queue.length) {
        const n = queue.shift()!;
        for (const nb of wireAdj.get(n) ?? []) {
          if (visited.has(nb)) continue;
          visited.add(nb);
          queue.push(nb);
        }
      }
      return visited;
    };
    for (const b of g.branches) {
      if (b.element !== "V") continue;
      const plusNode = b.from;
      if (groundIds.has(plusNode)) {
        throw new Error(`branch ${b.id}: 전압원 +단자가 GND에 직접 연결됨`);
      }
      const reach = reachableViaWire(plusNode);
      for (const g of groundIds) {
        if (reach.has(g)) {
          throw new Error(`branch ${b.id}: 전압원 +단자(${plusNode})와 GND(${g}) 사이에 wire-only short 발생`);
        }
      }
    }
  }

  return true;
}
