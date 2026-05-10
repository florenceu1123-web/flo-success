import type { GeneratedProblem } from "@/types";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);
const DEP_TYPES = new Set(["VCCS", "VCVS", "CCCS", "CCVS"]);

export type CandidateStructure = {
  hasSwitch: boolean;
  hasDependentSource: boolean;
  hasSupermesh: boolean;
  hasGround: boolean;
  branchCount: number;
  componentCount: number;
  branchRoles: string[];
  /** 사용된 component type 집합 (allowedComponentTypes 검사용) */
  usedComponentTypes: string[];
  /** mesh count 추정 (Euler) */
  meshCount: number;
};

type Candidate =
  | GeneratedProblem
  | { figureVariants?: Array<Record<string, unknown>> };

/**
 * candidate를 지정된 role의 figure만 골라 sub-candidate로 만들어 추출.
 * state_before/after 같은 figure 단위 검사에 사용.
 */
export function extractCandidateStructureForRoles(
  candidate: Candidate,
  acceptedRoles: string[],
): CandidateStructure {
  const accepted = new Set(acceptedRoles);
  const filtered = (candidate.figureVariants ?? []).filter(
    (f) => accepted.has(String((f as Record<string, unknown>).role ?? "")),
  );
  return extractCandidateStructure({ figureVariants: filtered });
}

/**
 * candidate(generated 문제)에서 구조 정보를 추출 — validateStructuralEnvelope·forbiddenSimplifications 검사 입력.
 * 회로 figure(analog_netlist / analog_mesh_network)에서 component를 walk하며 분류.
 */
export function extractCandidateStructure(candidate: Candidate): CandidateStructure {
  let hasSwitch = false;
  let hasDependentSource = false;
  let hasSupermesh = false;
  let hasGround = false;
  let branchCount = 0;
  let componentCount = 0;
  const branchRoles: string[] = [];
  const usedComponentTypes = new Set<string>();
  let nodeCount = 0;
  let totalBranches = 0;

  const figs = (candidate.figureVariants ?? []) as Array<Record<string, unknown>>;

  for (const fig of figs) {
    const dt = fig.diagramType;
    if (dt !== "analog_netlist" && dt !== "analog_mesh_network") continue;

    // overlays — supermesh boundary
    const overlays = (fig as { overlays?: string[] }).overlays;
    if (Array.isArray(overlays) && overlays.includes("supermesh_boundary")) {
      hasSupermesh = true;
    }

    const diagram = fig.diagram as
      | { components?: Array<Record<string, unknown>>; ground?: string }
      | undefined;
    if (!diagram) continue;

    // ground 식별
    const groundIds = new Set<string>();
    if (diagram.ground) groundIds.add(diagram.ground);
    for (const c of diagram.components ?? []) {
      const type = String(c.type ?? "").toUpperCase();
      if (type === "GND") {
        hasGround = true;
        for (const p of (c.pins as Array<{ node?: string }> | undefined) ?? []) {
          if (p.node) groundIds.add(p.node);
        }
      }
      for (const p of (c.pins as Array<{ node?: string }> | undefined) ?? []) {
        if (p.node && GROUND_LABELS.has(p.node)) {
          groundIds.add(p.node);
          hasGround = true;
        }
      }
    }
    if (groundIds.size > 0) hasGround = true;

    // node count (Euler용)
    const allNodes = new Set<string>();

    for (const c of diagram.components ?? []) {
      const type = String(c.type ?? "").toUpperCase();
      if (type === "GND") continue;
      const pins = (c.pins as Array<{ node?: string }> | undefined) ?? [];
      for (const p of pins) if (p.node) allNodes.add(p.node);
    }

    // figure 단위 mesh 추정만 의미 있음
    for (const c of diagram.components ?? []) {
      const type = String(c.type ?? "").toUpperCase();
      if (type === "GND") continue;
      componentCount++;
      branchCount++;
      totalBranches++;
      usedComponentTypes.add(type);

      if (type === "SW") hasSwitch = true;
      if (DEP_TYPES.has(type)) hasDependentSource = true;

      branchRoles.push(classifyBranchRole(c, groundIds));
    }

    nodeCount = Math.max(nodeCount, allNodes.size + (groundIds.size > 0 ? 1 : 0));
  }

  // mesh = branch - node + 1 (planar Euler)
  const meshCount = Math.max(0, totalBranches - nodeCount + 1);

  return {
    hasSwitch,
    hasDependentSource,
    hasSupermesh,
    hasGround,
    branchCount,
    componentCount,
    branchRoles,
    usedComponentTypes: Array.from(usedComponentTypes),
    meshCount,
  };
}

/**
 * 한 component의 branch role 분류.
 *  - V/I/dep/SW → 종류별 leg
 *  - R/L/C/D → ground 닿으면 load_leg, 아니면 top_rail_resistor
 *  - 그 외 → mesh_only_branch
 */
function classifyBranchRole(
  c: Record<string, unknown>,
  groundIds: Set<string>,
): string {
  const type = String(c.type ?? "").toUpperCase();
  switch (type) {
    case "V":  return "voltage_source_leg";
    case "I":  return "current_source_leg";
    case "VCCS":
    case "VCVS":
    case "CCCS":
    case "CCVS": return "dependent_source_leg";
    case "SW": return "switching_leg";
    case "R":
    case "L":
    case "C":
    case "D": {
      const pins = (c.pins as Array<{ node?: string }> | undefined) ?? [];
      const touchesGround = pins.some((p) => p.node && groundIds.has(p.node));
      return touchesGround ? "load_leg" : "top_rail_resistor";
    }
    default: return "mesh_only_branch";
  }
}
