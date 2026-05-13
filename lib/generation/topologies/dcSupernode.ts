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
import {
  DEFAULT_BRANCH_RULES,
  assembleNetlist,
  instantiateAnalogTemplate,
  validateBranchTemplate,
  type AnalogValueAssignment,
  type BranchTemplate,
} from "@/lib/generation/branchTemplate";
import { createLogger } from "@/lib/logger";

const snlog = createLogger("lib/generation/topologies/dcSupernode");

function assembleViaBT(args: {
  branches: BranchTemplate[];
  values: AnalogValueAssignment[];
  metadata?: Pick<CircuitNetlist, "nodeAnnotations" | "measurementMarks" | "positions">;
}): CircuitNetlist {
  const enriched = args.branches.map((b) => ({ ...b, rules: b.rules ?? DEFAULT_BRANCH_RULES[b.role] }));
  const validation = validateBranchTemplate(enriched);
  if (!validation.ok) snlog.warn("branch_template_violation", { issues: validation.issues });
  const inst = instantiateAnalogTemplate(enriched, args.values);
  return { ...assembleNetlist(inst, "GND"), ...args.metadata };
}

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

  const netlist = assembleViaBT({
    // V_s가 n1↔n2 사이 horizontal mesh_only_branch: top_rail role로 표현 (수평).
    branches: [
      { id: "br_Vs", role: "top_rail", orientation: "horizontal", fromNode: "n1", toNode: "n2",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V_s" }] },
      { id: "br_R1", role: "load_leg", orientation: "vertical", fromNode: "n1", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_R2", role: "load_leg", orientation: "vertical", fromNode: "n2", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R2" }] },
      { id: "br_I1", role: "load_leg", orientation: "vertical", fromNode: "n1", toNode: "GND",
        components: [{ type: "I", role: "current_source", order: 1, required: true, idOverride: "I1" }] },
    ],
    values: [
      { branchId: "br_Vs", componentRole: "voltage_source", type: "V", value: `${Vs}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1}Ω` },
      { branchId: "br_R2", componentRole: "resistor", type: "R", value: `${R2}Ω` },
      { branchId: "br_I1", componentRole: "current_source", type: "I", value: `${I1}A` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "n1", label: "n₁", style: "label_only" },
        { node: "n2", label: "n₂", style: "label_only" },
      ],
    },
  });

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
