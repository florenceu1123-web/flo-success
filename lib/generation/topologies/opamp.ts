import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import {
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

const cascadeLog = createLogger("lib/generation/topologies/opamp/cascade");

/**
 * 헬퍼: BranchTemplate path 표준 적용.
 *  - DEFAULT_BRANCH_RULES 자동 attach
 *  - validateBranchTemplate 검증 → 위반 시 경고 로그
 *  - instantiateAnalogTemplate + assembleNetlist
 *  - metadata(nodeAnnotations·measurementMarks·positions) 추가
 */
function assembleViaBranchTemplate(args: {
  branches: BranchTemplate[];
  values: AnalogValueAssignment[];
  metadata?: Pick<CircuitNetlist, "nodeAnnotations" | "measurementMarks" | "positions">;
}): CircuitNetlist {
  // 각 branch에 role별 default rules 자동 attach (안 박혀있으면)
  const enriched: BranchTemplate[] = args.branches.map((b) => ({
    ...b,
    rules: b.rules ?? DEFAULT_BRANCH_RULES[b.role],
  }));
  const validation = validateBranchTemplate(enriched);
  if (!validation.ok) {
    cascadeLog.warn("opamp_branch_template_violation", { issues: validation.issues });
  }
  const instantiated = instantiateAnalogTemplate(enriched, args.values);
  const base = assembleNetlist(instantiated, "GND");
  return { ...base, ...args.metadata };
}

/**
 * 이상 OPAMP 회로 generator.
 *
 *  Archetypes:
 *   - "inverting":         V_out = -V_in·(R_f/R_in), V+ grounded
 *   - "non_inverting":     V_out = V_in·(1 + R_f/R_g), V+ = V_in
 *   - "summing":           V_out = -R_f·(V_1/R_1 + V_2/R_2), V+ grounded
 *   - "difference":        V_out = (R_f/R_in)·(V_2 - V_1), 균형형 (R_in=R_g, R_f=R_p)
 *   - "voltage_follower":  V_out = V_in, V- = V_out (직접 피드백)
 *
 *  솔버는 MNA ideal opamp 지원 활용 — V_+ = V_-, 입력 전류 0.
 */

export type OpampArchetype =
  | "inverting"
  | "non_inverting"
  | "summing"
  | "difference"
  | "voltage_follower"
  | "cascade";   // 2-OPAMP 직렬 — 임용 5번 (가) 패턴

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
  /**
   * cascade archetype 전용 — 단계 2의 (나) figure (single OPAMP difference amp template).
   * R_1·R_2 값은 학생이 단계 2에서 (가)와 등가가 되도록 결정해야 할 unknown.
   */
  secondaryNetlist?: CircuitNetlist;
  secondaryLabel?: string;
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
    ?? pick<OpampArchetype>(
      ["inverting", "non_inverting", "summing", "difference", "voltage_follower"],
      rand,
    );
  switch (archetype) {
    case "inverting":        return buildInverting(rand);
    case "non_inverting":    return buildNonInverting(rand);
    case "summing":          return buildSumming(rand);
    case "difference":       return buildDifference(rand);
    case "voltage_follower": return buildVoltageFollower(rand);
    case "cascade":          return buildCascade(rand);
  }
}

