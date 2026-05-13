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

const dslog = createLogger("lib/generation/topologies/dcDependentSource");

function assembleViaBT(args: {
  branches: BranchTemplate[];
  values: AnalogValueAssignment[];
  metadata?: Pick<CircuitNetlist, "nodeAnnotations" | "measurementMarks" | "positions">;
}): CircuitNetlist {
  const enriched = args.branches.map((b) => ({ ...b, rules: b.rules ?? DEFAULT_BRANCH_RULES[b.role] }));
  const validation = validateBranchTemplate(enriched);
  if (!validation.ok) dslog.warn("branch_template_violation", { issues: validation.issues });
  const inst = instantiateAnalogTemplate(enriched, args.values);
  return { ...assembleNetlist(inst, "GND"), ...args.metadata };
}

/**
 * DC 종속전원 회로 generator.
 *
 *  Archetypes:
 *   - "vccs_chain":     VCCS, I_dep = g_m · V_x (V_x = V(a))
 *   - "cccs_inject":    CCCS, I_dep = β · I_x  (I_x = I_R1, top→a 방향)
 *   - "ccvs_in_series": CCVS, V_dep = r · I_x  (I_x = I_R1)
 *
 *  CCCS/CCVS는 제어 전류 I_x를 (V_a - V_b)/R로 전개해 솔버 입력으론 등가 VCCS/VCVS
 *  로 변환 (g_eff = β/R, k_eff = r/R). 네트리스트 UI에는 CCCS/CCVS 컴포넌트로 표시.
 *
 *  종속전원 풀이 절차:
 *    1) 미지수 정의 (V_a, V_b 또는 mesh 전류)
 *    2) KCL/KVL에서 종속 항을 미지수 함수로 표기 (별도 미지수 아님)
 *    3) 연립방정식 풀이
 */

export type DepSourceArchetype = "vccs_chain" | "cccs_inject" | "ccvs_in_series";
export type DepSourceType = "VCCS" | "CCCS" | "VCVS" | "CCVS";

export type DepSourceGeneration = {
  netlist: CircuitNetlist;
  solverNet: SolverNetwork;
  Vnodes: Record<string, number>;
  target: "Va" | "Vb" | "Ir3";
  targetValue: number;
  targetLabel: string;
  archetype: DepSourceArchetype;
  depSourceType: DepSourceType;
  /** 제어 변수 이름 (한국어 라벨) — "V_x" 또는 "I_x" */
  controlLabel: string;
  /** 제어 변수의 의미 설명 (한국어 풀이용) */
  controlDescription: string;
  /** 종속전원 식 — "0.1·V_x [A]" 등 (UI/풀이 양쪽 사용) */
  depFormula: string;
  values: Record<string, number>;
};

const NICE_GM = [0.05, 0.1, 0.2, 0.25, 0.5];        // VCCS transconductance (S)
const NICE_BETA = [2, 3, 4, 5, 8, 10];                // CCCS current gain (unitless)
const NICE_R_TRANS = [4, 6, 8, 10, 12, 15, 20];       // CCVS transresistance (Ω)
const NICE_VCVS_K = [2, 3, 4, 5];                     // VCVS voltage gain (unused now)
void NICE_VCVS_K;

export function generateDcDependentSource(args: {
  params?: CircuitTypeParams;
  archetype?: DepSourceArchetype;
  seed?: number;
}): DepSourceGeneration {
  const rand = makeRand(args.seed);
  const archetype: DepSourceArchetype = args.archetype
    ?? pick<DepSourceArchetype>(["vccs_chain", "cccs_inject", "ccvs_in_series"], rand);
  switch (archetype) {
    case "vccs_chain":     return buildVccsChain(rand);
    case "cccs_inject":    return buildCccsInject(rand);
    case "ccvs_in_series": return buildCcvsInSeries(rand);
  }
}

