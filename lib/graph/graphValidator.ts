/**
 * Graph Validator (2026-06-01, Framework refactor 4단계).
 *
 * Canonical Graph의 자체-일관성을 검증해 confidence 점수를 매긴다.
 * GPT가 connectivity를 잘못 뽑으면(floating node·끊긴 그래프·short 등) 여기서 잡아
 * 낮은 confidence로 표면화(후속: 재시도 트리거).
 *
 * 검증 항목:
 *  · empty            — node/edge 없음 (치명)
 *  · disconnected     — connected component ≥ 2 (회로가 끊김 — 보통 wire 누락)
 *  · floating/dangling — 비접지 degree-1 노드 (한 소자에만 붙음 → 매달린 노드)
 *  · no_ground        — ground 노드 없음 (analog 회로는 보통 필요)
 *  · no_mesh          — cycle 0 (loop 없는 단순 직렬 — RLC/mesh 문제에선 의심)
 *
 * degree-1·no_ground·no_mesh는 외부 단자/개념 회로에서 정상일 수 있어 warning(감점 작음).
 * disconnected·empty는 강한 감점.
 */

import type { CanonicalGraph } from "@/lib/graph/canonical";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/graph/graphValidator");

export type GraphValidation = {
  ok: boolean;
  /** 0~1. 1에 가까울수록 신뢰. */
  confidence: number;
  errors: string[];
  warnings: string[];
  /** degree-1(매달린) 비접지 노드 목록. */
  floatingNodes: string[];
};

function isGnd(node: string): boolean {
  const n = node.toUpperCase();
  return n === "GND" || n === "GROUND" || n === "0";
}

export function validateCanonicalGraph(graph: CanonicalGraph): GraphValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let confidence = 1;

  const { nodeCount, edgeCount, cycleCount, connectedComponentCount, degree } = graph.features;

  // 1. empty (치명)
  if (nodeCount === 0 || edgeCount === 0) {
    errors.push("그래프가 비어 있음 (node 또는 edge 0) — connectivity 추출 실패");
    return { ok: false, confidence: 0, errors, warnings, floatingNodes: [] };
  }

  // 2. disconnected — 회로가 두 조각 이상 (보통 wire 누락)
  if (connectedComponentCount > 1) {
    errors.push(`그래프가 ${connectedComponentCount}조각으로 끊김 — 누락된 wire/연결 의심`);
    confidence -= 0.4 * (connectedComponentCount - 1);
  }

  // 3. floating/dangling — 비접지 degree-1 노드
  const floatingNodes = graph.nodes.filter((n) => !isGnd(n) && (degree[n] ?? 0) < 2);
  if (floatingNodes.length > 0) {
    warnings.push(`매달린(degree<2) 노드: ${floatingNodes.join(", ")} — 외부 단자가 아니면 연결 누락`);
    confidence -= 0.15 * floatingNodes.length;
  }

  // 4. no ground
  if (!graph.groundId) {
    warnings.push("ground 노드 없음 — analog 회로면 GND 누락 의심");
    confidence -= 0.1;
  }

  // 5. no mesh (cycle 0) — loop 없는 단순 직렬. mesh/공진 문제에선 의심.
  if (cycleCount === 0) {
    warnings.push("cycle 0 (닫힌 loop 없음) — mesh/공진 회로면 연결 누락 의심");
    confidence -= 0.1;
  }

  confidence = Math.max(0, Math.min(1, confidence));
  const ok = errors.length === 0;
  log.info("graph_validated", { ok, confidence: Number(confidence.toFixed(2)), errors, warnings, floatingNodes });
  return { ok, confidence, errors, warnings, floatingNodes };
}