// =====================================================================
// Archetype 6: 2-OPAMP cascade (임용 5번 (가) 패턴)
//   첫 OPAMP: V_2 → R_in1 → U1.vn (V+ = GND), R_f1 feedback → V_u1out = -R_f1/R_in1·V_2
//   둘째 OPAMP: U1.vo → R_a → U2.vn; V_1 → R_b → U2.vn (V+ = GND), R_f2 feedback
//     → V_o = -R_f2·(V_u1out/R_a + V_1/R_b)
//   = (R_f2·R_f1)/(R_a·R_in1) · V_2 - R_f2/R_b · V_1
// =====================================================================
function buildCascade(rand: () => number): OpampGeneration {
  const V_1 = pick([1, 2, 3], rand);
  const V_2 = pick([1, 2, 3], rand);
  const R_in1_k = pick([1, 2], rand);
  const R_f1_k = pick([1, 2, 4], rand);
  const R_a_k = pick([1, 2], rand);
  const R_b_k = pick([1, 2], rand);
  const R_f2_k = pick([2, 4, 5], rand);

  const R_in1 = R_in1_k * 1000;
  const R_f1 = R_f1_k * 1000;
  const R_a = R_a_k * 1000;
  const R_b = R_b_k * 1000;
  const R_f2 = R_f2_k * 1000;

  const solverNet: SolverNetwork = {
    nodeIds: ["V2", "V1", "u1in", "u1out", "u2in", "Vo"],
    groundId: "GND",
    resistors: [
      { id: "R_in1", a: "V2",    b: "u1in",  R: R_in1 },
      { id: "R_f1",  a: "u1in",  b: "u1out", R: R_f1 },
      { id: "R_a",   a: "u1out", b: "u2in",  R: R_a },
      { id: "R_b",   a: "V1",    b: "u2in",  R: R_b },
      { id: "R_f2",  a: "u2in",  b: "Vo",    R: R_f2 },
    ],
    vsources: [
      { id: "Vs1", a: "V1", b: "GND", V: V_1 },
      { id: "Vs2", a: "V2", b: "GND", V: V_2 },
    ],
    isources: [],
    opamps: [
      { id: "U1", vp: "GND", vn: "u1in", vo: "u1out" },
      { id: "U2", vp: "GND", vn: "u2in", vo: "Vo" },
    ],
  };

  const sol = solveMNA(solverNet);
  const Vout = round3(sol.nodeVoltages.Vo);

  const netlist = assembleViaBranchTemplate({
    branches: [
      { id: "br_Vs1", role: "input_source_leg", orientation: "vertical", fromNode: "V1", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs1" }] },
      { id: "br_Vs2", role: "input_source_leg", orientation: "vertical", fromNode: "V2", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs2" }] },
      { id: "br_Rin1", role: "opamp_input_resistor", orientation: "horizontal", fromNode: "V2", toNode: "u1in",
        components: [{ type: "R", role: "input_resistor", order: 1, required: true, idOverride: "R_in1" }] },
      { id: "br_Rf1", role: "opamp_feedback_resistor", orientation: "horizontal", fromNode: "u1in", toNode: "u1out",
        components: [{ type: "R", role: "feedback_resistor", order: 1, required: true, idOverride: "R_f1" }] },
      { id: "br_U1", role: "opamp_block", orientation: "horizontal", fromNode: "u1in", toNode: "u1out",
        opampNodes: { vp: "GND", vn: "u1in", vo: "u1out" },
        components: [{ type: "OPAMP", role: "opamp", order: 1, required: false, idOverride: "U1" }] },
      { id: "br_Ra", role: "cascade_coupling", orientation: "horizontal", fromNode: "u1out", toNode: "u2in",
        components: [{ type: "R", role: "coupling_resistor", order: 1, required: true, idOverride: "R_a" }] },
      { id: "br_Rb", role: "opamp_input_resistor", orientation: "horizontal", fromNode: "V1", toNode: "u2in",
        components: [{ type: "R", role: "input_resistor", order: 1, required: true, idOverride: "R_b" }] },
      { id: "br_Rf2", role: "opamp_feedback_resistor", orientation: "horizontal", fromNode: "u2in", toNode: "Vo",
        components: [{ type: "R", role: "feedback_resistor", order: 1, required: true, idOverride: "R_f2" }] },
      { id: "br_U2", role: "opamp_block", orientation: "horizontal", fromNode: "u2in", toNode: "Vo",
        opampNodes: { vp: "GND", vn: "u2in", vo: "Vo" },
        components: [{ type: "OPAMP", role: "opamp", order: 1, required: false, idOverride: "U2" }] },
    ],
    values: [
      { branchId: "br_Vs1", componentRole: "voltage_source", type: "V", value: `${V_1}V` },
      { branchId: "br_Vs2", componentRole: "voltage_source", type: "V", value: `${V_2}V` },
      { branchId: "br_Rin1", componentRole: "input_resistor", type: "R", value: `${R_in1_k}kΩ` },
      { branchId: "br_Rf1", componentRole: "feedback_resistor", type: "R", value: `${R_f1_k}kΩ` },
      { branchId: "br_Ra", componentRole: "coupling_resistor", type: "R", value: `${R_a_k}kΩ` },
      { branchId: "br_Rb", componentRole: "input_resistor", type: "R", value: `${R_b_k}kΩ` },
      { branchId: "br_Rf2", componentRole: "feedback_resistor", type: "R", value: `${R_f2_k}kΩ` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "V1", label: "V_1", style: "label_only" },
        { node: "V2", label: "V_2", style: "label_only" },
        { node: "Vo", label: "V_o", style: "label_only" },
      ],
      measurementMarks: [{ kind: "voltage", refs: ["Vo", "GND"], label: "V_o" }],
      positions: {
        // node: top rail 좌→우 cascade flow. V_1은 u2in 아래쪽에 둬서 R_b(V1↔u2in)가
        // U1 body를 가로지르지 않게 (V1을 좌하단에 두면 R_b 대각선이 U1과 겹침).
        V2: { x: 120, y: 200 }, u1in: { x: 360, y: 200 }, u1out: { x: 600, y: 200 },
        u2in: { x: 760, y: 200 }, Vo: { x: 1000, y: 200 },
        V1: { x: 760, y: 420 },  // u2in 바로 아래 — R_b는 짧은 vertical
        GND: { x: 440, y: 560 },
        U1: { x: 480, y: 300 }, U2: { x: 880, y: 300 },
        Vs1: { x: 760, y: 490 }, Vs2: { x: 120, y: 340 },
      },
    },
  });

  const gainV2 = (R_f2 * R_f1) / (R_a * R_in1);
  const gainV1 = -R_f2 / R_b;
  const gainFormula = `V_o = (R_{f2}·R_{f1})/(R_a·R_{in1})·V_2 − (R_{f2}/R_b)·V_1 = ${round3(gainV2)}·V_2 + ${round3(gainV1)}·V_1`;

  // ── (나) figure: single OPAMP difference amp template ──
  //   원본 5번 (나) 패턴: V_1 → 2kΩ → V_minus, V_2 → R_1 → V_plus,
  //                       R_2 (V_minus↔V_o feedback), R_2 (V_plus↔GND)
  //   R_1·R_2는 학생이 단계 2에서 (가)와 등가가 되도록 결정 — 회로에는 라벨만, value 미명시.
  const secondaryNetlist = assembleViaBranchTemplate({
    branches: [
      { id: "br_Vs1b", role: "input_source_leg", orientation: "vertical", fromNode: "V1b", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs1" }] },
      { id: "br_Vs2b", role: "input_source_leg", orientation: "vertical", fromNode: "V2b", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs2" }] },
      { id: "br_Rfixed", role: "opamp_input_resistor", orientation: "horizontal", fromNode: "V1b", toNode: "Vminusb",
        components: [{ type: "R", role: "input_resistor", order: 1, required: true, idOverride: "R_fixed" }] },
      { id: "br_R1b", role: "opamp_input_resistor", orientation: "horizontal", fromNode: "V2b", toNode: "Vplusb",
        components: [{ type: "R", role: "input_resistor", order: 1, required: true, idOverride: "R_1" }] },
      { id: "br_R2pb", role: "load_leg", orientation: "vertical", fromNode: "Vplusb", toNode: "GND",
        components: [{ type: "R", role: "ground_resistor", order: 1, required: true, idOverride: "R_2" }] },
      { id: "br_R2fb", role: "opamp_feedback_resistor", orientation: "horizontal", fromNode: "Vminusb", toNode: "Vob",
        components: [{ type: "R", role: "feedback_resistor", order: 1, required: true, idOverride: "R_2" }] },
      { id: "br_U1b", role: "opamp_block", orientation: "horizontal", fromNode: "Vminusb", toNode: "Vob",
        opampNodes: { vp: "Vplusb", vn: "Vminusb", vo: "Vob" },
        components: [{ type: "OPAMP", role: "opamp", order: 1, required: false, idOverride: "U1" }] },
    ],
    values: [
      { branchId: "br_Vs1b", componentRole: "voltage_source", type: "V", value: `${V_1}V` },
      { branchId: "br_Vs2b", componentRole: "voltage_source", type: "V", value: `${V_2}V` },
      { branchId: "br_Rfixed", componentRole: "input_resistor", type: "R", value: "2kΩ" },
      { branchId: "br_R1b", componentRole: "input_resistor", type: "R", value: "R_1" },
      { branchId: "br_R2pb", componentRole: "ground_resistor", type: "R", value: "R_2" },
      { branchId: "br_R2fb", componentRole: "feedback_resistor", type: "R", value: "R_2" },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "V1b", label: "V_1", style: "label_only" },
        { node: "V2b", label: "V_2", style: "label_only" },
        { node: "Vob", label: "V_o", style: "label_only" },
      ],
      measurementMarks: [{ kind: "voltage", refs: ["Vob", "GND"], label: "V_o" }],
    },
  });

  return {
    netlist, solverNet,
    Vout, Vminus: 0, Vplus: 0,
    target: "Vout", targetValue: Vout, targetLabel: "V_o",
    archetype: "cascade",
    gainFormula,
    values: { V_1, V_2, R_in1_k, R_f1_k, R_a_k, R_b_k, R_f2_k },
    secondaryNetlist,
    secondaryLabel: "(나) 등가 single OPAMP — R_1·R_2를 (가)와 등가가 되도록 결정",
  };
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

  const netlist = assembleViaBranchTemplate({
    branches: [
      { id: "br_Vs", role: "input_source_leg", orientation: "vertical", fromNode: "Vin", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs" }] },
      { id: "br_Rin", role: "opamp_input_resistor", orientation: "horizontal", fromNode: "Vin", toNode: "Vminus",
        components: [{ type: "R", role: "input_resistor", order: 1, required: true, idOverride: "Rin" }] },
      { id: "br_Rf", role: "opamp_feedback_resistor", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        components: [{ type: "R", role: "feedback_resistor", order: 1, required: true, idOverride: "Rf" }] },
      { id: "br_U1", role: "opamp_block", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        opampNodes: { vp: "GND", vn: "Vminus", vo: "Vout" },
        components: [{ type: "OPAMP", role: "opamp", order: 1, required: false, idOverride: "U1" }] },
    ],
    values: [
      { branchId: "br_Vs", componentRole: "voltage_source", type: "V", value: `${Vin}V` },
      { branchId: "br_Rin", componentRole: "input_resistor", type: "R", value: `${Rin_k}kΩ` },
      { branchId: "br_Rf", componentRole: "feedback_resistor", type: "R", value: `${Rf_k}kΩ` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "Vin", label: "V_in", style: "label_only" },
        { node: "Vout", label: "V_out", style: "label_only" },
      ],
      measurementMarks: [{ kind: "voltage", refs: ["Vout", "GND"], label: "V_out" }],
    },
  });

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

  const netlist = assembleViaBranchTemplate({
    branches: [
      { id: "br_Vs", role: "input_source_leg", orientation: "vertical", fromNode: "Vin", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs" }] },
      { id: "br_U1", role: "opamp_block", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        opampNodes: { vp: "Vin", vn: "Vminus", vo: "Vout" },
        components: [{ type: "OPAMP", role: "opamp", order: 1, required: false, idOverride: "U1" }] },
      { id: "br_Rf", role: "opamp_feedback_resistor", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        components: [{ type: "R", role: "feedback_resistor", order: 1, required: true, idOverride: "Rf" }] },
      { id: "br_Rg", role: "load_leg", orientation: "vertical", fromNode: "Vminus", toNode: "GND",
        components: [{ type: "R", role: "ground_resistor", order: 1, required: true, idOverride: "Rg" }] },
    ],
    values: [
      { branchId: "br_Vs", componentRole: "voltage_source", type: "V", value: `${Vin}V` },
      { branchId: "br_Rf", componentRole: "feedback_resistor", type: "R", value: `${Rf_k}kΩ` },
      { branchId: "br_Rg", componentRole: "ground_resistor", type: "R", value: `${Rg_k}kΩ` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "Vin", label: "V_in", style: "label_only" },
        { node: "Vout", label: "V_out", style: "label_only" },
      ],
      measurementMarks: [{ kind: "voltage", refs: ["Vout", "GND"], label: "V_out" }],
    },
  });

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

  const netlist = assembleViaBranchTemplate({
    branches: [
      { id: "br_Vs1", role: "input_source_leg", orientation: "vertical", fromNode: "V1n", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs1" }] },
      { id: "br_Vs2", role: "input_source_leg", orientation: "vertical", fromNode: "V2n", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs2" }] },
      { id: "br_R1", role: "opamp_input_resistor", orientation: "horizontal", fromNode: "V1n", toNode: "Vminus",
        components: [{ type: "R", role: "input_resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_R2", role: "opamp_input_resistor", orientation: "horizontal", fromNode: "V2n", toNode: "Vminus",
        components: [{ type: "R", role: "input_resistor", order: 1, required: true, idOverride: "R2" }] },
      { id: "br_Rf", role: "opamp_feedback_resistor", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        components: [{ type: "R", role: "feedback_resistor", order: 1, required: true, idOverride: "Rf" }] },
      { id: "br_U1", role: "opamp_block", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        opampNodes: { vp: "GND", vn: "Vminus", vo: "Vout" },
        components: [{ type: "OPAMP", role: "opamp", order: 1, required: false, idOverride: "U1" }] },
    ],
    values: [
      { branchId: "br_Vs1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_Vs2", componentRole: "voltage_source", type: "V", value: `${V2}V` },
      { branchId: "br_R1", componentRole: "input_resistor", type: "R", value: `${R1_k}kΩ` },
      { branchId: "br_R2", componentRole: "input_resistor", type: "R", value: `${R2_k}kΩ` },
      { branchId: "br_Rf", componentRole: "feedback_resistor", type: "R", value: `${Rf_k}kΩ` },
    ],
    metadata: {
      nodeAnnotations: [{ node: "Vout", label: "V_out", style: "label_only" }],
      measurementMarks: [{ kind: "voltage", refs: ["Vout", "GND"], label: "V_out" }],
    },
  });

  return {
    netlist, solverNet, Vout, Vminus, Vplus,
    target: "Vout", targetValue: Vout, targetLabel: "V_{out}",
    archetype: "summing",
    gainFormula: `V_out = -R_f·(V_1/R_1 + V_2/R_2) = -${Rf_k}·(${V1}/${R1_k} + ${V2}/${R2_k}) = ${Vout} V`,
    values: { V_1: V1, V_2: V2, R_1_kohm: R1_k, R_2_kohm: R2_k, R_f_kohm: Rf_k },
  };
}

// =====================================================================
// Archetype 4: Difference amp (균형형)
//   V_1 → R_in → V- → R_f → V_out
//   V_2 → R_g → V+ → R_p → GND
//   균형 조건 (R_in = R_g, R_f = R_p) → V_out = (R_f/R_in)·(V_2 - V_1)
// =====================================================================
function buildDifference(rand: () => number): OpampGeneration {
  const V1 = pick([1, 2, 3, 4], rand);
  let V2 = pick([1, 2, 3, 4, 5], rand);
  if (V2 === V1) V2 = pick([2, 3, 4, 5, 6], rand);  // 같으면 V_out=0이라 재선택
  const Rin_k = pick(NICE_R_KOHM, rand);
  let Rf_k = pick(NICE_R_KOHM, rand);
  while (Rf_k / Rin_k > 10 || Rf_k / Rin_k < 0.5) Rf_k = pick(NICE_R_KOHM, rand);

  const Rin = Rin_k * 1000;
  const Rf = Rf_k * 1000;
  // 균형: R_g = R_in, R_p = R_f
  const Rg = Rin;
  const Rp = Rf;

  const solverNet: SolverNetwork = {
    nodeIds: ["V1n", "V2n", "Vplus", "Vminus", "Vout"],
    groundId: "GND",
    resistors: [
      { id: "Rin", a: "V1n", b: "Vminus", R: Rin },
      { id: "Rg",  a: "V2n", b: "Vplus",  R: Rg },
      { id: "Rp",  a: "Vplus", b: "GND",  R: Rp },
      { id: "Rf",  a: "Vminus", b: "Vout", R: Rf },
    ],
    vsources: [
      { id: "Vs1", a: "V1n", b: "GND", V: V1 },
      { id: "Vs2", a: "V2n", b: "GND", V: V2 },
    ],
    isources: [],
    opamps: [{ id: "U1", vp: "Vplus", vn: "Vminus", vo: "Vout" }],
  };
  const sol = solveMNA(solverNet);
  const Vout = round3(sol.nodeVoltages.Vout);
  const Vminus = round3(sol.nodeVoltages.Vminus);
  const Vplus = round3(sol.nodeVoltages.Vplus);

  const netlist = assembleViaBranchTemplate({
    branches: [
      { id: "br_Vs1", role: "input_source_leg", orientation: "vertical", fromNode: "V1n", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs1" }] },
      { id: "br_Vs2", role: "input_source_leg", orientation: "vertical", fromNode: "V2n", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs2" }] },
      { id: "br_Rin", role: "opamp_input_resistor", orientation: "horizontal", fromNode: "V1n", toNode: "Vminus",
        components: [{ type: "R", role: "input_resistor", order: 1, required: true, idOverride: "Rin" }] },
      { id: "br_Rg", role: "opamp_input_resistor", orientation: "horizontal", fromNode: "V2n", toNode: "Vplus",
        components: [{ type: "R", role: "input_resistor", order: 1, required: true, idOverride: "Rg" }] },
      { id: "br_Rp", role: "load_leg", orientation: "vertical", fromNode: "Vplus", toNode: "GND",
        components: [{ type: "R", role: "ground_resistor", order: 1, required: true, idOverride: "Rp" }] },
      { id: "br_Rf", role: "opamp_feedback_resistor", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        components: [{ type: "R", role: "feedback_resistor", order: 1, required: true, idOverride: "Rf" }] },
      { id: "br_U1", role: "opamp_block", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        opampNodes: { vp: "Vplus", vn: "Vminus", vo: "Vout" },
        components: [{ type: "OPAMP", role: "opamp", order: 1, required: false, idOverride: "U1" }] },
    ],
    values: [
      { branchId: "br_Vs1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_Vs2", componentRole: "voltage_source", type: "V", value: `${V2}V` },
      { branchId: "br_Rin", componentRole: "input_resistor", type: "R", value: `${Rin_k}kΩ` },
      { branchId: "br_Rg", componentRole: "input_resistor", type: "R", value: `${Rin_k}kΩ` },
      { branchId: "br_Rp", componentRole: "ground_resistor", type: "R", value: `${Rf_k}kΩ` },
      { branchId: "br_Rf", componentRole: "feedback_resistor", type: "R", value: `${Rf_k}kΩ` },
    ],
    metadata: {
      nodeAnnotations: [{ node: "Vout", label: "V_out", style: "label_only" }],
      measurementMarks: [{ kind: "voltage", refs: ["Vout", "GND"], label: "V_out" }],
    },
  });

  return {
    netlist, solverNet, Vout, Vminus, Vplus,
    target: "Vout", targetValue: Vout, targetLabel: "V_{out}",
    archetype: "difference",
    gainFormula: `V_out = (R_f/R_in)·(V_2 - V_1) = (${Rf_k}/${Rin_k})·(${V2} - ${V1}) = ${Vout} V`,
    values: { V_1: V1, V_2: V2, R_in_kohm: Rin_k, R_f_kohm: Rf_k },
  };
}

// =====================================================================
// Archetype 5: Voltage follower (buffer)
//   V_in → V+
//   V_out → V- (직접 피드백)
//   V_out = V_in
//
//   ※ 솔버 안정화를 위해 출력에 큰 풀다운 R_L (1MΩ) 추가 — 결과 동일.
// =====================================================================
function buildVoltageFollower(rand: () => number): OpampGeneration {
  const Vin = pick(NICE_VOLTAGES, rand);  // 작은 값 아니어도 OK (buffer는 그대로 따라감)
  const RL_k = 1000;  // 1MΩ 풀다운 (안정화용)

  const RL = RL_k * 1000;

  const solverNet: SolverNetwork = {
    nodeIds: ["Vin", "Vout"],
    groundId: "GND",
    resistors: [
      { id: "RL", a: "Vout", b: "GND", R: RL },
    ],
    vsources: [{ id: "Vs", a: "Vin", b: "GND", V: Vin }],
    isources: [],
    opamps: [{ id: "U1", vp: "Vin", vn: "Vout", vo: "Vout" }],
  };
  const sol = solveMNA(solverNet);
  const Vout = round3(sol.nodeVoltages.Vout);
  const Vminus = Vout;  // vn = vo for buffer
  const Vplus = round3(sol.nodeVoltages.Vin);

  // voltage follower: vn=vo=Vout (직접 피드백). opamp_block의 opampNodes로 자연스럽게 표현.
  const netlist = assembleViaBranchTemplate({
    branches: [
      { id: "br_Vs", role: "input_source_leg", orientation: "vertical", fromNode: "Vin", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs" }] },
      { id: "br_U1", role: "opamp_block", orientation: "horizontal", fromNode: "Vin", toNode: "Vout",
        opampNodes: { vp: "Vin", vn: "Vout", vo: "Vout" },
        components: [{ type: "OPAMP", role: "opamp", order: 1, required: false, idOverride: "U1" }] },
      { id: "br_RL", role: "load_leg", orientation: "vertical", fromNode: "Vout", toNode: "GND",
        components: [{ type: "R", role: "load_resistor", order: 1, required: true, idOverride: "RL" }] },
    ],
    values: [
      { branchId: "br_Vs", componentRole: "voltage_source", type: "V", value: `${Vin}V` },
      { branchId: "br_RL", componentRole: "load_resistor", type: "R", value: `${RL_k}kΩ` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "Vin", label: "V_in", style: "label_only" },
        { node: "Vout", label: "V_out", style: "label_only" },
      ],
      measurementMarks: [{ kind: "voltage", refs: ["Vout", "GND"], label: "V_out" }],
    },
  });

  return {
    netlist, solverNet, Vout, Vminus, Vplus,
    target: "Vout", targetValue: Vout, targetLabel: "V_{out}",
    archetype: "voltage_follower",
    gainFormula: `V_out = V_in = ${Vin} V (단일 이득 버퍼 — 임피던스 변환용)`,
    values: { V_in: Vin },
  };
}
