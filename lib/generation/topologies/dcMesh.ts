import type { CircuitComponent, CircuitNetlist, CircuitTypeParams } from "@/types";
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
// 쌍대(dual) — 2-mesh(전압원·메시전류)의 쌍대 = 2-node(전류원·노드전압).
//   V↔I, R↔G(=1/R), 메시↔노드 (스케일 R₀=10). 메시1·2 → 노드 D1·D2, 외부메시 → GND.
//   원본 branch 전류 ↔ 쌍대 branch 전압 (×R₀).
//   원본: V1(좌)·R1·R2(공유)·R3·V2(우) →
//   쌍대: I1∥R1'(D1), R2'(D1-D2 브리지), I2∥R3'(D2). 노드전압/branch전압 해석.
// =====================================================================
const DC_MESH_DUAL_R0 = 10;

export type DcMeshDualGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  /** 각 저항 양단 전압 (D1·D2 기준). */
  branchVoltages: Record<string, number>;
  nodeVoltages: { D1: number; D2: number };
  targetBranch: string;   // "R1"|"R2"|"R3" (쌍대에서도 같은 이름 유지)
  targetVoltage: number;
  values: Record<string, number>;
};

export function generateDcMeshDual(args: { seed?: number; targetBranch?: string }): DcMeshDualGeneration {
  const rand = makeRand(args.seed);
  // 원본과 동일한 pick 순서 (같은 seed → 동일 값, 거울 검증 가능)
  const V1 = pick(NICE_VOLTAGES, rand);
  const V2 = pick(NICE_VOLTAGES, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  const R2 = pick(NICE_RESISTORS, rand);
  const R3 = pick(NICE_RESISTORS, rand);

  const R0 = DC_MESH_DUAL_R0;
  const I1 = round3(V1 / R0);
  const I2 = round3(V2 / R0);
  const R1d = round3((R0 * R0) / R1);
  const R2d = round3((R0 * R0) / R2);
  const R3d = round3((R0 * R0) / R3);

  const solverNet: SolverNetwork = {
    nodeIds: ["D1", "D2"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "D1", b: "GND", R: R1d },  // 원본 R1의 쌍대
      { id: "R2", a: "D1", b: "D2", R: R2d },    // 원본 R2(공유)의 쌍대 = 브리지
      { id: "R3", a: "D2", b: "GND", R: R3d },   // 원본 R3의 쌍대
    ],
    vsources: [],
    isources: [
      // 두 전류원 모두 노드로 주입(↑) — 그림과 풀이 일관(generic 렌더러가 화살표 방향 반영 못 함).
      // 구조적 쌍대(메시→노드, V→I, R→G, 직렬↔병렬)는 유지. MNA가 그린 회로 그대로 해석.
      { id: "I1", a: "GND", b: "D1", I: I1 },
      { id: "I2", a: "GND", b: "D2", I: I2 },
    ],
  };
  const sol = solveMNA(solverNet);
  const D1 = round3(sol.nodeVoltages["D1"]);
  const D2 = round3(sol.nodeVoltages["D2"]);
  const branchVoltages: Record<string, number> = {
    R1: D1,                 // R1' 양단 = V_D1
    R2: round3(D1 - D2),    // R2' 양단 = V_D1 − V_D2
    R3: D2,                 // R3' 양단 = V_D2
  };

  const choices = ["R1", "R2", "R3"];
  const target = args.targetBranch && choices.includes(args.targetBranch)
    ? args.targetBranch
    : choices[Math.floor(rand() * choices.length)];

  return {
    netlist: buildDualMeshNetlist(I1, I2, R1d, R2d, R3d),
    solverNet,
    branchVoltages,
    nodeVoltages: { D1, D2 },
    targetBranch: target,
    targetVoltage: branchVoltages[target],
    values: { I1, I2, R1d, R2d, R3d, R0 },
  };
}

/** 쌍대 2-node netlist: I1∥R1'(D1-GND), R2'(D1-D2), I2∥R3'(D2-GND). 전용 고정 슬롯. */
function buildDualMeshNetlist(I1: number, I2: number, R1d: number, R2d: number, R3d: number): CircuitNetlist {
  const GND = "GND";
  const components: CircuitComponent[] = [
    { id: "I1", type: "I", value: `${I1}A`,
      pins: [{ id: "p", node: GND, side: "bottom" }, { id: "n", node: "D1", side: "top" }] },
    { id: "R1", type: "R", value: `${R1d}Ω`,
      pins: [{ id: "p", node: "D1", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "R2", type: "R", value: `${R2d}Ω`,
      pins: [{ id: "p", node: "D1", side: "left" }, { id: "n", node: "D2", side: "right" }] },
    { id: "R3", type: "R", value: `${R3d}Ω`,
      pins: [{ id: "p", node: "D2", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "I2", type: "I", value: `${I2}A`,
      pins: [{ id: "p", node: GND, side: "bottom" }, { id: "n", node: "D2", side: "top" }] },
  ];
  const positions: Record<string, { x: number; y: number }> = {
    [GND]: { x: 300, y: 340 },
    D1: { x: 160, y: 150 },
    D2: { x: 440, y: 150 },
  };
  return { components, ground: GND, positions };
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
