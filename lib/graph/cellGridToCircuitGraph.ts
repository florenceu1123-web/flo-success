/**
 * Circuit Graph Builder — GridCircuit(cells) → CircuitGraph(nodes·branches·faces).
 *
 *  파이프라인 위치:
 *   Topology Extractor → Planar Face Detector → [여기] → Validator → Renderer
 *
 *  알고리즘:
 *   1) grid node 생성 — (rows+1) × (cols+1) 위치에 GraphNode.
 *   2) edge → branch — 각 edge.elements 0개면 wire 1개, 1+이면 element마다 branch.
 *   3) face — 각 cell은 1 internal face. boundaryBranches = cell의 4 edge의 branch들.
 */

import type {
  CircuitGraph,
  GraphBranch,
  GraphFace,
  GraphNode,
  GridCircuit,
} from "@/types";

const ROW_Y = [80, 240, 400, 560, 720];  // 최대 4-row 격자까지 지원
const LEFT_X = 100;
const COL_PITCH = 160;

export function cellGridToCircuitGraph(grid: GridCircuit): CircuitGraph {
  const { gridShape, cells, edges } = grid;
  const { rows, cols } = gridShape;

  // ── 1) GraphNode 생성 — (rows+1) × (cols+1) 위치.
  const nodes: GraphNode[] = [];
  const nodeId = (r: number, c: number) => `n_${r}_${c}`;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      nodes.push({
        id: nodeId(r, c),
        x: LEFT_X + c * COL_PITCH,
        y: ROW_Y[r] ?? (80 + r * 160),
        kind: r === rows ? "ground" : "junction",
      });
    }
  }

  // ── 2) edge → branch. wire/parallel 처리.
  const branches: GraphBranch[] = [];
  let wireCounter = 0;
  for (const [edgeId, edge] of Object.entries(edges)) {
    // edge id format: "h_{r}_{c}" or "v_{r}_{c}"
    const m = edgeId.match(/^(h|v)_(\d+)_(\d+)$/);
    if (!m) continue;
    const orient = m[1] === "h" ? "horizontal" : "vertical";
    const r = Number(m[2]);
    const c = Number(m[3]);
    let fromNode: string;
    let toNode: string;
    if (orient === "horizontal") {
      // h_r_c: (r, c) → (r, c+1)
      fromNode = nodeId(r, c);
      toNode = nodeId(r, c + 1);
    } else {
      // v_r_c: (r, c) → (r+1, c)
      fromNode = nodeId(r, c);
      toNode = nodeId(r + 1, c);
    }
    if (edge.elements.length === 0) {
      // wire only
      branches.push({
        id: `w_${++wireCounter}`,
        from: fromNode,
        to: toNode,
        element: "wire",
        orientation: orient,
        row: r,
        col: c,
      });
    } else {
      for (const el of edge.elements) {
        branches.push({
          id: el.componentId ?? `e_${edgeId}_${el.type}`,
          from: fromNode,
          to: toNode,
          element: mapElement(el.type),
          value: typeof el.value === "string" || typeof el.value === "number" ? String(el.value) : undefined,
          orientation: orient,
          row: r,
          col: c,
          componentId: el.componentId,
        });
      }
    }
  }

  // ── 3) face — 각 cell이 1 internal face.
  const faces: GraphFace[] = [];
  for (const cell of cells) {
    const boundary: string[] = [];
    for (const e of [cell.top, cell.right, cell.bottom, cell.left]) {
      if (!e) continue;
      // edge에 속한 모든 branch id 수집 (wire 또는 element branch)
      const matchBranches = branches.filter((b) => {
        if (b.componentId && e.elements.some((el) => el.componentId === b.componentId)) return true;
        if (b.element === "wire") {
          // wire는 edge id로 매칭. fromNode/toNode가 edge endpoint와 일치하는지 확인.
          const eId = e.id;
          const m = eId.match(/^(h|v)_(\d+)_(\d+)$/);
          if (!m) return false;
          const orient = m[1] === "h" ? "horizontal" : "vertical";
          const r = Number(m[2]);
          const c = Number(m[3]);
          if (b.orientation !== orient) return false;
          return b.row === r && b.col === c;
        }
        return false;
      });
      for (const br of matchBranches) boundary.push(br.id);
    }
    faces.push({
      id: `f_${cell.id}`,
      boundary,
      role: "mesh",
    });
  }
  faces.push({ id: "f_outer", boundary: [], role: "outer" });

  // ── 4) Planar orientation — leftFace/rightFace 채움.
  //   horizontal branch (h_r_c): row r 위 cell이 leftFace, row r 아래 cell이 rightFace.
  //     (from→to는 좌→우, walk 방향 기준 위가 left).
  //   vertical branch (v_r_c): col c 왼쪽 cell이 leftFace, col c 오른쪽 cell이 rightFace.
  //     (from→to는 상→하, walk 방향 기준 좌가 left).
  const cellAt = (r: number, c: number): string =>
    cells.find((x) => x.row === r && x.col === c)?.id ? `f_${cells.find((x) => x.row === r && x.col === c)!.id}` : "f_outer";
  for (const b of branches) {
    const r = b.row ?? -1;
    const c = b.col ?? -1;
    if (b.orientation === "horizontal") {
      b.leftFace = r > 0 ? cellAt(r - 1, c) : "f_outer";
      b.rightFace = r < gridShape.rows ? cellAt(r, c) : "f_outer";
    } else {
      b.leftFace = c > 0 ? cellAt(r, c - 1) : "f_outer";
      b.rightFace = c < gridShape.cols ? cellAt(r, c) : "f_outer";
    }
  }

  return { nodes, branches, faces };
}

function mapElement(type: string): GraphBranch["element"] {
  const t = (type ?? "").toUpperCase();
  if (t === "R") return "R";
  if (t === "C") return "C";
  if (t === "L") return "L";
  if (t === "V") return "V";
  if (t === "I") return "I";
  if (t === "D") return "diode";
  if (t === "OPAMP") return "opamp";
  if (t === "SW") return "switch";
  return "wire";
}
