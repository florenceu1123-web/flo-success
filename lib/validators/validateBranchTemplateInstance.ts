import type { BranchTemplate, InstantiatedBranch } from "@/lib/generation/branchTemplate";

/**
 * template 정의대로 instance가 만들어졌는지 검사.
 *  - branch id 모두 존재
 *  - orientation 일치
 *  - 각 component(role+type) 존재
 *  - components 개수 일치 (required=true 기준)
 */
export function validateBranchTemplateInstance(
  template: BranchTemplate[],
  instance: InstantiatedBranch[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const branch of template) {
    const actual = instance.find((b) => b.id === branch.id);
    if (!actual) {
      errors.push(`branch 누락: ${branch.id}`);
      continue;
    }
    if (actual.orientation !== branch.orientation) {
      errors.push(
        `branch orientation 오류: ${branch.id} (expected ${branch.orientation}, got ${actual.orientation})`,
      );
    }
    if (actual.role !== branch.role) {
      errors.push(`branch role 오류: ${branch.id} (expected ${branch.role}, got ${actual.role})`);
    }
    if (actual.fromNode !== branch.fromNode || actual.toNode !== branch.toNode) {
      errors.push(`branch endpoint 오류: ${branch.id}`);
    }

    for (const req of branch.components) {
      const found = actual.instantiated?.find(
        (c) => c.role === req.role && c.type === req.type,
      );
      if (!found && req.required) {
        errors.push(`필수 소자 누락: ${branch.id}/${req.role}/${req.type}`);
      }
    }
    if ((actual.instantiated?.length ?? 0) !== branch.components.length) {
      errors.push(
        `component 개수 오류: ${branch.id} (expected ${branch.components.length}, got ${actual.instantiated?.length ?? 0})`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
