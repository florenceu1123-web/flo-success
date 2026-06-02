import type { AnalysisResult, CircuitNetlist } from "@/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/generation/topologyDriven/addLoadResistor");

/**
 * 최대전력 전달 문제의 부하 저항 R_L을 netlist의 부하 단자에 추가한다.
 *
 * R_L은 원본 그림에서 점선 박스 placeholder (inventory에서 의도적으로 제외됨) —
 * 회로의 기존 R(전원 내부저항·직렬 R 등)은 ★ 고정값으로 보존 ★ 하고, 가변 부하는
 * ★ 별도 component ★ 로 추가해야 한다. 기존 R을 가변으로 바꾸면 다른 회로가 된다.
 *
 * 부하 단자 결정 (우선순위):
 *  1. netlist에 이미 R_L 라벨 component가 있으면 그것 재사용
 *  2. analysis.loadPlaceholders의 betweenNodes (그림 명시 위치, netlist 노드와 일치할 때)
 *  3. 휴리스틱: 전원(V·I)에서 그래프 거리(GND 미통과)가 가장 먼 비접지 노드 ↔ GND
 *     — 테브난·최대전력 문제의 부하는 회로의 출력 포트(전원 반대편)에 연결되는 관례
 *
 * @param netlist  buildFromTopology가 만든 netlist (mutate됨 — R_L component·단자 annotation 추가)
 * @param analysis 분석 결과 (loadPlaceholders 참조)
 * @returns 추가(또는 기존)된 R_L의 id·양 끝 노드. 단자 결정 실패 시 null.
 */
export function addLoadResistor(
  netlist: CircuitNetlist,
  analysis: AnalysisResult,
): { id: string; nodeA: string; nodeB: string } | null {
  const ground = netlist.ground ?? "GND";

  // 1) 이미 R_L이 있으면 재사용
  const existing = netlist.components.find(
    (c) => c.type === "R" && /^R_?L$/i.test(c.id),
  );
  if (existing) {
    const a = existing.pins[0]?.node;
    const b = existing.pins[1]?.node;
    if (a && b) return { id: existing.id, nodeA: a, nodeB: b };
  }

  // 2) loadPlaceholders의 노드가 netlist에 실재하면 그 위치 사용
  const nodeSet = new Set<string>();
  for (const c of netlist.components) for (const p of c.pins) nodeSet.add(p.node);
  for (const ph of analysis.loadPlaceholders ?? []) {
    const [a, b] = ph.betweenNodes ?? [];
    if (a && b && nodeSet.has(a) && nodeSet.has(b)) {
      return pushLoad(netlist, a, b, ground);
    }
  }

  // 3) 휴리스틱 — 전원에서 BFS 거리가 가장 먼 비접지 노드 ↔ GND.
  //    GND는 통과 금지: 모든 leg가 GND로 모이므로 GND를 지나면 거리가 무의미해짐.
  const adj = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const c of netlist.components) {
    const a = c.pins[0]?.node;
    const b = c.pins[1]?.node;
    if (a && b) addEdge(a, b);
  }
  const sourceNodes = new Set<string>();
  for (const c of netlist.components) {
    if (c.type !== "V" && c.type !== "I") continue;
    for (const p of c.pins) if (p.node !== ground) sourceNodes.add(p.node);
  }
  if (sourceNodes.size === 0) {
    log.warn("load_terminal_not_found", { reason: "전원 노드 없음" });
    return null;
  }

  // multi-source BFS (GND 미통과)
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const s of sourceNodes) {
    dist.set(s, 0);
    queue.push(s);
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (next === ground) continue;
      if (!dist.has(next)) {
        dist.set(next, dist.get(cur)! + 1);
        queue.push(next);
      }
    }
  }
  let farNode: string | null = null;
  let farDist = -1;
  for (const [node, d] of dist) {
    if (node === ground) continue;
    if (d > farDist) {
      farDist = d;
      farNode = node;
    }
  }
  if (!farNode) {
    log.warn("load_terminal_not_found", { reason: "BFS 도달 노드 없음" });
    return null;
  }
  return pushLoad(netlist, farNode, ground, ground);
}

/**
 * R_L component + 단자 a·b annotation을 netlist에 추가.
 */
function pushLoad(
  netlist: CircuitNetlist,
  a: string,
  b: string,
  ground: string,
): { id: string; nodeA: string; nodeB: string } {
  netlist.components.push({
    id: "R_L",
    type: "R",
    value: "R_L",   // 가변 부하 표시 — 학생 도출 대상 (renderer는 라벨 그대로 표기)
    pins: [
      { id: "p1", node: a, side: "top" },
      { id: "p2", node: b, side: "bottom" },
    ],
  });
  // 단자 a·b annotation — 원본 임용 형식 (테브난 단자, 수직 정렬)
  const annotations = [...(netlist.nodeAnnotations ?? [])];
  if (!annotations.some((ann) => ann.node === a)) {
    annotations.push({ node: a, label: "a", style: "terminal_dot", role: "main_unknown" });
  }
  if (b !== ground && !annotations.some((ann) => ann.node === b)) {
    annotations.push({ node: b, label: "b", style: "terminal_dot" });
  }
  netlist.nodeAnnotations = annotations;

  log.info("load_resistor_added", { id: "R_L", nodeA: a, nodeB: b });
  return { id: "R_L", nodeA: a, nodeB: b };
}
