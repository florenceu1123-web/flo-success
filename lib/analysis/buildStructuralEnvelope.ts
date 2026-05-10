import type { StructuralEnvelope, TopologySignature } from "@/types";

/**
 * TopologySignature에서 StructuralEnvelope를 derive한다.
 *
 *  - exam_similar 흐름: TopologySignature를 그대로 GPT에게 전달 → branches 보존
 *  - exam_variant 흐름: 이 envelope를 GPT에게 전달 → 범위 안에서 자유 변형
 *  - validator: envelope.countRange / requiredBranchRoles / allowedComponentTypes / forbiddenSimplifications 검사
 */
export function buildStructuralEnvelope(
  signature: TopologySignature,
): StructuralEnvelope {
  const branchCount = signature.branches.length;
  const componentCount = signature.branches.reduce(
    (sum, b) => sum + b.components.length,
    0,
  );

  return {
    subjectKey: signature.subjectKey,
    family: signature.family,

    requiredFeatures: {
      hasSwitch: signature.features.hasSwitch,
      hasDependentSource: signature.features.hasDependentSource,
      hasGround: signature.features.hasGround,
      hasSupermesh: signature.features.hasSupermesh,
    },

    countRange: {
      minBranches: Math.max(1, branchCount - 1),
      maxBranches: branchCount + 1,
      minComponents: Math.max(1, componentCount - 2),
      maxComponents: componentCount + 2,
      minMeshes: Math.max(1, (signature.features.meshCount ?? 1) - 1),
      maxMeshes: (signature.features.meshCount ?? 1) + 1,
    },

    requiredBranchRoles: signature.branches.map((b) => b.role),

    allowedComponentTypes: Array.from(
      new Set(
        signature.branches.flatMap((b) =>
          b.components.map((c) => c.type),
        ),
      ),
    ),

    forbiddenSimplifications: [
      "do_not_reduce_to_single_series_loop",
      "do_not_remove_switch",
      "do_not_remove_dependent_source",
      "do_not_remove_state_figures",
      "do_not_collapse_multi_output_to_single_output",
    ],
  };
}
