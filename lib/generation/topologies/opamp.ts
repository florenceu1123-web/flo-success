import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import {
  NICE_VOLTAGES,
  makeRand,
  pick,
  round3,
} from "./_helpers";

/**
 * 이상 OPAMP 회로 generator.
 *
 *  Archetypes:
 *   - "inverting":     V_out = -V_in·(R_f/R_in), V+ grounded
 *   - "non_inverting": V_out = V_in·(1 + R_f/R_g), V+ = V_in
 *   - "summing":       V_out = -R_f·(V_1/R_1 + V_2/R_2), V+ grounded
 *
 *  솔버는 MNA ideal opamp 지원 활용 — V_+ = V_-, 입력 전류 0.
 */

export type OpampArchetype = "inverting" | "non_inverting" | "summing";

export type OpampGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  Vout: number;
  Vminus: number;
  Vplus: number;
  /** 정답 타깃 (현 phase: V_out 만) */
  target: "Vout";
  targetValue: number;
  targetLabel: string;
  archetype: OpampArchetype;
  /** "이득" 표현 (한국어/수식 풀이용) */
  gainFormula: string;
  values: Record<string, number>;
};

// kΩ 단위 — OPAMP에서 전형
const NICE_R_KOHM = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

export function generateOpamp(args: {
  params?: CircuitTypeParams;
  archetype?: OpampArchetype;
  seed?: number;
}): OpampGeneration {
  const rand = makeRand(args.seed);
  const archetype: OpampArchetype = args.archetype
    ?? pick<OpampArchetype>(["inverting", "non_inverting", "summing"], rand);
  switch (archetype) {
    case "inverting":     return buildInverting(rand);
    case "non_inverting": return buildNonInverting(rand);
    case "summing":       return buildSumming(rand);
  }
}