// =====================================================================
// Archetype 1: VCCS (기존)
//   I_dep = g_m·V_x, V_x = V(a)
//   ●top─R1─●a─R2─●b
//           │     │
//           Rx    R3 + VCCS injects into b
// =====================================================================
function buildVccsChain(rand: () => number): DepSourceGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  const R2 = pick(NICE_RESISTORS, rand);
  let Rx = pick(NICE_RESISTORS, rand);
  if (Rx === R1) Rx = pick(NICE_RESISTORS, rand);
  const R3 = pick(NICE_RESISTORS, rand);
  const gm = pick(NICE_GM, rand);

  const solverNet: SolverNetwork = {
    nodeIds: ["top", "a", "b"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "a",   R: R1 },
      { id: "R2", a: "a",   b: "b",   R: R2 },
      { id: "Rx", a: "a",   b: "GND", R: Rx },
      { id: "R3", a: "b",   b: "GND", R: R3 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [],
    vccs: [{ id: "Gx", a: "GND", b: "b", vca: "a", vcb: "GND", g: gm }],
  };
  const sol = solveMNA(solverNet);
  const Vnodes = { top: round3(sol.nodeVoltages.top), a: round3(sol.nodeVoltages.a), b: round3(sol.nodeVoltages.b) };
  const Ir3 = round3(Vnodes.b / R3);

  const t = pickTarget(rand, Vnodes, Ir3);

  const netlist = assembleViaBT({
    branches: [
      { id: "br_V1", role: "left_source_leg", orientation: "vertical", fromNode: "top", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V1" }] },
      { id: "br_R1", role: "top_rail", orientation: "horizontal", fromNode: "top", toNode: "a",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_R2", role: "top_rail", orientation: "horizontal", fromNode: "a", toNode: "b",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R2" }] },
      { id: "br_Rx", role: "load_leg", orientation: "vertical", fromNode: "a", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "Rx" }] },
      { id: "br_R3", role: "load_leg", orientation: "vertical", fromNode: "b", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R3" }] },
      { id: "br_Gx", role: "dependent_source_leg", orientation: "vertical", fromNode: "b", toNode: "GND",
        components: [{ type: "VCCS", role: "dep_current_source", order: 1, required: true, idOverride: "Gx" }] },
    ],
    values: [
      { branchId: "br_V1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1}Ω` },
      { branchId: "br_R2", componentRole: "resistor", type: "R", value: `${R2}Ω` },
      { branchId: "br_Rx", componentRole: "resistor", type: "R", value: `${Rx}Ω` },
      { branchId: "br_R3", componentRole: "resistor", type: "R", value: `${R3}Ω` },
      { branchId: "br_Gx", componentRole: "dep_current_source", type: "VCCS", value: `${gm}·V_x`, gain: `${gm}` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "a", label: "a (V_x)", style: "label_only" },
        { node: "b", label: "b", style: "label_only" },
      ],
      measurementMarks: [{ kind: "voltage", refs: ["a", "GND"], label: "V_x" }],
    },
  });

  return {
    netlist, solverNet, Vnodes,
    target: t.key, targetValue: t.value, targetLabel: t.label,
    archetype: "vccs_chain",
    depSourceType: "VCCS",
    controlLabel: "V_x",
    controlDescription: "V_x = V(a) (단자 a의 전위)",
    depFormula: `${gm}·V_x [A]`,
    values: { V1, R1, R2, Rx, R3, g_m: gm },
  };
}

