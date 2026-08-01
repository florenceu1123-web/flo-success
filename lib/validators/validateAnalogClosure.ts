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
  const hasOpamp = components.some((c) => c.type === "OPAMP");

  // 1. 전원 존재 검사 — 단, "전원이 없는 게 정상"인 회로가 임용 문제엔 여럿 있다.
  //    아래 셋 중 하나면 면제한다(면제 없이 막으면 정상 문제가 검증 실패로 뜬다 — 실측 신고).
  //    (a) OPAMP·종속전원 등 능동소자 — 입력은 외부 단자(label_only)로 표기되는 게 정상.
  //    (b) C·L 보유 — 스위치 개방 후 **자연응답**(초기조건 v_C(0)·i_L(0)이 구동)은 전원이 없는 게
  //        오히려 맞다. "정상상태에서 0이라 무의미"라는 전제가 이 경우엔 성립하지 않는다.
  //    (c) 외부 단자 2개 이상 — "단자 a-b에서 본 **등가저항/등가 임피던스**" 회로는
  //        전원을 제거(전압원 단락·전류원 개방)한 상태가 정의 그 자체다.
  const DEPENDENT_SOURCE_TYPES = new Set(["VCVS", "VCCS", "CCVS", "CCCS"]);
  const hasDependentSource = components.some((c) =>
    DEPENDENT_SOURCE_TYPES.has((c.type ?? "").toUpperCase()),
  );
  const hasStorage = components.some((c) => c.type === "C" || c.type === "L");
  const externalTerminalCount = (netlist.nodeAnnotations ?? []).filter(
    (a) => a.style === "label_only",
  ).length;

  const sources = components.filter((c) => c.type === "V" || c.type === "I");
  if (
    sources.length === 0 &&
    !hasOpamp && !hasDependentSource && !hasStorage && externalTerminalCount < 2
  ) {
    errors.push("회로에 전원(V/I source)이 없음 — 정상상태에서 전류·전압 0이라 문제 무의미");
    return errors; // 전원 없으면 나머지 검사 의미 없음
  }

  // 외부 단자 노드 — label_only annotation이 있는 노드는 외부 입력/출력 핀이므로 degree 검사 면제.
  const externalTerminalNodes = new Set<string>();
  for (const ann of netlist.nodeAnnotations ?? []) {
    if (ann.style === "label_only") externalTerminalNodes.add(ann.node);
  }
  // ground node도 reference라 degree 검사 면제 (OPAMP V+ 단독 연결 등 흔함)
  if (netlist.ground) externalTerminalNodes.add(netlist.ground);

  // 2. node degree ≥ 2 (floating pin) — 외부 단자/ground 제외
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
    if (externalTerminalNodes.has(node)) continue;
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
