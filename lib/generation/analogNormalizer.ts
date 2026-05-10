import type {
  CircuitComponent,
  CircuitNetlist,
  ComponentPin,
  GeneratedProblem,
  NodeAnnotation,
} from "@/types";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);
const SOURCE_TYPES = new Set(["V", "VCVS", "VCCS"]);
const CURRENT_TYPES = new Set(["I", "CCCS", "CCVS"]);

// =====================================================================
// Pipeline:
//   GPT free 생성
//     ↓ autoCloseAnalogDangling (별도 모듈)
//     ↓ normalizeTerminalAnalogNetwork
//        - ensureTerminalsAB
//        - ensureGroundReturn
//        - moveInlineCurrentSourcesToVerticalLegs
//        - moveVoltageSourcesToSourceLegs
//        - reduceTopRailOvercrowding
//     ↓ validateTerminalAnalogNetwork (실패 시 한 번 더 normalize 또는 regenerate)
//     ↓ renderer
// =====================================================================

/** GeneratedProblem[] 일괄 처리 entry */
export function normalizeAnalogProblems(problems: GeneratedProblem[]): void {
  for (const p of problems) {
    const problemText = [p.content, p.question, ...(p.conditions ?? [])].join(" ");
    for (const f of p.figureVariants ?? []) {
      if (f.diagramType !== "analog_netlist" && f.diagramType !== "analog_mesh_network") continue;
      const netlist = f.diagram as CircuitNetlist | undefined;
      if (!netlist || !Array.isArray(netlist.components)) continue;
      normalizeTerminalAnalogNetwork(netlist, problemText);
    }
  }
}

/**
 * 단일 netlist normalize.
 * graph(=netlist)는 in-place로 수정된다.
 */
export function normalizeTerminalAnalogNetwork(
  graph: CircuitNetlist,
  problemText: string = "",
): CircuitNetlist {
  ensureTerminalsAB(graph, problemText);
  ensureGroundReturn(graph);
  moveInlineCurrentSourcesToVerticalLegs(graph);
  moveVoltageSourcesToSourceLegs(graph);
  reduceTopRailOvercrowding(graph);
  return graph;
}

/**
 * Thevenin/dc_resistive 등 "단자 a-b 회로" 계열 자동 보정 + 검증.
 * user 파이프라인: candidate → terminalAnalogRepair → if validation.ok use, else regenerate
 *
 * sub-steps 순서 (user 명세):
 *   1. ensureTerminalPairAB                      — a/b 쌍 강제
 *   2. moveInlineCurrentSourcesToVerticalBranches — top rail inline I → vertical
 *   3. moveInlineVoltageSourcesToSourceBranches  — top rail inline V → vertical
 *   4. reduceTopRailOvercrowding                 — top rail 4개 초과 시 split
 *   5. ensureBottomReturnRail                    — ground 보장
 *   6. attachTerminalMeasurementOverlay          — V_ab overlay 자동
 *
 * 반환: { candidate (deep cloned & repaired), validation }
 */
export function terminalAnalogRepair(
  candidate: GeneratedProblem,
  signature?: unknown,
): { candidate: GeneratedProblem; validation: { ok: boolean; errors: string[] } } {
  void signature; // 향후 signature 기반 추가 보정 위해 시그니처 보존
  const repaired = structuredClone(candidate);
  const text = [repaired.content, repaired.question, ...(repaired.conditions ?? [])].join(" ");

  for (const f of repaired.figureVariants ?? []) {
    if (f.diagramType !== "analog_netlist" && f.diagramType !== "analog_mesh_network") continue;
    const netlist = f.diagram as CircuitNetlist | undefined;
    if (!netlist || !Array.isArray(netlist.components)) continue;

    ensureTerminalPairAB(netlist, text);
    moveInlineCurrentSourcesToVerticalBranches(netlist);
    moveInlineVoltageSourcesToSourceBranches(netlist);
    reduceTopRailOvercrowdingFinal(netlist);
    ensureBottomReturnRail(netlist);
    attachTerminalMeasurementOverlay(netlist, text);
  }

  const validation = validateTerminalAnalogNetwork(repaired, signature);
  return { candidate: repaired, validation };
}

