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

const swlog = createLogger("lib/generation/topologies/switchingCircuit");

function assembleViaBT(args: {
  branches: BranchTemplate[];
  values: AnalogValueAssignment[];
  swState?: "open" | "closed";
  metadata?: Pick<CircuitNetlist, "nodeAnnotations" | "measurementMarks" | "positions">;
}): CircuitNetlist {
  const enriched = args.branches.map((b) => ({ ...b, rules: b.rules ?? DEFAULT_BRANCH_RULES[b.role] }));
  const validation = validateBranchTemplate(enriched);
  if (!validation.ok) swlog.warn("branch_template_violation", { issues: validation.issues });
  const inst = instantiateAnalogTemplate(enriched, args.values);
  return { ...assembleNetlist(inst, "GND", args.swState), ...args.metadata };
}

/**
 * DC 스위칭 회로 generator — SW open/closed 두 정상상태에서의 값 비교.
 *  (switched_rc / switched_rl 과 다름: RC/RL 과도응답이 아니라 순수 DC 정상상태)
 *
 *  Archetype: "two_state_dc"
 *  ●top
 *   │
 *   V1
 *   │
 *  GND──R1──●a──R2──●b
 *           │       │
 *           R3      SW
 *           │       │
 *          GND     GND
 *
 *  SW open:   b 노드가 외부와 연결 없음 → R2에 전류 0 → V(b) = V(a)
 *             전류 흐름: V1 → R1 → R3 → GND
 *  SW closed: b 노드가 GND와 직결 → R2가 a→GND 추가 경로
 *             V(a)는 R3 ∥ R2 분배로 결정. V(b) = 0.
 *
 *  Solver: 두 별도 SolverNetwork (state 1: SW 없음, state 2: SW를 1e-9 wire로 대체).
 *  답: 같은 타깃(V_a 또는 I_R1)의 open/closed 두 값.
 */

export type SwitchingArchetype = "two_state_dc";

export type SwitchingGeneration = {
  /** state_before figure용 netlist (SW open) */
  netlistOpen: CircuitNetlist;
  /** state_after figure용 netlist (SW closed) */
  netlistClosed: CircuitNetlist;
  /** 두 상태의 솔버 결과 */
  openSolution: { Va: number; Vb: number; Ir1: number };
  closedSolution: { Va: number; Vb: number; Ir1: number };
  /** 타깃 변수 (V_a 또는 I_R1) */
  target: "Va" | "Ir1";
  targetLabel: string;
  targetUnit: string;
  archetype: SwitchingArchetype;
  values: Record<string, number>;
};

export function generateSwitchingCircuit(args: {
  params?: CircuitTypeParams;
  archetype?: SwitchingArchetype;
  seed?: number;
}): SwitchingGeneration {
  const rand = makeRand(args.seed);
  const archetype: SwitchingArchetype = args.archetype ?? "two_state_dc";
  return buildTwoStateDc(rand);
  void archetype;
}

function buildTwoStateDc(rand: () => number): SwitchingGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  const R2 = pick(NICE_RESISTORS, rand);
  let R3 = pick(NICE_RESISTORS, rand);
  if (R3 === R2) R3 = pick(NICE_RESISTORS, rand);

  // State 1: SW open (b가 SW 외엔 연결 없음)
  const openNet: SolverNetwork = {
    nodeIds: ["top", "a", "b"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "a",   R: R1 },
      { id: "R3", a: "a",   b: "GND", R: R3 },
      { id: "R2", a: "a",   b: "b",   R: R2 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [],
  };
  const openSol = solveMNA(openNet);

  // State 2: SW closed → b가 GND에 직결 (1e-9 Ω wire)
  const closedNet: SolverNetwork = {
    ...openNet,
    resistors: [
      ...openNet.resistors,
      { id: "SW_wire", a: "b", b: "GND", R: 1e-9 },
    ],
  };
  const closedSol = solveMNA(closedNet);

  const openSolution = {
    Va: round3(openSol.nodeVoltages.a),
    Vb: round3(openSol.nodeVoltages.b),
    Ir1: round3((V1 - openSol.nodeVoltages.a) / R1),
  };
  const closedSolution = {
    Va: round3(closedSol.nodeVoltages.a),
    Vb: round3(closedSol.nodeVoltages.b),
    Ir1: round3((V1 - closedSol.nodeVoltages.a) / R1),
  };

  // 타깃: V_a 또는 I_R1 (50:50)
  const t = pick<"Va" | "Ir1">(["Va", "Ir1"], rand);
  const targetLabel = t === "Va" ? "V(a)" : "I_{R_1}";
  const targetUnit = t === "Va" ? "V" : "A";

  // 두 figure용 netlist (같은 component 셋, SW state만 다름)
  const netlistOpen   = buildNetlist({ V1, R1, R2, R3, swState: "open" });
  const netlistClosed = buildNetlist({ V1, R1, R2, R3, swState: "closed" });

  return {
    netlistOpen, netlistClosed,
    openSolution, closedSolution,
    target: t, targetLabel, targetUnit,
    archetype: "two_state_dc",
    values: { V1, R1, R2, R3 },
  };
}

function buildNetlist(args: {
  V1: number; R1: number; R2: number; R3: number;
  swState: "open" | "closed";
}): CircuitNetlist {
  const { V1, R1, R2, R3, swState } = args;
  return assembleViaBT({
    branches: [
      { id: "br_V1", role: "left_source_leg", orientation: "vertical", fromNode: "top", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V1" }] },
      { id: "br_R1", role: "top_rail", orientation: "horizontal", fromNode: "top", toNode: "a",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_R3", role: "load_leg", orientation: "vertical", fromNode: "a", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R3" }] },
      { id: "br_R2", role: "top_rail", orientation: "horizontal", fromNode: "a", toNode: "b",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R2" }] },
      { id: "br_SW", role: "switching_leg", orientation: "vertical", fromNode: "b", toNode: "GND",
        components: [{ type: "SW", role: "switch", order: 1, required: false, idOverride: "SW" }] },
    ],
    values: [
      { branchId: "br_V1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1}Ω` },
      { branchId: "br_R3", componentRole: "resistor", type: "R", value: `${R3}Ω` },
      { branchId: "br_R2", componentRole: "resistor", type: "R", value: `${R2}Ω` },
      { branchId: "br_SW", componentRole: "switch", type: "SW", state: swState },
    ],
    swState,
    metadata: {
      nodeAnnotations: [
        { node: "a", label: "a", style: "label_only" },
        { node: "b", label: "b", style: "label_only" },
      ],
    },
  });
}
