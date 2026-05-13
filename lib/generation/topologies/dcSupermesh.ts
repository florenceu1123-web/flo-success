import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import {
  NICE_CURRENTS,
  NICE_RESISTORS,
  NICE_VOLTAGES,
  makeRand,
  pick,
  round3,
} from "./_helpers";

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

  const netlist: CircuitNetlist = {
    components: [
      {
        id: "V1", type: "V", value: `${V1}V`,
        pins: [
          { id: "p1", node: "top_left", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
      {
        id: "R1", type: "R", value: `${R1}Ω`,
        pins: [
          { id: "p1", node: "top_left", side: "left" },
          { id: "p2", node: "top_mid", side: "right" },
        ],
      },
      {
        id: "I_s", type: "I", value: `${Is}A`,
        pins: [
          { id: "p1", node: "GND", side: "bottom" },
          { id: "p2", node: "top_mid", side: "top" },
        ],
      },
      {
        id: "R3", type: "R", value: `${R3}Ω`,
        pins: [
          { id: "p1", node: "top_mid", side: "left" },
          { id: "p2", node: "top_right", side: "right" },
        ],
      },
      {
        id: "V2", type: "V", value: `${V2}V`,
        pins: [
          { id: "p1", node: "top_right", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
    ],
    ground: "GND",
    measurementMarks: [
      { kind: "current", refs: [target], label: `I_${target}` },
    ],
  };

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