/** Thevenin/Norton/Rth/Vth/dc_resistive 같은 단자 a-b 계열 분류 */
export function isTerminalAnalogFamily(
  analysis: { topic?: string; interpretation?: string; relatedConcepts?: string[]; topicKey?: string } | null | undefined,
): boolean {
  if (!analysis) return false;
  const tk = (analysis.topicKey ?? "").toLowerCase();
  if (["thevenin", "norton", "max_power_transfer", "dc_resistive", "source_transformation", "equivalent_circuit"].includes(tk)) {
    return true;
  }
  const text = [analysis.topic, analysis.interpretation, ...(analysis.relatedConcepts ?? [])].join(" ");
  return /테브난|노턴|등가\s*저항|등가\s*전압|R[_{ ]*Th|V[_{ ]*Th|최대\s*전력|max\s*power|R[_{ ]*L|단자\s*[ab]/i.test(text);
}

/** Whole-problem validation — 첫 번째 analog figure 기준. signature는 향후 확장용 */
export function validateTerminalAnalogNetwork(
  candidate: GeneratedProblem,
  signature?: unknown,
): { ok: boolean; errors: string[] } {
  void signature;
  const errors: string[] = [];
  const f = (candidate.figureVariants ?? []).find(
    (f) => f.diagramType === "analog_netlist" || f.diagramType === "analog_mesh_network",
  );
  if (!f) {
    errors.push("analog_netlist figure 없음");
    return { ok: false, errors };
  }
  const netlist = f.diagram as CircuitNetlist | undefined;
  if (!netlist || !Array.isArray(netlist.components)) {
    errors.push("netlist diagram 비어있음");
    return { ok: false, errors };
  }

  const labels = new Set(
    (netlist.nodeAnnotations ?? []).map((a) => a.label.trim().toLowerCase()),
  );
  if (!labels.has("a")) errors.push("terminal a 누락");
  if (!labels.has("b")) errors.push("terminal b 누락");

  const groundIds = identifyGroundNodes(netlist);
  if (groundIds.size === 0) errors.push("ground 누락");

  // top rail inline I 검사
  const topRailComps: CircuitComponent[] = [];
  for (const c of netlist.components ?? []) {
    const type = (c.type ?? "").toUpperCase();
    if (type === "GND" || type === "WIRE") continue;
    if (!c.pins || c.pins.length < 2) continue;
    const [p1, p2] = c.pins;
    if (!groundIds.has(p1.node) && !groundIds.has(p2.node)) {
      topRailComps.push(c);
    }
  }
  for (const c of topRailComps) {
    if ((c.type ?? "").toUpperCase() === "I") {
      errors.push(`전류원 ${c.id}이 top rail inline에 있음`);
    }
  }
  if (topRailComps.length > 4) {
    errors.push(`top rail component 과밀 (${topRailComps.length}개)`);
  }

  return { ok: errors.length === 0, errors };
}

// =====================================================================
// terminalAnalogRepair sub-steps
// =====================================================================

/** a/b를 반드시 쌍으로 보장. 누락된 쪽은 자동 추가 (a→rightmost-top, b→ground) */
function ensureTerminalPairAB(netlist: CircuitNetlist, problemText: string): void {
  const annotations = netlist.nodeAnnotations ?? [];
  const labels = new Set(annotations.map((a) => a.label.trim().toLowerCase()));
  const hasA = labels.has("a");
  const hasB = labels.has("b");
  if (hasA && hasB) return;

  const groundIds = identifyGroundNodes(netlist);
  const groundNode = netlist.ground ?? [...groundIds][0] ?? "GND";

  // top node 등장 순으로 수집
  const seenTop = new Set<string>();
  const orderedTops: string[] = [];
  for (const c of netlist.components) {
    const t = (c.type ?? "").toUpperCase();
    if (t === "GND" || t === "WIRE") continue;
    for (const pin of c.pins ?? []) {
      if (!pin?.node) continue;
      if (groundIds.has(pin.node)) continue;
      if (!seenTop.has(pin.node)) {
        seenTop.add(pin.node);
        orderedTops.push(pin.node);
      }
    }
  }

  netlist.nodeAnnotations = annotations;

  // a → rightmost top node (Thevenin 단자), b → ground (port_negative)
  const rightmostTop = orderedTops[orderedTops.length - 1];

  if (!hasA && rightmostTop) {
    netlist.nodeAnnotations.push({
      node: rightmostTop,
      label: "a",
      style: "terminal_dot",
    });
  }
  if (!hasB && groundNode) {
    netlist.nodeAnnotations.push({
      node: groundNode,
      label: "b",
      style: "terminal_dot",
    });
  }
  // 쓰이는 변수 묵시적 사용
  void problemText;
}

/** ground node 보장 (없으면 가장 많이 쓰이는 node를 ground로 또는 "GND" 디폴트) */
function ensureBottomReturnRail(netlist: CircuitNetlist): void {
  const groundIds = identifyGroundNodes(netlist);
  if (groundIds.size > 0) {
    if (!netlist.ground) netlist.ground = [...groundIds][0];
    return;
  }
  const usage = new Map<string, number>();
  for (const c of netlist.components) {
    for (const pin of c.pins ?? []) {
      if (pin?.node) usage.set(pin.node, (usage.get(pin.node) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [n, cnt] of usage) if (cnt > bestCount) { bestCount = cnt; best = n; }
  netlist.ground = best ?? "GND";
}

/** I source aggressive split — usage > 1이어도 한쪽 pin을 ground로 rewire (node-merge) */
function moveInlineCurrentSourcesToVerticalBranches(netlist: CircuitNetlist): void {
  const groundIds = identifyGroundNodes(netlist);
  if (groundIds.size === 0) return;
  const groundNode = netlist.ground ?? [...groundIds][0];

  for (const c of netlist.components) {
    const type = (c.type ?? "").toUpperCase();
    if (!CURRENT_TYPES.has(type)) continue;
    if (!Array.isArray(c.pins) || c.pins.length < 2) continue;
    const [p1, p2] = c.pins;
    if (groundIds.has(p1.node) || groundIds.has(p2.node)) continue;

    aggressiveRewireToGround(netlist, c, p1, p2, groundNode);
  }
}

/** V source aggressive split */
function moveInlineVoltageSourcesToSourceBranches(netlist: CircuitNetlist): void {
  const groundIds = identifyGroundNodes(netlist);
  if (groundIds.size === 0) return;
  const groundNode = netlist.ground ?? [...groundIds][0];

  for (const c of netlist.components) {
    const type = (c.type ?? "").toUpperCase();
    if (!SOURCE_TYPES.has(type)) continue;
    if (!Array.isArray(c.pins) || c.pins.length < 2) continue;
    const [p1, p2] = c.pins;
    if (groundIds.has(p1.node) || groundIds.has(p2.node)) continue;

    aggressiveRewireToGround(netlist, c, p1, p2, groundNode);
  }
}

/**
 * 강제 vertical 전환 — 양 pin이 모두 non-ground일 때:
 *  1. 한쪽 pin이 다른 component와 공유 안 함(usage=1) → 단순 rewire
 *  2. 둘 다 공유 → 새 intermediate node 도입해서 source는 vertical로,
 *     원래 node는 그대로 두고 WIRE로 연결 (회로 의미 보존하면서 layout vertical화)
 */
function aggressiveRewireToGround(
  netlist: CircuitNetlist,
  comp: CircuitComponent,
  p1: ComponentPin,
  p2: ComponentPin,
  groundNode: string,
): void {
  const u1 = countNodeUsage(netlist, p1.node);
  const u2 = countNodeUsage(netlist, p2.node);

  // 안전한 simple rewire — 한쪽 pin usage=1이면 그 pin을 ground로
  if (u2 === 1) { p2.node = groundNode; p2.side = "bottom"; p1.side = "top"; return; }
  if (u1 === 1) { p1.node = groundNode; p1.side = "bottom"; p2.side = "top"; return; }

  // 둘 다 공유 — 회로 의미 보존하며 vertical로 만들기
  // 원래: comp(p1=A, p2=B), 다른 R들이 A, B 공유 중
  // 변환: comp(p1=A, p2=GND), 그리고 A-B 사이 WIRE 추가 → A가 B의 역할도 수행 (등가)
  // 즉 B node가 사라지고 A로 통합되며, comp는 A↔GND vertical
  const keepNode = u1 >= u2 ? p1.node : p2.node;
  const collapseNode = u1 >= u2 ? p2.node : p1.node;
  // 모든 pin에서 collapseNode → keepNode로 rename
  for (const c of netlist.components) {
    for (const pin of c.pins ?? []) {
      if (pin.node === collapseNode) pin.node = keepNode;
    }
  }
  // 이제 comp의 두 pin 다 keepNode → 한쪽을 ground로 rewire
  if (p1.node === keepNode && p2.node === keepNode) {
    p2.node = groundNode;
    p2.side = "bottom";
    p1.side = "top";
  }
}

/** top rail에 component가 4개 초과면 가장 우측 horizontal R 한 개를 vertical(load_leg)로 이동 */
function reduceTopRailOvercrowdingFinal(netlist: CircuitNetlist): void {
  const groundIds = identifyGroundNodes(netlist);
  if (groundIds.size === 0) return;
  const groundNode = netlist.ground ?? [...groundIds][0];

  const topRail = netlist.components.filter((c) => {
    const t = (c.type ?? "").toUpperCase();
    if (t === "GND" || t === "WIRE") return false;
    if (!c.pins || c.pins.length < 2) return false;
    const [p1, p2] = c.pins;
    return !groundIds.has(p1.node) && !groundIds.has(p2.node);
  });

  if (topRail.length <= 4) return;

  // 가장 마지막 R 계열을 vertical로 (load_leg)
  for (let i = topRail.length - 1; i >= 0 && topRail.length > 4; i--) {
    const c = topRail[i];
    const t = (c.type ?? "").toUpperCase();
    if (t !== "R" && t !== "L" && t !== "C") continue;
    // p2를 ground로
    if (c.pins && c.pins.length >= 2) {
      const u2 = countNodeUsage(netlist, c.pins[1].node);
      if (u2 === 1) {
        c.pins[1].node = groundNode;
        c.pins[1].side = "bottom";
        c.pins[0].side = "top";
        topRail.splice(i, 1);
      }
    }
  }
}

/** Thevenin family면 V_ab measurement overlay 자동 부착 (없을 때) */
function attachTerminalMeasurementOverlay(netlist: CircuitNetlist, problemText: string): void {
  const text = problemText ?? "";
  const wantsVab = /V[_{ ]*ab|V_a_?b|개방\s*전압|등가\s*전압|V[_{ ]*Th|테브난|Thevenin/i.test(text);
  if (!wantsVab) return;

  const annotations = netlist.nodeAnnotations ?? [];
  const aAnn = annotations.find((a) => a.label.trim().toLowerCase() === "a");
  const bAnn = annotations.find((a) => a.label.trim().toLowerCase() === "b");
  if (!aAnn || !bAnn) return;

  netlist.measurementMarks = netlist.measurementMarks ?? [];
  const exists = netlist.measurementMarks.some(
    (m) => m.kind === "voltage" && m.refs.includes(aAnn.node) && m.refs.includes(bAnn.node),
  );
  if (!exists) {
    netlist.measurementMarks.push({
      kind: "voltage",
      refs: [aAnn.node, bAnn.node],
      label: "V_ab",
    });
  }
}

// =====================================================================
// 1) ensureTerminalsAB — a/b annotation 자동 부여 (legacy normalizer 흐름용)
// =====================================================================
function ensureTerminalsAB(graph: CircuitNetlist, problemText: string): void {
  const text = problemText ?? "";
  // 단자 a/b 컨텍스트 감지
  const needsTerminals =
    /단자\s*[ab]\b/i.test(text) ||
    /테브난|노턴|등가\s*저항|등가\s*전압|R[_{ ]*Th|V[_{ ]*Th/i.test(text) ||
    /최대\s*전력|max\s*power|R[_{ ]*L|부하\s*저항/i.test(text) ||
    /\bThevenin\b|\bNorton\b/i.test(text);
  if (!needsTerminals) return;

  const annotations = graph.nodeAnnotations ?? [];
  const labels = new Set(annotations.map((a) => a.label.trim().toLowerCase()));
  const hasA = labels.has("a");
  const hasB = labels.has("b");
  if (hasA && hasB) return;

  // output terminal node 추정
  const { a: nodeA, b: nodeB } = inferOutputTerminalNodes(graph);

  graph.nodeAnnotations = [
    ...annotations,
    ...(!hasA && nodeA ? [{ node: nodeA, label: "a", style: "terminal_dot" as const }] : []),
    ...(!hasB && nodeB ? [{ node: nodeB, label: "b", style: "terminal_dot" as const }] : []),
  ];
}

/**
 * output terminal node 추정.
 * 휴리스틱: ground가 아닌 top node 중 leftmost(첫 등장) → a, rightmost(마지막 등장) → b.
 *  - top node 1개뿐이면 a만 부여
 *  - 0개면 빈 결과
 */
function inferOutputTerminalNodes(graph: CircuitNetlist): { a?: string; b?: string } {
  const groundIds = identifyGroundNodes(graph);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const c of graph.components ?? []) {
    const type = (c.type ?? "").toUpperCase();
    if (type === "GND" || type === "WIRE") continue;
    for (const pin of c.pins ?? []) {
      if (!pin?.node) continue;
      if (groundIds.has(pin.node)) continue;
      if (!seen.has(pin.node)) {
        seen.add(pin.node);
        ordered.push(pin.node);
      }
    }
  }
  if (ordered.length === 0) return {};
  if (ordered.length === 1) return { a: ordered[0] };
  return { a: ordered[0], b: ordered[ordered.length - 1] };
}

// =====================================================================
// 2) ensureGroundReturn — ground node 보장 (없으면 GND를 명시)
// =====================================================================
function ensureGroundReturn(graph: CircuitNetlist): void {
  const groundIds = identifyGroundNodes(graph);
  if (groundIds.size > 0) {
    if (!graph.ground) graph.ground = [...groundIds][0];
    return;
  }
  // ground가 전혀 없는 경우 — 가장 많이 쓰이는 node를 ground로 지정
  const usage = new Map<string, number>();
  for (const c of graph.components) {
    for (const pin of c.pins ?? []) {
      if (pin?.node) usage.set(pin.node, (usage.get(pin.node) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [n, c] of usage) {
    if (c > bestCount) { bestCount = c; best = n; }
  }
  if (best) {
    graph.ground = best;
  } else {
    graph.ground = "GND";
  }
}

// =====================================================================
// 3) moveInlineCurrentSourcesToVerticalLegs
//    top rail에 박힌 I source를 vertical leg로 분리
// =====================================================================
function moveInlineCurrentSourcesToVerticalLegs(graph: CircuitNetlist): void {
  const groundIds = identifyGroundNodes(graph);
  if (groundIds.size === 0) return;
  const groundNode = graph.ground ?? [...groundIds][0];

  for (const c of graph.components) {
    const type = (c.type ?? "").toUpperCase();
    if (!CURRENT_TYPES.has(type)) continue;
    if (!Array.isArray(c.pins) || c.pins.length < 2) continue;
    const [p1, p2] = c.pins;
    if (groundIds.has(p1.node) || groundIds.has(p2.node)) continue;

    // 양 pin 모두 non-ground → vertical로 rewire (덜 쓰이는 쪽을 ground로)
    rewirePinToGround(graph, c, p1, p2, groundNode);
  }
}

// =====================================================================
// 4) moveVoltageSourcesToSourceLegs — V/dep 같은 voltage source도 vertical leg로
// =====================================================================
function moveVoltageSourcesToSourceLegs(graph: CircuitNetlist): void {
  const groundIds = identifyGroundNodes(graph);
  if (groundIds.size === 0) return;
  const groundNode = graph.ground ?? [...groundIds][0];

  for (const c of graph.components) {
    const type = (c.type ?? "").toUpperCase();
    if (!SOURCE_TYPES.has(type)) continue;
    if (!Array.isArray(c.pins) || c.pins.length < 2) continue;
    const [p1, p2] = c.pins;
    if (groundIds.has(p1.node) || groundIds.has(p2.node)) continue;

    rewirePinToGround(graph, c, p1, p2, groundNode);
  }
}

/**
 * source의 두 pin이 모두 non-ground일 때, 덜 쓰이는 쪽을 ground로 rewire.
 *  - p1 또는 p2의 node usage가 1(이 component만 사용)이면 안전하게 rewire
 *  - 둘 다 다른 component와 공유 중이면 회로 변경 위험 → skip (그대로 둠)
 */
function rewirePinToGround(
  graph: CircuitNetlist,
  comp: CircuitComponent,
  p1: ComponentPin,
  p2: ComponentPin,
  groundNode: string,
): void {
  const u1 = countNodeUsage(graph, p1.node);
  const u2 = countNodeUsage(graph, p2.node);
  // 더 적게 쓰이는 쪽이 rewire 후보
  const target = u2 <= u1 ? p2 : p1;
  const targetUsage = target === p2 ? u2 : u1;
  if (targetUsage > 1) return; // 다른 component가 이 node를 공유 중 — 회로 변경 위험

  target.node = groundNode;
  target.side = "bottom";
  // 다른 pin은 top side 정리
  const other = target === p2 ? p1 : p2;
  other.side = "top";
}

function countNodeUsage(graph: CircuitNetlist, node: string): number {
  let n = 0;
  for (const c of graph.components) {
    for (const pin of c.pins ?? []) {
      if (pin?.node === node) n++;
    }
  }
  return n;
}

// =====================================================================
// 5) reduceTopRailOvercrowding
//    top rail에 inline V/I가 남아 있으면 (3,4번에서 못 옮긴 케이스) 다시 시도.
//    실패하면 그대로 둠.
// =====================================================================
function reduceTopRailOvercrowding(graph: CircuitNetlist): void {
  // 3+4가 이미 처리. 여기선 한 번 더 시도 (남아있으면).
  moveInlineCurrentSourcesToVerticalLegs(graph);
  moveVoltageSourcesToSourceLegs(graph);
}

// =====================================================================
// helpers
// =====================================================================
function identifyGroundNodes(graph: CircuitNetlist): Set<string> {
  const ids = new Set<string>();
  if (graph.ground) ids.add(graph.ground);
  for (const c of graph.components ?? []) {
    if ((c.type ?? "").toUpperCase() === "GND") {
      for (const pin of c.pins ?? []) if (pin?.node) ids.add(pin.node);
    }
    for (const pin of c.pins ?? []) {
      if (pin?.node && GROUND_LABELS.has(pin.node)) ids.add(pin.node);
    }
  }
  return ids;
}
