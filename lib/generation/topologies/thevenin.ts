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
import {
  DEFAULT_BRANCH_RULES,
  assembleNetlist,
  instantiateAnalogTemplate,
  validateBranchTemplate,
  type AnalogValueAssignment,
  type BranchTemplate,
} from "@/lib/generation/branchTemplate";
import { createLogger } from "@/lib/logger";

const tlog = createLogger("lib/generation/topologies/thevenin");

/** thevenin 헬퍼 — BranchTemplate path 표준. */
function assembleViaBT(args: {
  branches: BranchTemplate[];
  values: AnalogValueAssignment[];
  metadata?: Pick<CircuitNetlist, "nodeAnnotations" | "measurementMarks" | "positions">;
}): CircuitNetlist {
  const enriched = args.branches.map((b) => ({ ...b, rules: b.rules ?? DEFAULT_BRANCH_RULES[b.role] }));
  const validation = validateBranchTemplate(enriched);
  if (!validation.ok) tlog.warn("branch_template_violation", { issues: validation.issues });
  const inst = instantiateAnalogTemplate(enriched, args.values);
  return { ...assembleNetlist(inst, "GND"), ...args.metadata };
}

/**
 * Thevenin 등가회로 문제 generator.
 *
 *  - 입력: CircuitTypeParams (R/V/I 개수 권장값 등)
 *  - 출력: 단자 a-b가 명시된 회로 netlist + 정답 (V_th, R_th)
 *
 *  현 phase: 2가지 archetype 지원.
 *   - "voltage_divider": V1 + R1 + R2 (가장 단순). 3소자.
 *   - "vi_two_source":   V1 + I1 + R1 + R2 + R3. 5소자.
 *
 *  exam_similar 모드: archetype은 원본과 같은 걸로 고정, 값만 새로 picking.
 *  exam_variant 모드: archetype을 다른 것으로 변형 가능.
 */

export type TheveninArchetype = "voltage_divider" | "vi_two_source";

export type TheveninGeneration = {
  /** SVG/렌더 가능한 netlist (UI용) */
  netlist: CircuitNetlist;
  /** Solver-friendly 표현 (검증·답 계산용) */
  solverNet: SolverNetwork;
  /** 단자 식별자 (정답 계산 기준) */
  terminalA: string;
  terminalB: string;
  /** 정답 */
  answer: {
    Vth: number;
    Rth: number;
  };
  /** 사용한 archetype */
  archetype: TheveninArchetype;
  /** 사용한 소자 값 (해설에 사용) */
  values: Record<string, number>;
};

export function generateThevenin(args: {
  params?: CircuitTypeParams;
  archetype?: TheveninArchetype;
  seed?: number;
}): TheveninGeneration {
  const rand = makeRand(args.seed);
  const archetype: TheveninArchetype = args.archetype
    ?? chooseArchetype(args.params, rand);

  switch (archetype) {
    case "voltage_divider": return buildVoltageDivider(rand);
    case "vi_two_source":   return buildVITwoSource(rand);
  }
}

function chooseArchetype(
  params: CircuitTypeParams | undefined,
  rand: () => number,
): TheveninArchetype {
  // params.resistorCount 등으로 archetype 권장
  const rCount = params?.resistorCount ?? 0;
  const iCount = params?.iSourceCount ?? 0;
  if (rCount >= 3 || iCount >= 1) return "vi_two_source";
  // default
  return rand() < 0.5 ? "voltage_divider" : "vi_two_source";
}

