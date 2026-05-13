import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import type { SolverNetwork } from "@/lib/solver/mna";
import { solveRcTransient } from "@/lib/solver/rcTransient";
import {
  NICE_CAPACITANCES_UF,
  NICE_RESISTORS,
  NICE_VOLTAGES,
  makeRand,
  pick,
  round3,
} from "./_helpers";

/**
 * RC step-response 문제 generator.
 *
 *  Archetype:
 *    - "simple_charging": V1 → R1 → C1 → GND. V_C(0)=0. V1이 t=0에 인가.
 *      V_C(t) = V1·(1 - e^(-t/τ)), τ = R1·C1.
 *
 *  단위: R은 kΩ, C는 μF로 picking → τ in ms로 자동.
 *  실제 계산은 SI(Ω, F, s) 단위로 하고, 표시만 kΩ/μF/ms.
 */

export type RcStepArchetype = "simple_charging";

export type RcStepGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  capPositiveNode: string;
  capNegativeNode: string;
  /** 정답 */
  answer: {
    /** 시정수 (ms 단위 표시) */
    tauMs: number;
    /** 정상상태 V_C */
    Vinf: number;
    /** 묻는 시각 (ms) */
    tQueryMs: number;
    /** 그 시각에서의 V_C */
    VcAtQuery: number;
  };
  archetype: RcStepArchetype;
  values: Record<string, number>;
};

const TIME_MULTIPLIERS = [1, 2, 3]; // 묻는 시각: t = N·τ

export function generateRcStep(args: {
  params?: CircuitTypeParams;
  archetype?: RcStepArchetype;
  seed?: number;
}): RcStepGeneration {
  const rand = makeRand(args.seed);
  const archetype: RcStepArchetype = args.archetype ?? "simple_charging";
  switch (archetype) {
    case "simple_charging": return buildSimpleCharging(rand);
  }
}

// =====================================================================
// Archetype: V1 → R1 → C1 → GND, V_C(0) = 0
//
//   ●top──R1──●a
//    │         │
//   V1        C1
//    │         │
//   ●GND──────●(GND)
// =====================================================================
function buildSimpleCharging(rand: () => number): RcStepGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const R1_kohm = pick(NICE_RESISTORS, rand);          // kΩ
  const C1_uF = pick(NICE_CAPACITANCES_UF, rand);      // μF

  // SI 단위로 변환
  const R1_ohm = R1_kohm * 1000;
  const C1_F = C1_uF * 1e-6;

  // Solver-friendly network (C 제외 — Thevenin 추출용)
  const solverNet: SolverNetwork = {
    nodeIds: ["top", "a"],
    groundId: "GND",
    resistors: [{ id: "R1", a: "top", b: "a", R: R1_ohm }],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [],
  };

  const rc = solveRcTransient({
    netWithoutCap: solverNet,
    capPositiveNode: "a",
    capNegativeNode: "GND",
    capacitanceF: C1_F,
    initialVc: 0,
  });

  const N = pick(TIME_MULTIPLIERS, rand);
  const tQuerySec = N * rc.tauSec;
  const VcAtQuery = rc.Vc(tQuerySec);
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
        id: "R1", type: "R", value: `${R1_kohm}kΩ`,
        pins: [
          { id: "p1", node: "top", side: "left" },
          { id: "p2", node: "a", side: "right" },
        ],
      },
      {
        id: "C1", type: "C", value: `${C1_uF}μF`,
        pins: [
          { id: "p1", node: "a", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
    ],
    ground: "GND",
    nodeAnnotations: [
      { node: "a", label: "C+", style: "label_only" },
    ],
    measurementMarks: [
      { kind: "voltage", refs: ["a", "GND"], label: "V_C" },
    ],
  };

  return {
    netlist,
    solverNet,
    capPositiveNode: "a",
    capNegativeNode: "GND",
    answer: {
      tauMs: round3(rc.tauMs),
      Vinf: round3(rc.Vinf),
      tQueryMs: round3(tQueryMs),
      VcAtQuery: round3(VcAtQuery),
    },
    archetype: "simple_charging",
    values: { V1, R1_kohm, C1_uF, N_multiplier: N },
  };
}
