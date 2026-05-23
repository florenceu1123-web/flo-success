/**
 * Topology pattern detection — role·구조 기준, 이름 무관.
 *
 *   semantic graph
 *     → role assignment (analyzer가 부여)
 *     → ★ pattern detect (여기) ★
 *     → layout template 선택
 *     → render
 *
 *   각 pattern은 role 카운트·branch type·평행 가지 구조로만 판정.
 *   특정 node id("n_v1" 등)나 라벨("V_1") 직접 비교 금지.
 *
 *   ★ 절대 금지:
 *     - 노드 이름 고정 (예: id === "n_left")
 *     - 문제별 하드코딩 (예: "임용 10번 전용")
 *     - 라벨 직접 비교 (예: label === "V_3")
 *
 *   ★ 허용:
 *     - 노드 role 카운트 (예: role="main_unknown" 개수)
 *     - branch type·연결 패턴 (예: parallel R+I 사이 main_unknown-right_unknown)
 *     - structural invariant (예: degree, mesh count)
 */

import type { SemanticGraphWithBranches } from "./semanticContract";
import {
  ContractError,
  nodeByRole,
  nodeByRoleOptional,
  requireBranch,
  requireParallelBranches,
  requireAtLeastOneBranch,
} from "./semanticContract";

/** 검출된 pattern의 식별자. layout template과 1:1 매칭. */
export type TopologyPattern =
  | "2_node_nodal_dc"
  // future:
  // | "3_node_nodal_dc"
  // | "thevenin_max_power"
  // | "switched_rlc_5leg"
  | "unknown";

/**
 * 2-node Nodal DC pattern — imyong 10번 형식의 일반화.
 *
 *   필수 구조:
 *     - 노드 role: source_plus 1 + main_unknown 1 + right_unknown 1 + ground 1 (정확히 4 노드)
 *     - V (vsource) : source_plus ↔ ground
 *     - R_VAR       : main_unknown ↔ ground
 *     - R (load)    : right_unknown ↔ ground
 *     - parallel(R,I) : main_unknown ↔ right_unknown
 *     - R(top)      : source_plus ↔ main_unknown 적어도 1개
 *
 *   임의의 노드 id·라벨에 무관 — role 기준으로만 매칭.
 *   contract 위반 시 ContractError throw.
 */
export function is2NodeNodalDC(g: SemanticGraphWithBranches): boolean {
  try {
    const sourcePlus = nodeByRole(g, "source_plus");
    const v1 = nodeByRole(g, "main_unknown");
    const v2 = nodeByRole(g, "right_unknown");
    const gnd = nodeByRole(g, "ground");

    requireBranch(g, "V", sourcePlus, gnd);
    requireBranch(g, "R_VAR", v1, gnd);
    requireBranch(g, "R", v2, gnd);
    requireParallelBranches(g, v1, v2, ["R", "I"]);
    requireAtLeastOneBranch(g, sourcePlus, v1, "R");
    return true;
  } catch (e) {
    if (e instanceof ContractError) return false;
    throw e;
  }
}

/**
 * Pattern dispatch — 검출 우선순위에 따라 첫 번째 match 반환.
 *   매칭 안 되면 "unknown" (layout template은 generic fallback 사용).
 */
export function detectPattern(g: SemanticGraphWithBranches): TopologyPattern {
  if (is2NodeNodalDC(g)) return "2_node_nodal_dc";
  return "unknown";
}

/**
 * Validation helper — pattern을 명시 강제. 위반 시 throw.
 *   각 pattern의 contract를 한 번에 검증해 명확한 에러 메시지 제공.
 */
export function assertPattern(g: SemanticGraphWithBranches, expected: TopologyPattern): void {
  if (expected === "2_node_nodal_dc") {
    const sourcePlus = nodeByRole(g, "source_plus");
    const v1 = nodeByRole(g, "main_unknown");
    const v2 = nodeByRole(g, "right_unknown");
    const gnd = nodeByRole(g, "ground");
    requireBranch(g, "V", sourcePlus, gnd);
    requireBranch(g, "R_VAR", v1, gnd);
    requireBranch(g, "R", v2, gnd);
    requireParallelBranches(g, v1, v2, ["R", "I"]);
    requireAtLeastOneBranch(g, sourcePlus, v1, "R");
    return;
  }
  if (expected === "unknown") return;
  throw new ContractError("PATTERN_UNKNOWN", `Pattern "${expected}" not implemented`);
}

// import 보존
void nodeByRoleOptional;
