/**
 * Planar Face Detector — netlist를 cell 격자(GridCircuit)로 변환.
 *
 *  파이프라인 위치:
 *   Image → Topology Extractor → [여기] → Circuit Graph Builder → Validator → Renderer
 *
 *  알고리즘 (layoutRole/Position 의존 없음, betweenNodes·node degree 기반):
 *   1) outline — vertical(GND 닿는 leg)이 leftmost·rightmost인 top node 식별.
 *   2) planar grid skeleton — top rail 그래프(horizontal branch만으로 인접) walk → column 순서.
 *   3) face — rows=2 (top/bot 2 row of cells), cols = column 개수 - 1.
 *   4) edge generation — 각 cell의 4 edge 객체 생성. 인접 cell이 같은 edge reference로 share.
 *   5) branch element assignment — component를 edge에 배치:
 *      horizontal component (둘 다 non-GND): 인접 column-pair의 top row 또는 mid row.
 *        같은 column-pair에 여러 horizontal 있으면 자동 평행 — top→mid 분기.
 *      vertical component (한 pin GND): top pin column의 vertical edge.
 *        outer column이면 row 1(하반부), inner column이면 row 0(상반부)로 default.
 */

import type {
  Cell,
  CellEdge,
  CircuitComponent,
  CircuitNetlist,
  GridCircuit,
} from "@/types";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);

type Comp = CircuitComponent;

