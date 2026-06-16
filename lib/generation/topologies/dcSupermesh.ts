import type { CircuitComponent, CircuitNetlist, CircuitTypeParams } from "@/types";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import {
  NICE_CURRENTS,
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

const smlog = createLogger("lib/generation/topologies/dcSupermesh");

function assembleViaBT(args: {
  branches: BranchTemplate[];
  values: AnalogValueAssignment[];
  metadata?: Pick<CircuitNetlist, "nodeAnnotations" | "measurementMarks" | "positions">;
}): CircuitNetlist {
  const enriched = args.branches.map((b) => ({ ...b, rules: b.rules ?? DEFAULT_BRANCH_RULES[b.role] }));
  const validation = validateBranchTemplate(enriched);
  if (!validation.ok) smlog.warn("branch_template_violation", { issues: validation.issues });
  const inst = instantiateAnalogTemplate(enriched, args.values);
  return { ...assembleNetlist(inst, "GND"), ...args.metadata };
}

/**
 * Supermesh 회로 generator — 두 mesh가 공유하는 vertical branch에 I source가 끼어,
 * mesh 해석 시 단일 mesh KVL 적용 불가 → supermesh로 묶어 풀어야 하는 패턴.
 *
 *  Archetype: "two_mesh_shared_I"
 *
 *  ●top_left ──R1── ●top_mid ──R3── ●top_right
 *   │                │                │
 *   V1              I_s              V2
 *   │                │                │
 *  GND              GND              GND
 *
 *  두 mesh:
 *   - mesh 1 (좌): V1 → R1 → I_s leg → GND → V1
 *   - mesh 2 (우): V2 → R3 → I_s leg → GND → V2
 *  공유 가지: I_s vertical leg
 *
 *  질문: 특정 R 전류 또는 mesh 전류 차이 등. 코드는 일반 MNA로 풀이 → 가지 전류 추출.
 */

export type DcSupermeshArchetype = "two_mesh_shared_I";

export type DcSupermeshGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  /** 각 저항 전류 (a→b 방향 양수) */
  branchCurrents: Record<string, number>;
  /** mesh 1 전류 (R1 통과량 = top_left→top_mid 방향) */
  iMesh1: number;
  /** mesh 2 전류 (R3 통과량 = top_mid→top_right 방향) */
  iMesh2: number;
  targetBranch: string;
  targetCurrent: number;
  archetype: DcSupermeshArchetype;
  values: Record<string, number>;
};

export function generateDcSupermesh(args: {
  params?: CircuitTypeParams;
  archetype?: DcSupermeshArchetype;
  seed?: number;
  targetBranch?: string;
}): DcSupermeshGeneration {
  const rand = makeRand(args.seed);
  const archetype: DcSupermeshArchetype = args.archetype ?? "two_mesh_shared_I";
  return buildTwoMeshSharedI(rand, args.targetBranch);
  void archetype;
}

