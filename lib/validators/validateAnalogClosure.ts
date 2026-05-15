import type { CircuitNetlist } from "@/types";

/**
 * 회로 폐쇄성(closed loop with source) 검증 — 회로이론 가이드의 회로 폐쇄성 규칙 구현.
 *
 *  검사 항목:
 *   1. 회로에 V/I source가 최소 1개 존재.
 *   2. 모든 node의 degree ≥ 2 (floating pin 금지).
 *   3. 각 source의 두 pin이 source 자신 외 다른 path로 connected (closed loop 형성).
 *   4. source의 두 pin이 같은 node이면 short-circuit으로 오류.
 *
 *  반환: 위반 사항 문자열 배열. 빈 배열이면 통과.
 */
export function validateAnalogClosure(netlist: CircuitNetlist): string[] {
  const errors: string[] = [];
  const components = netlist.components ?? [];

  // 1. 전원 존재 검사
  const sources = components.filter((c) => c.type === "V" || c.type === "I");
  if (sources.length === 0) {
    errors.push("회로에 전원(V/I source)이 없음 — 정상상태에서 전류·전압 0이라 문제 무의미");
    return errors; // 전원 없으면 나머지 검사 의미 없음
  }

  // 2. node degree ≥ 2 (floating pin)
  const degree = new Map<string, number>();
  const nodeComponents = new Map<string, string[]>();
  for (const c of components) {
    for (const p of c.pins ?? []) {
      degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
      if (!nodeComponents.has(p.node)) nodeComponents.set(p.node, []);
      nodeComponents.get(p.node)!.push(c.id);
    }
  }
  for (const [node, d] of degree) {
    if (d < 2) {
      const owners = nodeComponents.get(node)?.join(",") ?? "?";
      errors.push(`node "${node}"가 단 1개 component(${owners})에만 연결 — floating pin (Rule: minNodeDegree≥2)`);
    }
  }

  // 3·4. 각 source의 두 pin 간 closed loop 검사
  for (const src of sources) {
    const pins = src.pins ?? [];
    if (pins.length !== 2) continue;
    const a = pins[0].node;
    const b = pins[1].node;

    if (a === b) {
      errors.push(`${src.id}: 두 pin이 같은 node "${a}"에 연결 — short-circuit`);
      continue;
    }

    // source 자신 제외한 component-edge 그래프 구성
    const adj = new Map<string, Set<string>>();
    for (const c of components) {
      if (c.id === src.id) continue;
      const cpins = c.pins ?? [];
      // multi-pin component는 모든 pin pair 사이 connectivity edge
      for (let i = 0; i < cpins.length; i++) {
        for (let j = i + 1; j < cpins.length; j++) {
          const ni = cpins[i].node;
          const nj = cpins[j].node;
          if (ni === nj) continue;
          if (!adj.has(ni)) adj.set(ni, new Set());
          if (!adj.has(nj)) adj.set(nj, new Set());
          adj.get(ni)!.add(nj);
          adj.get(nj)!.add(ni);
        }
      }
    }

    // BFS: a → b 도달 가능?
    const visited = new Set<string>([a]);
    const queue: string[] = [a];
    let found = false;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === b) {
        found = true;
        break;
      }
      for (const n of adj.get(curr) ?? []) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    if (!found) {
      errors.push(`${src.id}: pins "${a}"↔"${b}" 사이 closed loop 없음 — floating source`);
    }
  }

  return errors;
}
