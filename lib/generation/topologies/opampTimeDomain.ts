import type {
  CircuitNetlist,
  CircuitTypeParams,
  WaveformDiagram,
} from "@/types";
import {
  NICE_CAPACITANCES_UF,
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

const otdlog = createLogger("lib/generation/topologies/opampTimeDomain");

function assembleViaBT(args: {
  branches: BranchTemplate[];
  values: AnalogValueAssignment[];
  metadata?: Pick<CircuitNetlist, "nodeAnnotations" | "measurementMarks" | "positions">;
}): CircuitNetlist {
  const enriched = args.branches.map((b) => ({ ...b, rules: b.rules ?? DEFAULT_BRANCH_RULES[b.role] }));
  const validation = validateBranchTemplate(enriched);
  if (!validation.ok) otdlog.warn("branch_template_violation", { issues: validation.issues });
  const inst = instantiateAnalogTemplate(enriched, args.values);
  return { ...assembleNetlist(inst, "GND"), ...args.metadata };
}

/**
 * 시간영역 OPAMP 회로 generator.
 *
 *  Archetypes:
 *   - "integrator_step":      V_in step → V_out = -V_step·t/(RC) (ramp)
 *   - "differentiator_ramp":  V_in ramp(a·t) → V_out = -RC·a (constant)
 *
 *  closed-form 솔버 (MNA의 C/L transient 미지원이라 직접 식 사용).
 */

export type OpampTimeDomainArchetype = "integrator_step" | "differentiator_ramp";

export type OpampTimeDomainGeneration = {
  netlist: CircuitNetlist;
  waveformDiagram: WaveformDiagram;
  archetype: OpampTimeDomainArchetype;
  /** 정답 — archetype별로 의미 다름 */
  answer: {
    /** 적분기: V_out at t_query (V). 미분기: V_out constant (V). */
    Vout: number;
    /** 적분기 전용: 묻는 시각 (ms) */
    tQueryMs?: number;
    /** 시정수 (ms) */
    tauMs: number;
  };
  values: Record<string, number>;
};

const NICE_R_KOHM = [1, 2, 5, 10, 20, 50, 100];

export function generateOpampTimeDomain(args: {
  params?: CircuitTypeParams;
  archetype?: OpampTimeDomainArchetype;
  seed?: number;
}): OpampTimeDomainGeneration {
  const rand = makeRand(args.seed);
  const archetype: OpampTimeDomainArchetype = args.archetype
    ?? pick<OpampTimeDomainArchetype>(["integrator_step", "differentiator_ramp"], rand);
  switch (archetype) {
    case "integrator_step":     return buildIntegratorStep(rand);
    case "differentiator_ramp": return buildDifferentiatorRamp(rand);
  }
}

// =====================================================================
// Integrator: V_in → R → V- → C → V_out (V+ to GND)
//   V_out(t) = -V_step·t/(RC) for step input V_in = V_step·u(t)
// =====================================================================
function buildIntegratorStep(rand: () => number): OpampTimeDomainGeneration {
  const Vstep = pick([1, 2, 3, 4, 5], rand);
  const R_k = pick(NICE_R_KOHM, rand);
  const C_uF = pick(NICE_CAPACITANCES_UF, rand);

  const R = R_k * 1000;
  const C = C_uF * 1e-6;
  const tauMs = R_k * C_uF;   // 단위 (kΩ × μF = ms)

  // t_query를 τ의 정수배 (1, 2, 3)로
  const N = pick([1, 2, 3], rand);
  const tQueryMs = N * tauMs;
  const tQuerySec = tQueryMs / 1000;

  const Vout = round3(-Vstep * tQuerySec / (R * C));

  const netlist = assembleViaBT({
    branches: [
      { id: "br_Vs", role: "input_source_leg", orientation: "vertical", fromNode: "Vin", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs" }] },
      { id: "br_R", role: "opamp_input_resistor", orientation: "horizontal", fromNode: "Vin", toNode: "Vminus",
        components: [{ type: "R", role: "input_resistor", order: 1, required: true, idOverride: "R" }] },
      { id: "br_C", role: "opamp_feedback_resistor", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        components: [{ type: "C", role: "feedback_capacitor", order: 1, required: true, idOverride: "C" }] },
      { id: "br_U1", role: "opamp_block", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        opampNodes: { vp: "GND", vn: "Vminus", vo: "Vout" },
        components: [{ type: "OPAMP", role: "opamp", order: 1, required: false, idOverride: "U1" }] },
    ],
    values: [
      { branchId: "br_Vs", componentRole: "voltage_source", type: "V", value: `${Vstep}V (step)` },
      { branchId: "br_R", componentRole: "input_resistor", type: "R", value: `${R_k}kΩ` },
      { branchId: "br_C", componentRole: "feedback_capacitor", type: "C", value: `${C_uF}μF` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "Vin", label: "V_in", style: "label_only" },
        { node: "Vout", label: "V_out", style: "label_only" },
      ],
      measurementMarks: [{ kind: "voltage", refs: ["Vout", "GND"], label: "V_out" }],
    },
  });

  // Waveform — 입력 step + 출력 linear ramp (8 ms 정도 표시)
  const tEndMs = Math.max(tQueryMs * 1.5, 5 * tauMs);
  const inputSamples = [
    { t: 0, v: 0 },
    { t: 0.001, v: Vstep },
    { t: tEndMs, v: Vstep },
  ];
  const outputSamples = [
    { t: 0, v: 0 },
    { t: tEndMs, v: round3(-Vstep * (tEndMs / 1000) / (R * C)) },
  ];
  const waveformDiagram: WaveformDiagram = {
    signals: [
      { name: "V_in", samples: inputSamples },
      { name: "V_out", samples: outputSamples },
    ],
    unit: { time: "ms", value: "V" },
  };

  return {
    netlist,
    waveformDiagram,
    archetype: "integrator_step",
    answer: {
      Vout,
      tQueryMs: round3(tQueryMs),
      tauMs: round3(tauMs),
    },
    values: { V_step: Vstep, R_kohm: R_k, C_uF, N_tau_multiplier: N },
  };
}

// =====================================================================
// Differentiator: V_in → C → V- → R → V_out (V+ to GND)
//   V_out(t) = -RC · dV_in/dt
//   Ramp input V_in = a·t → V_out = -RC·a (constant for t > 0)
// =====================================================================
function buildDifferentiatorRamp(rand: () => number): OpampTimeDomainGeneration {
  const slope = pick([1, 2, 5, 10, 20], rand);   // a (V/ms)
  const R_k = pick(NICE_R_KOHM, rand);
  const C_uF = pick(NICE_CAPACITANCES_UF, rand);

  const R = R_k * 1000;
  const C = C_uF * 1e-6;
  const tauMs = R_k * C_uF;

  // a: 단위는 V/ms → 1000·V/s. dV_in/dt (SI) = 1000·slope.
  const slopeVPerSec = slope * 1000;
  const Vout = round3(-R * C * slopeVPerSec);

  const netlist = assembleViaBT({
    branches: [
      { id: "br_Vs", role: "input_source_leg", orientation: "vertical", fromNode: "Vin", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "Vs" }] },
      { id: "br_C", role: "opamp_input_resistor", orientation: "horizontal", fromNode: "Vin", toNode: "Vminus",
        components: [{ type: "C", role: "input_capacitor", order: 1, required: true, idOverride: "C" }] },
      { id: "br_R", role: "opamp_feedback_resistor", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        components: [{ type: "R", role: "feedback_resistor", order: 1, required: true, idOverride: "R" }] },
      { id: "br_U1", role: "opamp_block", orientation: "horizontal", fromNode: "Vminus", toNode: "Vout",
        opampNodes: { vp: "GND", vn: "Vminus", vo: "Vout" },
        components: [{ type: "OPAMP", role: "opamp", order: 1, required: false, idOverride: "U1" }] },
    ],
    values: [
      { branchId: "br_Vs", componentRole: "voltage_source", type: "V", value: `${slope}·t V (ramp)` },
      { branchId: "br_C", componentRole: "input_capacitor", type: "C", value: `${C_uF}μF` },
      { branchId: "br_R", componentRole: "feedback_resistor", type: "R", value: `${R_k}kΩ` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "Vin", label: "V_in", style: "label_only" },
        { node: "Vout", label: "V_out", style: "label_only" },
      ],
      measurementMarks: [{ kind: "voltage", refs: ["Vout", "GND"], label: "V_out" }],
    },
  });

  // Waveform — 입력 ramp + 출력 constant
  const tEndMs = 10;
  const inputSamples = [
    { t: 0, v: 0 },
    { t: tEndMs, v: slope * tEndMs },
  ];
  const outputSamples = [
    { t: 0, v: 0 },         // t=0+에서 jump
    { t: 0.001, v: Vout },
    { t: tEndMs, v: Vout },
  ];
  const waveformDiagram: WaveformDiagram = {
    signals: [
      { name: "V_in", samples: inputSamples },
      { name: "V_out", samples: outputSamples },
    ],
    unit: { time: "ms", value: "V" },
  };

  return {
    netlist,
    waveformDiagram,
    archetype: "differentiator_ramp",
    answer: {
      Vout,
      tauMs: round3(tauMs),
    },
    values: { slope_V_per_ms: slope, R_kohm: R_k, C_uF },
  };
}
