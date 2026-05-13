import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import type { SolverNetwork } from "@/lib/solver/mna";
import { solveThevenin } from "@/lib/solver/thevenin";
import {
  NICE_CURRENTS,
  NICE_RESISTORS,
  NICE_VOLTAGES,
  makeRand,
  pick,
  round3,
} from "./_helpers";

/**
 * Norton 등가회로 문제 generator.
 *
 *  Norton ↔ Thevenin은 dual: 같은 회로의 동일한 단자에 대해
 *    I_n = V_th / R_th
 *    R_n = R_th
 *
 *  → Thevenin 솔버를 그대로 재사용해 I_n, R_n 산출.
 *
 *  현 phase: 두 archetype.
 *    - "current_source_with_parallel_R": I1 ∥ R1, 단자 a-b
 *    - "mixed_v_i":                       V1 + I1 + R1 + R2, 단자 a-b
 */

export type NortonArchetype = "current_source_with_parallel_R" | "mixed_v_i";

export type NortonGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  terminalA: string;
  terminalB: string;
  answer: {
    In: number;   // Norton 전류
    Rn: number;   // Norton 저항 = R_th
  };
  archetype: NortonArchetype;
  values: Record<string, number>;
};

export function generateNorton(args: {
  params?: CircuitTypeParams;
  archetype?: NortonArchetype;
  seed?: number;
}): NortonGeneration {
  const rand = makeRand(args.seed);
  const archetype: NortonArchetype = args.archetype ?? chooseArchetype(args.params, rand);
  switch (archetype) {
    case "current_source_with_parallel_R": return buildCurrentParallelR(rand);
    case "mixed_v_i":                       return buildMixedVI(rand);
  }
}

function chooseArchetype(
  params: CircuitTypeParams | undefined,
  rand: () => number,
): NortonArchetype {
  const vCount = params?.vSourceCount ?? 0;
  if (vCount >= 1) return "mixed_v_i";
  return rand() < 0.5 ? "current_source_with_parallel_R" : "mixed_v_i";
}

// =====================================================================
// Archetype 1: 전류원 ∥ 저항
//   I1 (GND→a) ∥ R1 (a↔GND)
//   단자 a-b (b=GND)
// =====================================================================
function buildCurrentParallelR(rand: () => number): NortonGeneration {
  const I1 = pick(NICE_CURRENTS, rand);
  const R1 = pick(NICE_RESISTORS, rand);

  const solverNet: SolverNetwork = {
    nodeIds: ["a"],
    groundId: "GND",
    resistors: [{ id: "R1", a: "a", b: "GND", R: R1 }],
    vsources: [],
    isources: [{ id: "I1", a: "GND", b: "a", I: I1 }],
  };

  const netlist: CircuitNetlist = {
    components: [
      {
        id: "I1", type: "I", value: `${I1}A`,
        pins: [
          { id: "p1", node: "GND", side: "bottom" },
          { id: "p2", node: "a", side: "top" },
        ],
      },
      {
        id: "R1", type: "R", value: `${R1}Ω`,
        pins: [
          { id: "p1", node: "a", side: "top" },
          { id: "p2", node: "GND", side: "bottom" },
        ],
      },
    ],
    ground: "GND",
    nodeAnnotations: [
      { node: "a", label: "a", style: "terminal_dot" },
      { node: "GND", label: "b", style: "terminal_dot" },
    ],
  };

  const { Vth, Rth } = solveThevenin({ net: solverNet, terminalA: "a", terminalB: "GND" });
  return {
    netlist, solverNet, terminalA: "a", terminalB: "GND",
    answer: { In: round3(Vth / Rth), Rn: round3(Rth) },
    archetype: "current_source_with_parallel_R",
    values: { I1, R1 },
  };
}

// =====================================================================
// Archetype 2: V + I 혼합
//   V1 (top↔GND), R1 (top↔a), I1 (GND→a), R2 (a↔GND)
//   단자 a-b (b=GND)
// =====================================================================
function buildMixedVI(rand: () => number): NortonGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const I1 = pick(NICE_CURRENTS, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  const R2 = pick(NICE_RESISTORS, rand);

  const solverNet: SolverNetwork = {
    nodeIds: ["top", "a"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "a", R: R1 },
      { id: "R2", a: "a",   b: "GND", R: R2 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [{ id: "I1", a: "GND", b: "a",   I: I1 }],
  };

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
        id: "R1", type: "R", value: `${R1}Ω`,
        pins: [
          { id: "p1", node: "top", side: "left" },
          { id: "p2", node: "a", side: "right" },
        ],
      },
      {
        id: "R2", type: "R", value: `${R2}Ω`,
        pins: [
          { id: "p1", node: "a", side: "top" },
          { id: "p2", node: "GND", side: "bottom" },
        ],
      },
      {
        id: "I1", type: "I", value: `${I1}A`,
        pins: [
          { id: "p1", node: "GND", side: "bottom" },
          { id: "p2", node: "a", side: "top" },
        ],
      },
    ],
    ground: "GND",
    nodeAnnotations: [
      { node: "a", label: "a", style: "terminal_dot" },
      { node: "GND", label: "b", style: "terminal_dot" },
    ],
  };

  const { Vth, Rth } = solveThevenin({ net: solverNet, terminalA: "a", terminalB: "GND" });
  return {
    netlist, solverNet, terminalA: "a", terminalB: "GND",
    answer: { In: round3(Vth / Rth), Rn: round3(Rth) },
    archetype: "mixed_v_i",
    values: { V1, I1, R1, R2 },
  };
}