function buildTwoMeshSharedI(rand: () => number, targetBranch?: string): DcSupermeshGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const V2 = pick(NICE_VOLTAGES, rand);
  const Is = pick(NICE_CURRENTS, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  const R3 = pick(NICE_RESISTORS, rand);

  // I_s: GND → top_mid (current source pushes Is into top_mid from below)
  const solverNet: SolverNetwork = {
    nodeIds: ["top_left", "top_mid", "top_right"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top_left", b: "top_mid",   R: R1 },
      { id: "R3", a: "top_mid",  b: "top_right", R: R3 },
    ],
    vsources: [
      { id: "V1", a: "top_left",  b: "GND", V: V1 },
      { id: "V2", a: "top_right", b: "GND", V: V2 },
    ],
    isources: [
      { id: "I_s", a: "GND", b: "top_mid", I: Is },
    ],
  };

  const sol = solveMNA(solverNet);

  const branchCurrents: Record<string, number> = {};
  for (const r of solverNet.resistors) {
    branchCurrents[r.id] = round3((sol.nodeVoltages[r.a] - sol.nodeVoltages[r.b]) / r.R);
  }

  const iMesh1 = branchCurrents["R1"];
  const iMesh2 = branchCurrents["R3"];

  const choices = ["R1", "R3"];
  const target = targetBranch && choices.includes(targetBranch)
    ? targetBranch
    : choices[Math.floor(rand() * choices.length)];

  const netlist = assembleViaBT({
    branches: [
      { id: "br_V1", role: "left_source_leg", orientation: "vertical", fromNode: "top_left", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V1" }] },
      { id: "br_R1", role: "top_rail", orientation: "horizontal", fromNode: "top_left", toNode: "top_mid",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_Is", role: "load_leg", orientation: "vertical", fromNode: "top_mid", toNode: "GND",
        components: [{ type: "I", role: "current_source", order: 1, required: true, idOverride: "I_s" }] },
      { id: "br_R3", role: "top_rail", orientation: "horizontal", fromNode: "top_mid", toNode: "top_right",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R3" }] },
      { id: "br_V2", role: "right_source_leg", orientation: "vertical", fromNode: "top_right", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V2" }] },
    ],
    values: [
      { branchId: "br_V1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1}Ω` },
      { branchId: "br_Is", componentRole: "current_source", type: "I", value: `${Is}A` },
      { branchId: "br_R3", componentRole: "resistor", type: "R", value: `${R3}Ω` },
      { branchId: "br_V2", componentRole: "voltage_source", type: "V", value: `${V2}V` },
    ],
    metadata: {
      measurementMarks: [{ kind: "current", refs: [target], label: `I_${target}` }],
    },
  });

  return {
    netlist,
    solverNet,
    branchCurrents,
    iMesh1: round3(iMesh1),
    iMesh2: round3(iMesh2),
    targetBranch: target,
    targetCurrent: branchCurrents[target],
    archetype: "two_mesh_shared_I",
    values: { V1, V2, I_s: Is, R1, R3 },
  };
}

// =====================================================================
// 쌍대(dual) — 슈퍼메시(공유 전류원·메시전류)의 쌍대 = 슈퍼노드(공유 전압원·노드전압).
//   V↔I, R↔G, 메시↔노드, 공유 전류원 I_s↔공유 전압원 V_s (D1-D2 사이) (스케일 R₀=10).
//   원본: V1·R1·I_s(공유)·R3·V2 → 쌍대: I1∥R1'(D1), V_s(D1-D2 슈퍼노드), I2∥R3'(D2).
//   ★ 부호: 메시 RHS [V1; -V2]의 대칭 → I2는 D2에서 인출. 공유전류원 I_s → 공유전압원 V_s.
// =====================================================================
const SUPERMESH_DUAL_R0 = 10;

export type DcSupermeshDualGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  branchVoltages: Record<string, number>;
  nodeVoltages: { D1: number; D2: number };
  targetBranch: string;
  targetVoltage: number;
  values: Record<string, number>;
};

export function generateDcSupermeshDual(args: { seed?: number; targetBranch?: string }): DcSupermeshDualGeneration {
  const rand = makeRand(args.seed);
  const V1 = pick(NICE_VOLTAGES, rand);
  const V2 = pick(NICE_VOLTAGES, rand);
  const Is = pick(NICE_CURRENTS, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  const R3 = pick(NICE_RESISTORS, rand);

  const R0 = SUPERMESH_DUAL_R0;
  const I1 = round3(V1 / R0);
  const I2 = round3(V2 / R0);
  const R1d = round3((R0 * R0) / R1);
  const R3d = round3((R0 * R0) / R3);
  const Vs = round3(Is * R0);   // 공유 전류원 → 공유 전압원

  const solverNet: SolverNetwork = {
    nodeIds: ["D1", "D2"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "D1", b: "GND", R: R1d },
      { id: "R3", a: "D2", b: "GND", R: R3d },
    ],
    vsources: [{ id: "Vs", a: "D1", b: "D2", V: Vs }], // 슈퍼노드: V_D1 − V_D2 = Vs
    isources: [
      { id: "I1", a: "GND", b: "D1", I: I1 },
      { id: "I2", a: "GND", b: "D2", I: I2 },
    ],
  };
  const sol = solveMNA(solverNet);
  const D1 = round3(sol.nodeVoltages["D1"]);
  const D2 = round3(sol.nodeVoltages["D2"]);
  const branchVoltages: Record<string, number> = { R1: D1, R3: D2 };

  const choices = ["R1", "R3"];
  const target = args.targetBranch && choices.includes(args.targetBranch)
    ? args.targetBranch
    : choices[Math.floor(rand() * choices.length)];

  const GND = "GND";
  const components: CircuitComponent[] = [
    { id: "I1", type: "I", value: `${I1}A`, pins: [{ id: "p", node: GND, side: "bottom" }, { id: "n", node: "D1", side: "top" }] },
    { id: "R1", type: "R", value: `${R1d}Ω`, pins: [{ id: "p", node: "D1", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "Vs", type: "V", value: `${Vs}V`, pins: [{ id: "p", node: "D1", side: "left" }, { id: "n", node: "D2", side: "right" }] },
    { id: "R3", type: "R", value: `${R3d}Ω`, pins: [{ id: "p", node: "D2", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "I2", type: "I", value: `${I2}A`, pins: [{ id: "p", node: GND, side: "bottom" }, { id: "n", node: "D2", side: "top" }] },
  ];
  const netlist: CircuitNetlist = {
    components, ground: GND,
    nodeAnnotations: [
      { node: "D1", label: "D₁", style: "label_only" },
      { node: "D2", label: "D₂", style: "label_only" },
    ],
    positions: { GND: { x: 300, y: 340 }, D1: { x: 160, y: 150 }, D2: { x: 440, y: 150 } },
  };

  return {
    netlist, solverNet, branchVoltages,
    nodeVoltages: { D1, D2 },
    targetBranch: target,
    targetVoltage: branchVoltages[target],
    values: { I1, I2, Vs, R1d, R3d, R0 },
  };
}
