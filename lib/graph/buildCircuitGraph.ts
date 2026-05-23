/**
 * CircuitGraph 빌더 — face-aware planar graph.
 *
 *  파이프라인:
 *   Image → Topology Extractor → Planar Face Detector(buildCellGrid)
 *        → Circuit Graph Builder(cellGridToCircuitGraph) [여기에서 호출]
 *        → Constraint Validator → Renderer
 *
 *  진입점: buildCircuitGraph(netlist) — 내부적으로 buildCellGrid + cellGridToCircuitGraph 합성.
 *  외부 노출: CircuitGraph (nodes·branches·faces).
 */

import type { CircuitGraph, CircuitNetlist } from "@/types";
import { buildCellGrid, validateCellSharing } from "./buildCellGrid";
import { cellGridToCircuitGraph } from "./cellGridToCircuitGraph";

export function buildCircuitGraph(netlist: CircuitNetlist): CircuitGraph {
  // Step 1+2: outline → row/column skeleton → planar cell grid 생성.
  const grid = buildCellGrid(netlist);
  // edge 공유 검증 (TL.right === TR.left 등).
  validateCellSharing(grid);
  // Step 3: cells → CircuitGraph (nodes, branches, faces).
  return cellGridToCircuitGraph(grid);
}
