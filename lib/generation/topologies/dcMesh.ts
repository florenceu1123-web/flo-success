import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import {
  NICE_RESISTORS,
  NICE_VOLTAGES,
  makeRand,
  pick,
  round3,
} from "./_helpers";
import {
  DEFAULT_BRANCH_RULES,
  assembleNetlist,
  instantiateAnalogTemplate,
  validateBranchTemplate,
  type AnalogValueAssignment,
  type BranchTemplate,
} from "@/lib/generation/branchTemplate";
import { createLogger } from "@/lib/logger";

const dmlog = createLogger("lib/generation/topologies/dcMesh");

function assembleViaBT(args: {
  branches: BranchTemplate[];
  values: AnalogValueAssignment[];
  metadata?: Pick<CircuitNetlist, "nodeAnnotations" | "measurementMarks" | "positions">;
}): CircuitNetlist {
  const enriched = args.branches.map((b) => ({ ...b, rules: b.rules ?? DEFAULT_BRANCH_RULES[b.role] }));
  const validation = validateBranchTemplate(enriched);
  if (!validation.ok) dmlog.warn("branch_template_violation", { issues: validation.issues });
  const inst = instantiateAnalogTemplate(enriched, args.values);
  return { ...assembleNetlist(inst, "GND"), ...args.metadata };
}

/**
 * DC Mesh 해석 문제 generator — 2-mesh / 3-mesh 회로의 각 branch 전류 계산.
 *
 *  솔버: solveMNA로 노드 전압 → 각 저항 양단 전압차 / R = 전류.
 *  V 소스의 전류는 vsourceCurrents에서 직접 추출.
 *
 *  현 phase: 한 archetype.
 *    - "two_mesh_shared_R": V1, V2, 3개 저항 (R1, R3 = 외측 ; R2 = 공유)
 */

export type DcMeshArchetype = "two_mesh_shared_R";

export type DcMeshGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  /** 결과 — 각 저항을 통과하는 전류 (양수 방향은 R.a→R.b) */
  branchCurrents: Record<string, number>;
  /** 정답 — GPT가 question에서 묻는 대상 */
  targetBranch: string;
  /** 해당 전류값 (양수 또는 음수) — 풀이가 어느 방향 기준인지 명시 */
  targetCurrent: number;
  archetype: DcMeshArchetype;
  values: Record<string, number>;
};

export function generateDcMesh(args: {
  params?: CircuitTypeParams;
  archetype?: DcMeshArchetype;
  seed?: number;
  /** 어느 가지 전류를 물을지 — 미지정이면 랜덤 (R1/R2/R3 중 하나) */
  targetBranch?: string;
}): DcMeshGeneration {
  const rand = makeRand(args.seed);
  const archetype: DcMeshArchetype = args.archetype ?? "two_mesh_shared_R";
  return buildTwoMeshSharedR(rand, args.targetBranch);
}

// =====================================================================
// Archetype: 두 mesh가 공유 저항 R2를 가지는 회로
//   ●─R1─●─R3─●
//   │    │    │
//   V1  R2   V2
//   │    │    │
//   ●────●────● (GND)
//
//   - top_left, top_mid, top_right 세 top 노드
//   - GND
//   - V1: GND → top_left (left mesh의 V)
//   - R1: top_left → top_mid (top rail 좌)
//   - R3: top_mid → top_right (top rail 우)
//   - R2: top_mid → GND (공유 가지)
//   - V2: GND → top_right (right mesh의 V)
// =====================================================================
function buildTwoMeshSharedR(rand: () => number, targetBranch?: string): DcMeshGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const V2 = pick(NICE_VOLTAGES, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  const R2 = pick(NICE_RESISTORS, rand);
  const R3 = pick(NICE_RESISTORS, rand);

  const solverNet: SolverNetwork = {
    nodeIds: ["top_left", "top_mid", "top_right"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top_left",  b: "top_mid",   R: R1 },
      { id: "R3", a: "top_mid",   b: "top_right", R: R3 },
      { id: "R2", a: "top_mid",   b: "GND",       R: R2 },
    ],
    vsources: [
      { id: "V1", a: "top_left",  b: "GND", V: V1 },
      { id: "V2", a: "top_right", b: "GND", V: V2 },
    ],
    isources: [],
  };

  const sol = solveMNA(solverNet);

  // 각 저항 전류 (a → b 방향 양수)
  const branchCurrents: Record<string, number> = {};
  for (const r of solverNet.resistors) {
    const I = (sol.nodeVoltages[r.a] - sol.nodeVoltages[r.b]) / r.R;
    branchCurrents[r.id] = round3(I);
  }

  // target branch 결정
  const choices = ["R1", "R2", "R3"];
  const target = targetBranch && choices.includes(targetBranch)
    ? targetBranch
    : choices[Math.floor(rand() * choices.length)];

  const netlist = assembleViaBT({
    branches: [
      { id: "br_V1", role: "left_source_leg", orientation: "vertical", fromNode: "top_left", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V1" }] },
      { id: "br_R1", role: "top_rail", orientation: "horizontal", fromNode: "top_left", toNode: "top_mid",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_R2", role: "load_leg", orientation: "vertical", fromNode: "top_mid", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R2" }] },
      { id: "br_R3", role: "top_rail", orientation: "horizontal", fromNode: "top_mid", toNode: "top_right",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R3" }] },
      { id: "br_V2", role: "right_source_leg", orientation: "vertical", fromNode: "top_right", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V2" }] },
    ],
    values: [
      { branchId: "br_V1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1}Ω` },
      { branchId: "br_R2", componentRole: "resistor", type: "R", value: `${R2}Ω` },
      { branchId: "br_R3", componentRole: "resistor", type: "R", value: `${R3}Ω` },
      { branchId: "br_V2", componentRole: "voltage_source", type: "V", value: `${V2}V` },
    ],
  });

  return {
    netlist, solverNet, branchCurrents,
    targetBranch: target,
    targetCurrent: branchCurrents[target],
    archetype: "two_mesh_shared_R",
    values: { V1, V2, R1, R2, R3 },
  };
}
