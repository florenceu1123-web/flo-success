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
 * Supernode 회로 generator — 두 non-ground node를 V source가 직결.
 * 두 node를 분리 KCL 불가 → supernode로 묶어 단일 KCL + 보조 V 제약으로 풀어야 함.
 *
 *  Archetype: "two_node_shared_V"
 *
 *           ┌─V_s─┐
 *           │     │
 *         ●n1   ●n2
 *          │     │
 *  I1→●n1  R1   R2  ←●n2 I2
 *          │     │
 *         GND   GND
 *
 *  현 phase: 단순 형태 - I1 inject 1개만(n1) + R1, R2 + V_s (n1-n2).
 *  V_s 제약: V(n1) - V(n2) = V_s
 *  Supernode KCL: I_through_R1 + I_through_R2 - I1 = 0
 *
 *  질문: V(n1), V(n2), V_s 통과 전류.
 */

export type DcSupernodeArchetype = "two_node_shared_V";

export type DcSupernodeGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  /** 노드 전압 */
  Vn1: number;
  Vn2: number;
  /** V_s를 통과하는 전류 (n1→n2 방향 양수) */
  IvsBranch: number;
  /** 정답 타깃 */
  target: "Vn1" | "Vn2" | "Ivs";
  targetValue: number;
  targetLabel: string;
  archetype: DcSupernodeArchetype;
  values: Record<string, number>;
};

export function generateDcSupernode(args: {
  params?: CircuitTypeParams;
  archetype?: DcSupernodeArchetype;
  seed?: number;
}): DcSupernodeGeneration {
  const rand = makeRand(args.seed);
  const archetype: DcSupernodeArchetype = args.archetype ?? "two_node_shared_V";
  return buildTwoNodeSharedV(rand);
  void archetype;
}

function buildTwoNodeSharedV(rand: () => number): DcSupernodeGeneration {
  const Vs = pick(NICE_VOLTAGES, rand);
  const I1 = pick(NICE_CURRENTS, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  let R2 = pick(NICE_RESISTORS, rand);
  if (R2 === R1) R2 = pick(NICE_RESISTORS, rand);

  // V_s: n1 = +, n2 = - → V(n1) - V(n2) = Vs
  // I1: GND→n1 (n1로 I1 inject)
  const solverNet: SolverNetwork = {
    nodeIds: ["n1", "n2"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "n1", b: "GND", R: R1 },
      { id: "R2", a: "n2", b: "GND", R: R2 },
    ],
    vsources: [
      { id: "V_s", a: "n1", b: "n2", V: Vs },   // n1과 n2 사이 (둘 다 non-ground)
    ],
    isources: [
      { id: "I1", a: "GND", b: "n1", I: I1 },
    ],
  };

  const sol = solveMNA(solverNet);
  const Vn1 = round3(sol.nodeVoltages["n1"]);
  const Vn2 = round3(sol.nodeVoltages["n2"]);
  const IvsBranch = round3(sol.vsourceCurrents["V_s"]);

  const targetChoices = [
    { key: "Vn1" as const, label: "V(n_1)",  value: Vn1 },
    { key: "Vn2" as const, label: "V(n_2)",  value: Vn2 },
    { key: "Ivs" as const, label: "I_{V_s}", value: IvsBranch },
  ];
  const t = targetChoices[Math.floor(rand() * targetChoices.length)];

  const netlist: CircuitNetlist = {
    components: [
      {
        id: "V_s", type: "V", value: `${Vs}V`,
        pins: [
          { id: "p1", node: "n1", side: "left", role: "positive" },
          { id: "p2", node: "n2", side: "right", role: "negative" },
        ],
      },
      {
        id: "R1", type: "R", value: `${R1}Ω`,
        pins: [
          { id: "p1", node: "n1", side: "top" },
          { id: "p2", node: "GND", side: "bottom" },
        ],
      },
      {
        id: "R2", type: "R", value: `${R2}Ω`,
        pins: [
          { id: "p1", node: "n2", side: "top" },
          { id: "p2", node: "GND", side: "bottom" },
        ],
      },
      {
        id: "I1", type: "I", value: `${I1}A`,
        pins: [
          { id: "p1", node: "GND", side: "bottom" },
          { id: "p2", node: "n1", side: "top" },
        ],
      },
    ],
    ground: "GND",
    nodeAnnotations: [
      { node: "n1", label: "n₁", style: "label_only" },
      { node: "n2", label: "n₂", style: "label_only" },
    ],
  };

  return {
    netlist,
    solverNet,
    Vn1, Vn2, IvsBranch,
    target: t.key,
    targetValue: t.value,
    targetLabel: t.label,
    archetype: "two_node_shared_V",
    values: { V_s: Vs, I1, R1, R2 },
  };
}
