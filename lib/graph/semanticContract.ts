/**
 * Semantic graph 검증 — 이름이 아닌 role로 contract 정의.
 *
 *   사용 예 (imyong 10번 형식 = "2-node nodal DC pattern"):
 *
 *     const sourcePlus = nodeByRole(g, "source_plus");
 *     const v1         = nodeByRole(g, "main_unknown");
 *     const v2         = nodeByRole(g, "right_unknown");
 *     const gnd        = nodeByRole(g, "ground");
 *
 *     requireBranch(g, "V",     sourcePlus, gnd);
 *     requireBranch(g, "R_VAR", v1,         gnd);
 *     requireBranch(g, "R",     v2,         gnd);
 *     requireParallelBranches(g, v1, v2, ["R", "I"]);
 *     requireAtLeastOneBranch(g, sourcePlus, v1, "R");
 *
 *   범용성: 특정 node id에 묶이지 않으므로 같은 contract가 다른 회로에도 적용.
 *
 *   파이프라인:
 *     semantic graph → role assignment → pattern detect → layout template → render
 */

import type { NodeRole, SemanticGraph, SemanticNode } from "./semanticRender";

/** Branch — component type + 양 단자 노드 id. semantic 검증용 단순 형태. */
export type SemanticBranch = {
  readonly id: string;
  readonly type: string;       // "V" | "I" | "R" | "R_VAR" | "L" | "C" | ...
  readonly from: string;       // semantic node id
  readonly to: string;         // semantic node id
};

/** SemanticGraph + branches — Edge를 type 포함 branch로 확장. */
export type SemanticGraphWithBranches = SemanticGraph & {
  readonly branches: readonly SemanticBranch[];
};

/** ContractError — role mismatch·missing 등 검증 실패. */
export class ContractError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "ContractError";
  }
}

/**
 * 특정 role을 가진 노드 1개 반환. 정확히 1개여야 한다.
 *   0개·2개 이상이면 throw — semantic graph가 contract와 어긋남.
 */
export function nodeByRole(g: { nodes: readonly SemanticNode[] }, role: NodeRole): SemanticNode {
  const matches = g.nodes.filter((n) => n.role === role);
  if (matches.length === 0) {
    throw new ContractError("ROLE_MISSING", `node with role="${role}" not found`);
  }
  if (matches.length > 1) {
    throw new ContractError("ROLE_DUPLICATE", `multiple nodes with role="${role}": ${matches.map((n) => n.id).join(", ")}`);
  }
  return matches[0];
}

/** role을 가진 노드 옵셔널 — 0개면 null, 1개면 그 노드, 2개 이상이면 throw. */
export function nodeByRoleOptional(g: { nodes: readonly SemanticNode[] }, role: NodeRole): SemanticNode | null {
  const matches = g.nodes.filter((n) => n.role === role);
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new ContractError("ROLE_DUPLICATE", `multiple nodes with role="${role}"`);
  }
  return matches[0];
}

/**
 * 무방향 branch 매칭 — (from↔to) 사이에 type 컴포넌트가 정확히 하나 존재해야 한다.
 */
export function requireBranch(
  g: SemanticGraphWithBranches,
  type: string,
  from: SemanticNode,
  to: SemanticNode,
): SemanticBranch {
  const matches = findBranches(g, type, from.id, to.id);
  if (matches.length === 0) {
    throw new ContractError("BRANCH_MISSING", `no ${type} between ${from.id}(${from.role}) and ${to.id}(${to.role})`);
  }
  if (matches.length > 1) {
    throw new ContractError("BRANCH_DUPLICATE", `multiple ${type} between ${from.id}(${from.role}) and ${to.id}(${to.role})`);
  }
  return matches[0];
}

/**
 * 두 노드 사이에 정확히 명시된 type들이 ★각각 1개씩★ 평행 존재해야 함.
 *   예: requireParallelBranches(g, v1, v2, ["R", "I"]) — R 1개와 I 1개가 v1↔v2 사이 평행.
 */
export function requireParallelBranches(
  g: SemanticGraphWithBranches,
  from: SemanticNode,
  to: SemanticNode,
  types: readonly string[],
): SemanticBranch[] {
  const result: SemanticBranch[] = [];
  for (const t of types) {
    const matches = findBranches(g, t, from.id, to.id);
    if (matches.length === 0) {
      throw new ContractError(
        "PARALLEL_MISSING",
        `no ${t} between ${from.id}(${from.role}) and ${to.id}(${to.role}) (parallel set ${types.join(",")} 요구)`,
      );
    }
    result.push(matches[0]);
  }
  return result;
}

/** 무방향 branch가 ≥ 1개 존재해야 함 (평행은 허용). */
export function requireAtLeastOneBranch(
  g: SemanticGraphWithBranches,
  from: SemanticNode,
  to: SemanticNode,
  type: string,
): SemanticBranch[] {
  const matches = findBranches(g, type, from.id, to.id);
  if (matches.length === 0) {
    throw new ContractError(
      "BRANCH_MISSING",
      `at least one ${type} between ${from.id}(${from.role}) and ${to.id}(${to.role}) 요구`,
    );
  }
  return matches;
}

/** type·무방향 매칭 helper. */
function findBranches(
  g: SemanticGraphWithBranches,
  type: string,
  a: string,
  b: string,
): SemanticBranch[] {
  return g.branches.filter(
    (br) =>
      br.type === type &&
      ((br.from === a && br.to === b) || (br.from === b && br.to === a)),
  );
}

/**
 * 모든 semantic node가 role을 가졌는지 확인 — phantom junction 차단.
 */
export function requireAllRolesAssigned(g: { nodes: readonly SemanticNode[] }): void {
  const unassigned = g.nodes.filter((n) => !n.role);
  if (unassigned.length > 0) {
    throw new ContractError(
      "ROLE_UNASSIGNED",
      `role 없는 semantic node: ${unassigned.map((n) => n.id).join(", ")} — phantom junction일 가능성`,
    );
  }
}

