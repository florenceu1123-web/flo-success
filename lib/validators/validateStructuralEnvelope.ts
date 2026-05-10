import type { GeneratedProblem, StructuralEnvelope } from "@/types";
import { extractCandidateStructure, extractCandidateStructureForRoles } from "./extractCandidateStructure";

const STATE_BEFORE_ROLES = ["state_before", "switch_open", "before_state"];
const STATE_AFTER_ROLES = ["state_after", "switch_closed", "after_state"];

type Candidate =
  | GeneratedProblem
  | { figureVariants?: Array<Record<string, unknown>> };

/**
 * exam_variant(=new_problem) 모드 — StructuralEnvelope 범위·feature·branch role·금지 변형 검사.
 */
export function validateStructuralEnvelope(
  envelope: StructuralEnvelope,
  candidate: Candidate,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  const actual = extractCandidateStructure(candidate);

  // ---- requiredFeatures
  if (envelope.requiredFeatures.hasSwitch && !actual.hasSwitch) {
    errors.push("유사문제인데 switch가 사라짐");
  }
  if (envelope.requiredFeatures.hasDependentSource && !actual.hasDependentSource) {
    errors.push("유사문제인데 dependent source가 사라짐");
  }
  if (envelope.requiredFeatures.hasSupermesh && !actual.hasSupermesh) {
    errors.push("유사문제인데 supermesh 구조가 사라짐 (overlay='supermesh_boundary' 누락 또는 mesh 1개로 평탄화)");
  }
  if (envelope.requiredFeatures.hasGround && !actual.hasGround) {
    errors.push("유사문제인데 ground가 사라짐");
  }

  // ---- countRange
  const range = envelope.countRange;
  if (range.minBranches !== undefined && actual.branchCount < range.minBranches) {
    errors.push(`branch 수가 원본 구조보다 너무 적음 (got ${actual.branchCount}, min ${range.minBranches})`);
  }
  if (range.maxBranches !== undefined && actual.branchCount > range.maxBranches) {
    errors.push(`branch 수가 원본 구조보다 너무 많음 (got ${actual.branchCount}, max ${range.maxBranches})`);
  }
  if (range.minComponents !== undefined && actual.componentCount < range.minComponents) {
    errors.push(`component 수가 원본보다 너무 적음 (got ${actual.componentCount}, min ${range.minComponents})`);
  }
  if (range.maxComponents !== undefined && actual.componentCount > range.maxComponents) {
    errors.push(`component 수가 원본보다 너무 많음 (got ${actual.componentCount}, max ${range.maxComponents})`);
  }
  if (range.minMeshes !== undefined && actual.meshCount < range.minMeshes) {
    errors.push(`mesh 수가 원본 구조보다 너무 적음 (got ${actual.meshCount}, min ${range.minMeshes}). series chain으로 평탄화 금지`);
  }
  if (range.maxMeshes !== undefined && actual.meshCount > range.maxMeshes) {
    errors.push(`mesh 수가 원본 구조보다 너무 많음 (got ${actual.meshCount}, max ${range.maxMeshes})`);
  }

  // ---- requiredBranchRoles (분포 비교 — 각 role의 등장 횟수 ≥ envelope의 등장 횟수)
  const requiredRoleCounts = countMap(envelope.requiredBranchRoles);
  const actualRoleCounts = countMap(actual.branchRoles);
  for (const [role, requiredCount] of requiredRoleCounts) {
    const got = actualRoleCounts.get(role) ?? 0;
    if (got < requiredCount) {
      errors.push(`필수 branch role 부족: ${role} (got ${got}, required ≥ ${requiredCount})`);
    }
  }

  // ---- allowedComponentTypes (있으면) — 원본에 없던 type을 새로 도입하면 fail
  if (envelope.allowedComponentTypes.length > 0) {
    const allowed = new Set(envelope.allowedComponentTypes.map((t) => t.toUpperCase()));
    const extra = actual.usedComponentTypes
      .map((t) => t.toUpperCase())
      .filter((t) => !allowed.has(t));
    if (extra.length > 0) {
      errors.push(`원본에 없던 component type 도입: ${extra.join(", ")} (allowed: ${envelope.allowedComponentTypes.join(", ")})`);
    }
  }

  // ---- forbiddenSimplifications (몇 가지 주요 패턴은 자동 탐지)
  for (const rule of envelope.forbiddenSimplifications) {
    switch (rule) {
      case "do_not_reduce_to_single_series_loop": {
        // 원본 mesh ≥ 2였는데 생성이 1로 줄면 fail
        const minMeshes = envelope.countRange.minMeshes ?? 0;
        if (minMeshes >= 2 && actual.meshCount < 2) {
          errors.push("forbidden: 원본 multi-mesh를 single series loop로 평탄화");
        }
        break;
      }
      case "do_not_remove_switch":
        if (envelope.requiredFeatures.hasSwitch && !actual.hasSwitch) {
          // 이미 위에서 잡지만, 명시 메시지로 한 번 더 쌓기 (retry hint 가독성)
          errors.push("forbidden: switch 제거 금지");
        }
        break;
      case "do_not_remove_dependent_source":
        if (envelope.requiredFeatures.hasDependentSource && !actual.hasDependentSource) {
          errors.push("forbidden: dependent source 제거 금지");
        }
        break;
      // "do_not_remove_state_figures" / "do_not_collapse_multi_output_to_single_output"는
      // 다른 validator(figureRequirements/multi_output_lost)가 잡으므로 여기선 skip
    }
  }

  // ★ per-state-figure 검사 — 각 state 그림이 SW/dep을 독립적으로 가져야 함
  const figs = (candidate.figureVariants ?? []) as Array<Record<string, unknown>>;
  const hasStateBefore = figs.some((f) => STATE_BEFORE_ROLES.includes(String(f.role ?? "")));
  const hasStateAfter = figs.some((f) => STATE_AFTER_ROLES.includes(String(f.role ?? "")));

  if (envelope.requiredFeatures.hasSwitch) {
    if (hasStateBefore) {
      const sub = extractCandidateStructureForRoles(candidate, STATE_BEFORE_ROLES);
      if (!sub.hasSwitch) errors.push("state_before figure에 SW 누락 — 열린 SW도 명시적 component로 그려야 함");
    }
    if (hasStateAfter) {
      const sub = extractCandidateStructureForRoles(candidate, STATE_AFTER_ROLES);
      if (!sub.hasSwitch) errors.push("state_after figure에 SW 누락 — 닫힌 SW도 명시적 component로 그려야 함");
    }
  }
  if (envelope.requiredFeatures.hasDependentSource) {
    if (hasStateBefore) {
      const sub = extractCandidateStructureForRoles(candidate, STATE_BEFORE_ROLES);
      if (!sub.hasDependentSource) errors.push("state_before figure에 dependent source 누락");
    }
    if (hasStateAfter) {
      const sub = extractCandidateStructureForRoles(candidate, STATE_AFTER_ROLES);
      if (!sub.hasDependentSource) errors.push("state_after figure에 dependent source 누락");
    }
  }

  // 중복 메시지 제거
  const dedup = Array.from(new Set(errors));
  return { ok: dedup.length === 0, errors: dedup };
}

function countMap(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return m;
}