// =====================================================================
// Archetype 1: Inverting amp
//   V_in → R_in → V- → R_f → V_out, V+ = GND
//   V_out = -V_in·(R_f/R_in)
// =====================================================================
function buildInverting(rand: () => number): OpampGeneration {
  const Vin = pick([1, 2, 3, 5], rand);   // 작은 V_in
  const Rin_k = pick(NICE_R_KOHM, rand);
  let Rf_k = pick(NICE_R_KOHM, rand);
  // |gain| 1~10 범위 권장
  while (Rf_k / Rin_k > 10 || Rf_k / Rin_k < 0.5) {
    Rf_k = pick(NICE_R_KOHM, rand);
  }

  const Rin = Rin_k * 1000;
  const Rf = Rf_k * 1000;

  const solverNet: SolverNetwork = {
    nodeIds: ["Vin", "Vminus", "Vout"],
    groundId: "GND",
    resistors: [
      { id: "Rin", a: "Vin", b: "Vminus", R: Rin },
      { id: "Rf",  a: "Vminus", b: "Vout", R: Rf },
    ],
    vsources: [{ id: "Vs", a: "Vin", b: "GND", V: Vin }],
    isources: [],
    opamps: [{ id: "U1", vp: "GND", vn: "Vminus", vo: "Vout" }],
  };
  const sol = solveMNA(solverNet);
  const Vout = round3(sol.nodeVoltages.Vout);
  const Vminus = round3(sol.nodeVoltages.Vminus);
  const Vplus = 0;

  const netlist: CircuitNetlist = {
    components: [
      {
        id: "Vs", type: "V", value: `${Vin}V`,
        pins: [
          { id: "p1", node: "Vin", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
      {
        id: "Rin", type: "R", value: `${Rin_k}kΩ`,
        pins: [
          { id: "p1", node: "Vin", side: "left" },
          { id: "p2", node: "Vminus", side: "right" },
        ],
      },
      {
        id: "Rf", type: "R", value: `${Rf_k}kΩ`,
        pins: [
          { id: "p1", node: "Vminus", side: "left" },
          { id: "p2", node: "Vout", side: "right" },
        ],
      },
      {
        id: "U1", type: "OPAMP",
        pins: [
          { id: "p1", node: "GND", side: "left", role: "non_inverting" },
          { id: "p2", node: "Vminus", side: "left", role: "inverting" },
          { id: "p3", node: "Vout", side: "right" },
        ],
      },
    ],
    ground: "GND",
    nodeAnnotations: [
      { node: "Vin", label: "V_in", style: "label_only" },
      { node: "Vout", label: "V_out", style: "label_only" },
    ],
    measurementMarks: [
      { kind: "voltage", refs: ["Vout", "GND"], label: "V_out" },
    ],
  };

  return {
    netlist, solverNet, Vout, Vminus, Vplus,
    target: "Vout", targetValue: Vout, targetLabel: "V_{out}",
    archetype: "inverting",
    gainFormula: `V_out = -V_in·(R_f/R_in) = -${Vin}·(${Rf_k}/${Rin_k}) = ${Vout} V`,
    values: { V_in: Vin, R_in_kohm: Rin_k, R_f_kohm: Rf_k },
  };
}

// =====================================================================
// Archetype 2: Non-inverting amp
//   V_in → V+ (직접), V- → R_g → GND, V- → R_f → V_out
//   V_out = V_in·(1 + R_f/R_g)
// =====================================================================
function buildNonInverting(rand: () => number): OpampGeneration {
  const Vin = pick([1, 2, 3, 4, 5], rand);
  const Rg_k = pick(NICE_R_KOHM, rand);
  let Rf_k = pick(NICE_R_KOHM, rand);
  // gain 2~10 권장 → R_f/R_g 1~9
  while (Rf_k / Rg_k > 9 || Rf_k / Rg_k < 0.5) {
    Rf_k = pick(NICE_R_KOHM, rand);
  }

  const Rg = Rg_k * 1000;
  const Rf = Rf_k * 1000;

  const solverNet: SolverNetwork = {
    nodeIds: ["Vin", "Vminus", "Vout"],
    groundId: "GND",
    resistors: [
      { id: "Rg", a: "Vminus", b: "GND", R: Rg },
      { id: "Rf", a: "Vminus", b: "Vout", R: Rf },
    ],
    vsources: [{ id: "Vs", a: "Vin", b: "GND", V: Vin }],
    isources: [],
    opamps: [{ id: "U1", vp: "Vin", vn: "Vminus", vo: "Vout" }],
  };
  const sol = solveMNA(solverNet);
  const Vout = round3(sol.nodeVoltages.Vout);
  const Vminus = round3(sol.nodeVoltages.Vminus);
  const Vplus = round3(sol.nodeVoltages.Vin);

  const netlist: CircuitNetlist = {
    components: [
      {
        id: "Vs", type: "V", value: `${Vin}V`,
        pins: [
          { id: "p1", node: "Vin", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
      {
        id: "U1", type: "OPAMP",
        pins: [
          { id: "p1", node: "Vin", side: "left", role: "non_inverting" },
          { id: "p2", node: "Vminus", side: "left", role: "inverting" },
          { id: "p3", node: "Vout", side: "right" },
        ],
      },
      {
        id: "Rf", type: "R", value: `${Rf_k}kΩ`,
        pins: [
          { id: "p1", node: "Vminus", side: "left" },
          { id: "p2", node: "Vout", side: "right" },
        ],
      },
      {
        id: "Rg", type: "R", value: `${Rg_k}kΩ`,
        pins: [
          { id: "p1", node: "Vminus", side: "top" },
          { id: "p2", node: "GND", side: "bottom" },
        ],
      },
    ],
    ground: "GND",
    nodeAnnotations: [
      { node: "Vin", label: "V_in", style: "label_only" },
      { node: "Vout", label: "V_out", style: "label_only" },
    ],
    measurementMarks: [
      { kind: "voltage", refs: ["Vout", "GND"], label: "V_out" },
    ],
  };

  return {
    netlist, solverNet, Vout, Vminus, Vplus,
    target: "Vout", targetValue: Vout, targetLabel: "V_{out}",
    archetype: "non_inverting",
    gainFormula: `V_out = V_in·(1 + R_f/R_g) = ${Vin}·(1 + ${Rf_k}/${Rg_k}) = ${Vout} V`,
    values: { V_in: Vin, R_f_kohm: Rf_k, R_g_kohm: Rg_k },
  };
}

// =====================================================================
// Archetype 3: Summing amp
//   V_1 → R_1 → V-, V_2 → R_2 → V-, V- → R_f → V_out, V+ = GND
//   V_out = -R_f·(V_1/R_1 + V_2/R_2)
// =====================================================================
function buildSumming(rand: () => number): OpampGeneration {
  const V1 = pick([1, 2, 3], rand);
  const V2 = pick([1, 2, 3, 4], rand);
  const R1_k = pick(NICE_R_KOHM, rand);
  const R2_k = pick(NICE_R_KOHM, rand);
  const Rf_k = pick(NICE_R_KOHM, rand);

  const R1 = R1_k * 1000;
  const R2 = R2_k * 1000;
  const Rf = Rf_k * 1000;

  const solverNet: SolverNetwork = {
    nodeIds: ["V1n", "V2n", "Vminus", "Vout"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "V1n", b: "Vminus", R: R1 },
      { id: "R2", a: "V2n", b: "Vminus", R: R2 },
      { id: "Rf", a: "Vminus", b: "Vout", R: Rf },
    ],
    vsources: [
      { id: "Vs1", a: "V1n", b: "GND", V: V1 },
      { id: "Vs2", a: "V2n", b: "GND", V: V2 },
    ],
    isources: [],
    opamps: [{ id: "U1", vp: "GND", vn: "Vminus", vo: "Vout" }],
  };
  const sol = solveMNA(solverNet);
  const Vout = round3(sol.nodeVoltages.Vout);
  const Vminus = round3(sol.nodeVoltages.Vminus);
  const Vplus = 0;

  const netlist: CircuitNetlist = {
    components: [
      {
        id: "Vs1", type: "V", value: `${V1}V`,
        pins: [
          { id: "p1", node: "V1n", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
      {
        id: "Vs2", type: "V", value: `${V2}V`,
        pins: [
          { id: "p1", node: "V2n", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
      {
        id: "R1", type: "R", value: `${R1_k}kΩ`,
        pins: [
          { id: "p1", node: "V1n", side: "left" },
          { id: "p2", node: "Vminus", side: "right" },
        ],
      },
      {
        id: "R2", type: "R", value: `${R2_k}kΩ`,
        pins: [
          { id: "p1", node: "V2n", side: "left" },
          { id: "p2", node: "Vminus", side: "right" },
        ],
      },
      {
        id: "Rf", type: "R", value: `${Rf_k}kΩ`,
        pins: [
          { id: "p1", node: "Vminus", side: "left" },
          { id: "p2", node: "Vout", side: "right" },
        ],
      },
      {
        id: "U1", type: "OPAMP",
        pins: [
          { id: "p1", node: "GND", side: "left", role: "non_inverting" },
          { id: "p2", node: "Vminus", side: "left", role: "inverting" },
          { id: "p3", node: "Vout", side: "right" },
        ],
      },
    ],
    ground: "GND",
    nodeAnnotations: [
      { node: "Vout", label: "V_out", style: "label_only" },
    ],
    measurementMarks: [
      { kind: "voltage", refs: ["Vout", "GND"], label: "V_out" },
    ],
  };

  return {
    netlist, solverNet, Vout, Vminus, Vplus,
    target: "Vout", targetValue: Vout, targetLabel: "V_{out}",
    archetype: "summing",
    gainFormula: `V_out = -R_f·(V_1/R_1 + V_2/R_2) = -${Rf_k}·(${V1}/${R1_k} + ${V2}/${R2_k}) = ${Vout} V`,
    values: { V_1: V1, V_2: V2, R_1_kohm: R1_k, R_2_kohm: R2_k, R_f_kohm: Rf_k },
  };
}
