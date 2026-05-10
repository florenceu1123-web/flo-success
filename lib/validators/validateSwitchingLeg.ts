import type { BranchTemplate } from "@/lib/generation/branchTemplate";

/**
 * SW가 들어있는 모든 branch는 반드시:
 *  - role = "switching_leg"
 *  - orientation = "vertical"
 *  - components에 SW + R + (I 또는 V) 모두 포함
 *
 * 어기면 critical fail.
 */
export function validateSwitchingLeg(branches: BranchTemplate[]): string[] {
  const errors: string[] = [];

  const swBranches = branches.filter((b) =>
    b.components.some((c) => c.type === "SW"),
  );

  for (const b of swBranches) {
    if (b.role !== "switching_leg") {
      errors.push(`SW가 switching_leg가 아닌 branch에 있음: ${b.id} (role=${b.role})`);
    }
    if (b.orientation !== "vertical") {
      errors.push(`switching_leg는 vertical이어야 함: ${b.id} (orientation=${b.orientation})`);
    }
    const types = b.components.map((c) => c.type);
    if (!types.includes("SW")) errors.push(`${b.id}: SW 누락`);
    if (!types.includes("R")) errors.push(`${b.id}: switching_leg resistor 누락 (SW+R+I 직렬 chain 필수)`);
    if (!types.includes("I") && !types.includes("V")) {
      errors.push(`${b.id}: switching_leg source 누락 (I 또는 V 필요)`);
    }
  }

  // SW가 어떤 branch에도 없으면? 이 검사는 "SW 있어야 함"이 아니라 "SW가 있다면 ..." 강제
  // (SW 존재 여부는 features.hasSwitch 별도 검사)

  return errors;
}