export function buildCellGrid(netlist: CircuitNetlist): GridCircuit {
  const groundId = netlist.ground ?? "GND";
  const isGnd = (n: string) => GROUND_LABELS.has(n) || n === groundId;

  // ── 1) 컴포넌트 분류
  const horizontals: Comp[] = [];
  const verticals: Comp[] = [];
  for (const c of netlist.components) {
    if ((c.pins?.length ?? 0) < 2) continue;
    const [p1, p2] = c.pins;
    if (isGnd(p1.node) && isGnd(p2.node)) continue;
    if (!isGnd(p1.node) && !isGnd(p2.node)) horizontals.push(c);
    else verticals.push(c);
  }

  // ── 2) column 순서 — top rail 그래프 walk.
  //   인접 column 간 horizontal branch 있으면 adjacency edge. leftmost·rightmost는 degree=1 node.
  const adj = new Map<string, Set<string>>();
  for (const c of horizontals) {
    const [p1, p2] = c.pins;
    if (!adj.has(p1.node)) adj.set(p1.node, new Set());
    if (!adj.has(p2.node)) adj.set(p2.node, new Set());
    adj.get(p1.node)!.add(p2.node);
    adj.get(p2.node)!.add(p1.node);
  }
  const allTopNodes = new Set<string>();
  for (const c of horizontals) for (const p of c.pins) allTopNodes.add(p.node);
  for (const c of verticals) for (const p of c.pins) if (!isGnd(p.node)) allTopNodes.add(p.node);

  // leftmost·rightmost 추정: degree=1 인 node 2개. 없으면 sort fallback.
  //   start/end는 topology branches에 먼저 등장하는 순서로 정함 (입력 순서 보존).
  const firstAppear = new Map<string, number>();
  let appearCounter = 0;
  for (const c of [...horizontals, ...verticals]) {
    for (const p of c.pins) {
      if (isGnd(p.node)) continue;
      if (!firstAppear.has(p.node)) firstAppear.set(p.node, appearCounter++);
    }
  }
  const endpoints = Array.from(allTopNodes)
    .filter((n) => (adj.get(n)?.size ?? 0) === 1)
    .sort((a, b) => (firstAppear.get(a) ?? 999) - (firstAppear.get(b) ?? 999));
  let colNodes: string[];
  if (endpoints.length >= 2) {
    const [start, end] = [endpoints[0], endpoints[1]];
    const visited = new Set<string>([start]);
    const queue: Array<{ n: string; path: string[] }> = [{ n: start, path: [start] }];
    let walked: string[] = [start];
    while (queue.length) {
      const { n, path } = queue.shift()!;
      if (n === end) { walked = path; break; }
      for (const nb of adj.get(n) ?? []) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        queue.push({ n: nb, path: [...path, nb] });
      }
    }
    colNodes = walked;
  } else {
    colNodes = Array.from(allTopNodes).sort();
  }
  const missing = Array.from(allTopNodes).filter((n) => !colNodes.includes(n)).sort();
  colNodes = [...colNodes, ...missing];

  // ── 3) gridShape.
  const rows = 2;
  const cols = Math.max(1, colNodes.length - 1);

  // ── 4) edge 객체 생성 (공유 보장).
  const edges: Record<string, CellEdge> = {};
  const edgeId = (type: "h" | "v", r: number, c: number) => `${type}_${r}_${c}`;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = edgeId("h", r, c);
      edges[id] = { id, orientation: "horizontal", elements: [] };
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const id = edgeId("v", r, c);
      edges[id] = { id, orientation: "vertical", elements: [] };
    }
  }

  // ── 5) cell 생성.
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellId = rows === 2 && cols === 2
        ? (r === 0 ? (c === 0 ? "TL" : "TR") : (c === 0 ? "BL" : "BR"))
        : `c_${r}_${c}`;
      cells.push({
        id: cellId,
        row: r,
        col: c,
        top: edges[edgeId("h", r, c)],
        bottom: edges[edgeId("h", r + 1, c)],
        left: edges[edgeId("v", r, c)],
        right: edges[edgeId("v", r, c + 1)],
      });
    }
  }

  // ── 6) component → edge element 할당.
  const colIdx = (node: string) => colNodes.indexOf(node);
  const elementType = (c: Comp): string => {
    const t = (c.type ?? "").toUpperCase();
    if (t === "VS") return "V";
    if (t === "IS") return "I";
    return t;
  };

  // horizontal component: 같은 column-pair 그룹 중 첫 번째는 top(r=0), 나머지는 mid(r=1) 평행 가지로.
  const horizGroups = new Map<string, Comp[]>();
  for (const c of horizontals) {
    const [p1, p2] = c.pins;
    const ia = colIdx(p1.node), ib = colIdx(p2.node);
    if (ia < 0 || ib < 0) continue;
    const cMin = Math.min(ia, ib), cMax = Math.max(ia, ib);
    if (cMax - cMin !== 1) continue;
    const key = `${cMin}-${cMax}`;
    if (!horizGroups.has(key)) horizGroups.set(key, []);
    horizGroups.get(key)!.push(c);
  }
  for (const [key, comps] of horizGroups) {
    const [cMin] = key.split("-").map(Number);
    comps.forEach((c, i) => {
      // 첫 번째 → top row(r=0), 둘째 이후 → mid row(r=1) 평행 가지.
      const row = i === 0 ? 0 : 1;
      const e = edges[edgeId("h", row, cMin)];
      if (!e) return;
      e.elements.push({
        type: elementType(c),
        value: typeof c.value === "string" || typeof c.value === "number" ? c.value : undefined,
        componentId: c.id,
      });
    });
  }

  // vertical component: top pin column이 outer(c=0 or c=cols)면 row 1(하반부), inner면 row 0(상반부).
  for (const c of verticals) {
    const top = c.pins.find((p) => !isGnd(p.node));
    if (!top) continue;
    const ci = colIdx(top.node);
    if (ci < 0) continue;
    const isOuter = ci === 0 || ci === cols;
    const row = isOuter ? 1 : 0;
    const e = edges[edgeId("v", row, ci)];
    if (!e) continue;
    e.elements.push({
      type: elementType(c),
      value: typeof c.value === "string" || typeof c.value === "number" ? c.value : undefined,
      componentId: c.id,
    });
  }

  return { gridShape: { rows, cols }, cells, edges };
}

/** 인접 cell의 edge share 검증. */
export function validateCellSharing(grid: GridCircuit): true {
  const { gridShape, cells } = grid;
  const at = (r: number, c: number) => cells.find((x) => x.row === r && x.col === c);
  for (let r = 0; r < gridShape.rows; r++) {
    for (let c = 0; c < gridShape.cols; c++) {
      const cell = at(r, c);
      if (!cell) throw new Error(`cell (${r},${c}) missing`);
      const right = at(r, c + 1);
      const below = at(r + 1, c);
      if (right && cell.right !== right.left) {
        throw new Error(`cell ${cell.id}.right !== ${right.id}.left (edge share violated)`);
      }
      if (below && cell.bottom !== below.top) {
        throw new Error(`cell ${cell.id}.bottom !== ${below.id}.top (edge share violated)`);
      }
    }
  }
  return true;
}
