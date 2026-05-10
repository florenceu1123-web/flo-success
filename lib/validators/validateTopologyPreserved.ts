import type { GeneratedProblem, TopologySignature } from "@/types";
import { extractCandidateStructure, extractCandidateStructureForRoles } from "./extractCandidateStructure";

const STATE_BEFORE_ROLES = ["state_before", "switch_open", "before_state"];
const STATE_AFTER_ROLES = ["state_after", "switch_closed", "after_state"];

type Candidate =
  | GeneratedProblem
  | { figureVariants?: Array<Record<string, unknown>> };

/**
 * exam_similar(=exam_mutation) 모드 — TopologySignature를 정확하게 보존했는지 검사.
 *  - branch 수: 정확 일치
 *  - component 수: 정확 일치
 *  - branch role 분포: 정확 일치 (multiset)
 *  - feature: 모두 일치
 *  - allowed type: 정확 일치 (새 type 도입 / 기존 type 누락 모두 fail)
 *  - mesh count: ±0
 */
export function validateTopologyPreserved(
  original: TopologySignature,
  candidate: Candidate,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const actual = extractCandidateStructure(candidate);

  const expectedBranchCount = original.branches.length;
  const expectedComponentCount = original.branches.reduce(
    (s, b) => s + b.components.length,
    0,
  );

  if (actual.branchCount !== expectedBranchCount) {
    errors.push(`exam_similar: branch 수 불일치 — got ${actual.branchCount}, expected ${expectedBranchCount}. topology 정확 보존 필수`);
  }
  if (actual.componentCount !== expectedComponentCount) {
    errors.push(`exam_similar: component 수 불일치 — got ${actual.componentCount}, expected ${expectedComponentCount}`);
  }

  // role 분포 정확 비교 (양방향)
  const expRoles = countMap(original.branches.map((b) => b.role));
  const actRoles = countMap(actual.branchRoles);

  for (const [role, n] of expRoles) {
    const got = actRoles.get(role) ?? 0;
    if (got !== n) {
      errors.push(`exam_similar: branch role "${role}" 개수 불일치 — got ${got}, expected ${n}`);
    }
  }
  for (const [role, n] of actRoles) {
    if (!expRoles.has(role) && n > 0) {
      errors.push(`exam_similar: 원본에 없던 branch role 도입: "${role}" ${n}개`);
    }
  }

  // features
  const f = original.features;
  if (f.hasSwitch && !actual.hasSwitch) errors.push("exam_similar: switch 누락");
  if (f.hasDependentSource && !actual.hasDependentSource) errors.push("exam_similar: dependent source 누락");
  if (f.hasSupermesh && !actual.hasSupermesh) errors.push("exam_similar: supermesh 구조 누락 (overlay 필요)");
  if (f.hasGround && !actual.hasGround) errors.push("exam_similar: ground 누락");

  // mesh count 정확
  if (f.meshCount !== undefined && actual.meshCount !== f.meshCount) {
    errors.push(`exam_similar: mesh count 불일치 — got ${actual.meshCount}, expected ${f.meshCount}`);
  }

  // allowed types — 원본에 등장한 type만 사용 (정확 일치)
  const allowedTypes = new Set(
    original.branches.flatMap((b) => b.components.map((c) => c.type.toUpperCase())),
  );
  const usedTypes = new Set(actual.usedComponentTypes.map((t) => t.toUpperCase()));
  for (const t of usedTypes) {
    if (!allowedTypes.has(t)) {
      errors.push(`exam_similar: 원본에 없던 component type "${t}" 도입`);
    }
  }
  for (const t of allowedTypes) {
    if (!usedTypes.has(t)) {
      errors.push(`exam_similar: 원본 component type "${t}" 누락`);
    }
  }

  // ★ per-state-figure 검사 — 각 state 그림이 SW/dep을 독립적으로 가져야 함
  const figs = (candidate.figureVariants ?? []) as Array<Record<string, unknown>>;
  const hasStateBefore = figs.some((f) => STATE_BEFORE_ROLES.includes(String(f.role ?? "")));
  const hasStateAfter = figs.some((f) => STATE_AFTER_ROLES.includes(String(f.role ?? "")));

  if (f.hasSwitch) {
    if (hasStateBefore) {
      const sub = extractCandidateStructureForRoles(candidate, STATE_BEFORE_ROLES);
      if (!sub.hasSwitch) errors.push("exam_similar: state_before figure에 SW 누락");
    }
    if (hasStateAfter) {
      const sub = extractCandidateStructureForRoles(candidate, STATE_AFTER_ROLES);
      if (!sub.hasSwitch) errors.push("exam_similar: state_after figure에 SW 누락");
    }
  }
  if (f.hasDependentSource) {
    if (hasStateBefore) {
      const sub = extractCandidateStructureForRoles(candidate, STATE_BEFORE_ROLES);
      if (!sub.hasDependentSource) errors.push("exam_similar: state_before figure에 dep source 누락");
    }
    if (hasStateAfter) {
      const sub = extractCandidateStructureForRoles(candidate, STATE_AFTER_ROLES);
      if (!sub.hasDependentSource) errors.push("exam_similar: state_after figure에 dep source 누락");
    }
  }

  const dedup = Array.from(new Set(errors));
  return { ok: dedup.length === 0, errors: dedup };
}

function countMap(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return m;
}