// =====================================================================
// Archetype 2: CCCS (R 전류 제어)
//   I_dep = β·I_x, I_x = I_R1 (top→a 방향)
//   토폴로지 동일하나 dep source는 β·I_x로 표시.
//   I_R1 = (V_top - V_a)/R1 → 등가 VCCS: vca=top, vcb=a, g_eff = β/R1
// =====================================================================
function buildCccsInject(rand: () => number): DepSourceGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  const R2 = pick(NICE_RESISTORS, rand);
  let Rx = pick(NICE_RESISTORS, rand);
  if (Rx === R1) Rx = pick(NICE_RESISTORS, rand);
  const R3 = pick(NICE_RESISTORS, rand);
  const beta = pick(NICE_BETA, rand);

  // CCCS β·I_R1 inject into b. I_R1 = (V_top - V_a)/R1 → VCCS g_eff = β/R1, vca=top, vcb=a
  const solverNet: SolverNetwork = {
    nodeIds: ["top", "a", "b"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "a",   R: R1 },
      { id: "R2", a: "a",   b: "b",   R: R2 },
      { id: "Rx", a: "a",   b: "GND", R: Rx },
      { id: "R3", a: "b",   b: "GND", R: R3 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [],
    vccs: [{ id: "Fx", a: "GND", b: "b", vca: "top", vcb: "a", g: beta / R1 }],
  };
  const sol = solveMNA(solverNet);
  const Vnodes = { top: round3(sol.nodeVoltages.top), a: round3(sol.nodeVoltages.a), b: round3(sol.nodeVoltages.b) };
  const Ir3 = round3(Vnodes.b / R3);

  const t = pickTarget(rand, Vnodes, Ir3);

  const netlist = assembleViaBT({
    branches: [
      { id: "br_V1", role: "left_source_leg", orientation: "vertical", fromNode: "top", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V1" }] },
      { id: "br_R1", role: "top_rail", orientation: "horizontal", fromNode: "top", toNode: "a",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_R2", role: "top_rail", orientation: "horizontal", fromNode: "a", toNode: "b",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R2" }] },
      { id: "br_Rx", role: "load_leg", orientation: "vertical", fromNode: "a", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "Rx" }] },
      { id: "br_R3", role: "load_leg", orientation: "vertical", fromNode: "b", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R3" }] },
      { id: "br_Fx", role: "dependent_source_leg", orientation: "vertical", fromNode: "b", toNode: "GND",
        components: [{ type: "CCCS", role: "dep_current_source", order: 1, required: true, idOverride: "Fx" }] },
    ],
    values: [
      { branchId: "br_V1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1}Ω` },
      { branchId: "br_R2", componentRole: "resistor", type: "R", value: `${R2}Ω` },
      { branchId: "br_Rx", componentRole: "resistor", type: "R", value: `${Rx}Ω` },
      { branchId: "br_R3", componentRole: "resistor", type: "R", value: `${R3}Ω` },
      { branchId: "br_Fx", componentRole: "dep_current_source", type: "CCCS", value: `${beta}·I_x`, gain: `${beta}` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "a", label: "a", style: "label_only" },
        { node: "b", label: "b", style: "label_only" },
      ],
      measurementMarks: [{ kind: "current", refs: ["R1"], label: "I_x" }],
    },
  });

  return {
    netlist, solverNet, Vnodes,
    target: t.key, targetValue: t.value, targetLabel: t.label,
    archetype: "cccs_inject",
    depSourceType: "CCCS",
    controlLabel: "I_x",
    controlDescription: "I_x = R_1을 통과하는 전류 (top→a 방향)",
    depFormula: `${beta}·I_x [A]`,
    values: { V1, R1, R2, Rx, R3, beta },
  };
}