// =====================================================================
// Archetype 1: Voltage divider
//   V1 ── R1 ──● a (terminal A)
//              │
//              R2
//              │
//              ● b = GND (terminal B)
// =====================================================================
function buildVoltageDivider(rand: () => number): TheveninGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  let R2 = pick(NICE_RESISTORS, rand);
  // R2가 R1과 같으면 한 번 더 뽑아 다양성 확보
  if (R2 === R1) R2 = pick(NICE_RESISTORS, rand);

  // Solver-friendly
  const solverNet: SolverNetwork = {
    nodeIds: ["top", "a"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "a", R: R1 },
      { id: "R2", a: "a",   b: "GND", R: R2 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [],
  };

  const netlist = assembleViaBT({
    branches: [
      { id: "br_V1", role: "left_source_leg", orientation: "vertical", fromNode: "top", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V1" }] },
      { id: "br_R1", role: "top_rail", orientation: "horizontal", fromNode: "top", toNode: "a",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_R2", role: "load_leg", orientation: "vertical", fromNode: "a", toNode: "GND",
        components: [{ type: "R", role: "load_resistor", order: 1, required: true, idOverride: "R2" }] },
    ],
    values: [
      { branchId: "br_V1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1}Ω` },
      { branchId: "br_R2", componentRole: "load_resistor", type: "R", value: `${R2}Ω` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "a", label: "a", style: "terminal_dot" },
        { node: "GND", label: "b", style: "terminal_dot" },
      ],
    },
  });

  const { Vth, Rth } = solveThevenin({ net: solverNet, terminalA: "a", terminalB: "GND" });
  return {
    netlist, solverNet, terminalA: "a", terminalB: "GND",
    answer: { Vth: round3(Vth), Rth: round3(Rth) },
    archetype: "voltage_divider",
    values: { V1, R1, R2 },
  };
}

// =====================================================================
// Archetype 2: V + I + 3R 네트워크
//        ● top1 ─R1─ ● a
//          │           │
//         V1          R2
//          │           │
//         GND         GND
//                  ↑ I1: GND→a (단자 a로 1A 주입)
// (R3은 top1과 a를 추가 연결하는 보조 경로로 사용)
// =====================================================================
function buildVITwoSource(rand: () => number): TheveninGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const I1 = pick(NICE_CURRENTS, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  const R2 = pick(NICE_RESISTORS, rand);
  const R3 = pick(NICE_RESISTORS, rand);

  // top─R1─a (직렬 path 1)
  // top─R3─a (병렬 path)
  // a─R2─GND
  // V1: top─GND
  // I1: GND→a (a로 I1 주입)
  const solverNet: SolverNetwork = {
    nodeIds: ["top", "a"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top", b: "a",   R: R1 },
      { id: "R2", a: "a",   b: "GND", R: R2 },
      { id: "R3", a: "top", b: "a",   R: R3 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [{ id: "I1", a: "GND", b: "a",   I: I1 }],
  };

  const netlist = assembleViaBT({
    branches: [
      { id: "br_V1", role: "left_source_leg", orientation: "vertical", fromNode: "top", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V1" }] },
      { id: "br_R1", role: "top_rail", orientation: "horizontal", fromNode: "top", toNode: "a",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_R3", role: "top_rail", orientation: "horizontal", fromNode: "top", toNode: "a",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R3" }] },
      { id: "br_R2", role: "load_leg", orientation: "vertical", fromNode: "a", toNode: "GND",
        components: [{ type: "R", role: "load_resistor", order: 1, required: true, idOverride: "R2" }] },
      { id: "br_I1", role: "load_leg", orientation: "vertical", fromNode: "a", toNode: "GND",
        components: [{ type: "I", role: "current_source", order: 1, required: true, idOverride: "I1" }] },
    ],
    values: [
      { branchId: "br_V1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1}Ω` },
      { branchId: "br_R3", componentRole: "resistor", type: "R", value: `${R3}Ω` },
      { branchId: "br_R2", componentRole: "load_resistor", type: "R", value: `${R2}Ω` },
      { branchId: "br_I1", componentRole: "current_source", type: "I", value: `${I1}A` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "a", label: "a", style: "terminal_dot" },
        { node: "GND", label: "b", style: "terminal_dot" },
      ],
    },
  });

  const { Vth, Rth } = solveThevenin({ net: solverNet, terminalA: "a", terminalB: "GND" });
  return {
    netlist, solverNet, terminalA: "a", terminalB: "GND",
    answer: { Vth: round3(Vth), Rth: round3(Rth) },
    archetype: "vi_two_source",
    values: { V1, I1, R1, R2, R3 },
  };
}

