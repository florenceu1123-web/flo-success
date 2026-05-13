import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import type { SolverNetwork } from "@/lib/solver/mna";
import { solveRlTransient } from "@/lib/solver/rlTransient";
import {
  NICE_INDUCTANCES_MH,
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

const rllog = createLogger("lib/generation/topologies/rlStep");

function assembleViaBT(args: {
  branches: BranchTemplate[];
  values: AnalogValueAssignment[];
  metadata?: Pick<CircuitNetlist, "nodeAnnotations" | "measurementMarks" | "positions">;
}): CircuitNetlist {
  const enriched = args.branches.map((b) => ({ ...b, rules: b.rules ?? DEFAULT_BRANCH_RULES[b.role] }));
  const validation = validateBranchTemplate(enriched);
  if (!validation.ok) rllog.warn("branch_template_violation", { issues: validation.issues });
  const inst = instantiateAnalogTemplate(enriched, args.values);
  return { ...assembleNetlist(inst, "GND"), ...args.metadata };
}

/**
 * RL step-response 문제 generator.
 *
 *  Archetype:
 *    - "simple_energizing": V1 → R1 → L1 → GND. I_L(0)=0. V1이 t=0에 인가.
 *      I_L(t) = (V1/R1)·(1 - e^(-t/τ)), τ = L1/R1.
 *
 *  단위: R은 Ω, L은 mH로 picking → τ in ms.
 *  τ_s = L_H / R_Ω = (L_mH·10⁻³) / R_Ω → τ_ms = L_mH / R_Ω.
 */

export type RlStepArchetype = "simple_energizing";

export type RlStepGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  lPositiveNode: string;
  lNegativeNode: string;
  answer: {
    tauMs: number;
    Iinf: number;     // 정상상태 전류 (A)
    tQueryMs: number;
    IlAtQuery: number;
  };
  archetype: RlStepArchetype;
  values: Record<string, number>;
};

const TIME_MULTIPLIERS = [1, 2, 3];

export function generateRlStep(args: {
  params?: CircuitTypeParams;
  archetype?: RlStepArchetype;
  seed?: number;
}): RlStepGeneration {
  const rand = makeRand(args.seed);
  const archetype: RlStepArchetype = args.archetype ?? "simple_energizing";
  switch (archetype) {
    case "simple_energizing": return buildSimpleEnergizing(rand);
  }
}

// =====================================================================
// Archetype: V1 → R1 → L1 → GND, I_L(0) = 0
//
//   ●top──R1──●a
//    │         │
//   V1        L1
//    │         │
//   ●GND──────●(GND)
// =====================================================================
function buildSimpleEnergizing(rand: () => number): RlStepGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const R1_ohm = pick(NICE_RESISTORS, rand);
  const L1_mH = pick(NICE_INDUCTANCES_MH, rand);

  const L1_H = L1_mH * 1e-3;

  const solverNet: SolverNetwork = {
    nodeIds: ["top", "a"],
    groundId: "GND",
    resistors: [{ id: "R1", a: "top", b: "a", R: R1_ohm }],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [],
  };

  const rl = solveRlTransient({
    netWithoutL: solverNet,
    lPositiveNode: "a",
    lNegativeNode: "GND",
    inductanceH: L1_H,
    initialIl: 0,
  });

  const N = pick(TIME_MULTIPLIERS, rand);
  const tQuerySec = N * rl.tauSec;
  const IlAtQuery = rl.Il(tQuerySec);
  const tQueryMs = tQuerySec * 1000;

  const netlist = assembleViaBT({
    branches: [
      { id: "br_V1", role: "input_source_leg", orientation: "vertical", fromNode: "top", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V1" }] },
      { id: "br_R1", role: "top_rail", orientation: "horizontal", fromNode: "top", toNode: "a",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_L1", role: "load_leg", orientation: "vertical", fromNode: "a", toNode: "GND",
        components: [{ type: "L", role: "inductor", order: 1, required: true, idOverride: "L1" }] },
    ],
    values: [
      { branchId: "br_V1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1_ohm}Ω` },
      { branchId: "br_L1", componentRole: "inductor", type: "L", value: `${L1_mH}mH` },
    ],
    metadata: {
      nodeAnnotations: [{ node: "a", label: "L+", style: "label_only" }],
      measurementMarks: [{ kind: "current", refs: ["L1"], label: "I_L" }],
    },
  });

  return {
    netlist,
    solverNet,
    lPositiveNode: "a",
    lNegativeNode: "GND",
    answer: {
      tauMs: round3(rl.tauMs),
      Iinf: round3(rl.Iinf),
      tQueryMs: round3(tQueryMs),
      IlAtQuery: round3(IlAtQuery),
    },
    archetype: "simple_energizing",
    values: { V1, R1_ohm, L1_mH, N_multiplier: N },
  };
}