// =====================================================================
// Archetype 3: CCVS (R 전류 제어, 직렬 V source)
//   V_dep = r·I_x, I_x = I_R1
//   ●top─R1─●a─[CCVS V=r·I_x]─●b─R3─GND
//   V1: top↔GND, Rx: a↔GND
//   CCVS V(a)-V(b) = r·I_R1 = (r/R1)·(V_top - V_a) → VCVS k_eff = r/R1
// =====================================================================
function buildCcvsInSeries(rand: () => number): DepSourceGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  let Rx = pick(NICE_RESISTORS, rand);
  if (Rx === R1) Rx = pick(NICE_RESISTORS, rand);
  const R3 = pick(NICE_RESISTORS, rand);
  const r = pick(NICE_R_TRANS, rand);

  const solverNet: SolverNetwork = {
    nodeIds: ["top", "a", "b"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "a",   R: R1 },
      { id: "Rx", a: "a",   b: "GND", R: Rx },
      { id: "R3", a: "b",   b: "GND", R: R3 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [],
    vcvs: [{ id: "Hx", a: "a", b: "b", vca: "top", vcb: "a", k: r / R1 }],
  };
  const sol = solveMNA(solverNet);
  const Vnodes = { top: round3(sol.nodeVoltages.top), a: round3(sol.nodeVoltages.a), b: round3(sol.nodeVoltages.b) };
  const Ir3 = round3(Vnodes.b / R3);

  const t = pickTarget(rand, Vnodes, Ir3);

  const netlist = assembleViaBT({
    branches: [
      { id: "br_V1", role: "left_source_leg", orientation: "vertical", fromNode: "top", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V1" }] },
      { id: "br_R1", role: "top_rail", orientation: "horizontal", fromNode: "top", toNode: "a",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_Rx", role: "load_leg", orientation: "vertical", fromNode: "a", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "Rx" }] },
      { id: "br_Hx", role: "dependent_source_leg", orientation: "horizontal", fromNode: "a", toNode: "b",
        components: [{ type: "CCVS", role: "dep_voltage_source", order: 1, required: true, idOverride: "Hx" }] },
      { id: "br_R3", role: "load_leg", orientation: "vertical", fromNode: "b", toNode: "GND",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R3" }] },
    ],
    values: [
      { branchId: "br_V1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1}Ω` },
      { branchId: "br_Rx", componentRole: "resistor", type: "R", value: `${Rx}Ω` },
      { branchId: "br_Hx", componentRole: "dep_voltage_source", type: "CCVS", value: `${r}·I_x [V]`, gain: `${r}` },
      { branchId: "br_R3", componentRole: "resistor", type: "R", value: `${R3}Ω` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "a", label: "a", style: "label_only" },
        { node: "b", label: "b", style: "label_only" },
      ],
      measurementMarks: [{ kind: "current", refs: ["R1"], label: "I_x" }],
    },
  });

  return {
    netlist, solverNet, Vnodes,
    target: t.key, targetValue: t.value, targetLabel: t.label,
    archetype: "ccvs_in_series",
    depSourceType: "CCVS",
    controlLabel: "I_x",
    controlDescription: "I_x = R_1을 통과하는 전류 (top→a 방향)",
    depFormula: `${r}·I_x [V]`,
    values: { V1, R1, Rx, R3, r },
  };
}

// =====================================================================
// 헬퍼들
// =====================================================================

function pickTarget(
  rand: () => number,
  Vnodes: Record<string, number>,
  Ir3: number,
): { key: "Va"|"Vb"|"Ir3"; label: string; value: number } {
  const choices: Array<{ key: "Va"|"Vb"|"Ir3"; label: string; value: number }> = [
    { key: "Va",  label: "V(a)",     value: Vnodes.a },
    { key: "Vb",  label: "V(b)",     value: Vnodes.b },
    { key: "Ir3", label: "I_{R_3}",  value: Ir3 },
  ];
  return choices[Math.floor(rand() * choices.length)];
}

function vSourceComp(id: string, V: number, posNode: string, negNode: string) {
  return {
    id, type: "V" as const, value: `${V}V`,
    pins: [
      { id: "p1", node: posNode, side: "top" as const, role: "positive" as const },
      { id: "p2", node: negNode, side: "bottom" as const, role: "negative" as const },
    ],
  };
}

function hResistorComp(id: string, R: number, leftNode: string, rightNode: string) {
  return {
    id, type: "R" as const, value: `${R}Ω`,
    pins: [
      { id: "p1", node: leftNode, side: "left" as const },
      { id: "p2", node: rightNode, side: "right" as const },
    ],
  };
}

function vResistorComp(id: string, R: number, topNode: string, bottomNode: string) {
  return {
    id, type: "R" as const, value: `${R}Ω`,
    pins: [
      { id: "p1", node: topNode, side: "top" as const },
      { id: "p2", node: bottomNode, side: "bottom" as const },
    ],
  };
}
