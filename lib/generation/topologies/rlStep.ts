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

  const netlist: CircuitNetlist = {
    components: [
      {
        id: "V1", type: "V", value: `${V1}V`,
        pins: [
          { id: "p1", node: "top", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
      {
        id: "R1", type: "R", value: `${R1_ohm}Ω`,
        pins: [
          { id: "p1", node: "top", side: "left" },
          { id: "p2", node: "a", side: "right" },
        ],
      },
      {
        id: "L1", type: "L", value: `${L1_mH}mH`,
        pins: [
          { id: "p1", node: "a", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
    ],
    ground: "GND",
    nodeAnnotations: [
      { node: "a", label: "L+", style: "label_only" },
    ],
    measurementMarks: [
      { kind: "current", refs: ["L1"], label: "I_L" },
    ],
  };

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
