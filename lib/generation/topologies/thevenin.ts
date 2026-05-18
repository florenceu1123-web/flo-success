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

export type TheveninArchetype =
  | "voltage_divider"
  | "vi_two_source"
  | "vd_cccs"          // 종속 전원 + a/b vertical pair (a 위, b 아래)
  | "vd_cccs_swap"     // 종속 전원 + a/b vertical pair (a 아래, b 위)
  | "vd_cccs_h"        // 종속 전원 + a/b horizontal pair (a 좌, b 우)
  | "vd_cccs_h_swap";  // 종속 전원 + a/b horizontal pair (a 우, b 좌)

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
    case "voltage_divider":  return buildVoltageDivider(rand);
    case "vi_two_source":    return buildVITwoSource(rand);
    case "vd_cccs":          return buildVdCccs(rand, false);
    case "vd_cccs_swap":     return buildVdCccs(rand, true);
    case "vd_cccs_h":        return buildVdCccsHorizontal(rand, false);
    case "vd_cccs_h_swap":   return buildVdCccsHorizontal(rand, true);
  }
}

function chooseArchetype(
  params: CircuitTypeParams | undefined,
  rand: () => number,
): TheveninArchetype {
  // 종속 전원 동반 → vertical / horizontal 두 축으로 독립 분포 결정 (4가지 layout 균등).
  //  · 두 rand 호출로 r1, r2 decorrelate → 시드 영향 받아도 한 쪽으로 편향되지 않게.
  if (params?.hasDependentSource) {
    const r1 = rand();
    const r2 = rand();
    const isHorizontal = r1 < 0.5;
    const swap = r2 < 0.5;
    return isHorizontal
      ? (swap ? "vd_cccs_h_swap" : "vd_cccs_h")
      : (swap ? "vd_cccs_swap" : "vd_cccs");
  }
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

// =====================================================================
// Archetype 3: V + R + (CCCS) — 독립 전압원 + R1(상위 rail) + R2(수직) + CCCS(수직) + R3(상위 rail) + 단자 a
//
//        V1+ ── R1 ── ●mesh ── R3 ── ● a (terminal A)
//                     │           │
//                     R2          (외부 R_L)
//                     │           │
//        V1- ─────── ●GND ────── ● b = GND (terminal B)
//                     │
//                    CCCS (β·i, i = R1 통과 전류, mesh → GND 방향)
//
// 제어 변수 i = (V_top - V_mesh) / R1.
// 종속 전류원 I_dep = β·i (CCCS).
// MNA에는 등가 VCCS로 변환: g_eff = β / R1, control nodes = (top, mesh).
// =====================================================================
function buildVdCccs(rand: () => number, swapTerminals = false): TheveninGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  let R2 = pick(NICE_RESISTORS, rand);
  if (R2 === R1) R2 = pick(NICE_RESISTORS, rand);
  let R3 = pick(NICE_RESISTORS, rand);
  if (R3 === R1 || R3 === R2) R3 = pick(NICE_RESISTORS, rand);
  const beta = pick([2, 3, 4], rand);
  // swap이면 a, b 단자 라벨만 교체 (회로 구조·풀이값은 동일, 단자 표기만 거울)
  const labelA = swapTerminals ? "b" : "a";
  const labelB = swapTerminals ? "a" : "b";

  // a, b를 우측 vertical pair로 평행 배치 — b는 별도 노드, bottom_return wire로 GND와 연결.
  // R2를 a→b 사이 vertical에 두어 a, b 둘 다 degree=2 보장.
  const solverNet: SolverNetwork = {
    nodeIds: ["top", "mesh", "a", "b"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top",  b: "mesh", R: R1 },
      { id: "R3", a: "mesh", b: "a",    R: R3 },
      { id: "R2", a: "a",    b: "b",    R: R2 },
      // b ↔ GND를 매우 작은 저항으로 묶어 solver에선 동일 노드처럼 작동 (b는 회로의 ground rail).
      { id: "WIRE_b_gnd", a: "b", b: "GND", R: 1e-9 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [],
    vccs: [
      // I_dep (mesh → GND) = (β/R1) · (V(top) - V(mesh))
      { id: "G_cccs", a: "mesh", b: "GND", vca: "top", vcb: "mesh", g: beta / R1 },
    ],
  };

  const netlist = assembleViaBT({
    branches: [
      { id: "br_V1", role: "left_source_leg", orientation: "vertical", fromNode: "top", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V1" }] },
      { id: "br_R1", role: "top_rail", orientation: "horizontal", fromNode: "top", toNode: "mesh",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_cccs", role: "dependent_source_leg", orientation: "vertical", fromNode: "mesh", toNode: "GND",
        components: [{ type: "CCCS", role: "dep_current_source", order: 1, required: true, idOverride: "F_dep" }] },
      { id: "br_R3", role: "top_rail", orientation: "horizontal", fromNode: "mesh", toNode: "a",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R3" }] },
      { id: "br_R2", role: "load_leg", orientation: "vertical", fromNode: "a", toNode: "b",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R2" }] },
      { id: "br_bottom", role: "bottom_return", orientation: "horizontal", fromNode: "b", toNode: "GND",
        components: [{ type: "WIRE", role: "ground_wire", order: 1, required: true, idOverride: "WIRE_b" }] },
    ],
    values: [
      { branchId: "br_V1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1}Ω` },
      { branchId: "br_cccs", componentRole: "dep_current_source", type: "CCCS", value: `${beta}·i` },
      { branchId: "br_R3", componentRole: "resistor", type: "R", value: `${R3}Ω` },
      { branchId: "br_R2", componentRole: "resistor", type: "R", value: `${R2}Ω` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "a", label: labelA, style: "terminal_dot" },
        { node: "b", label: labelB, style: "terminal_dot" },
      ],
      measurementMarks: [
        { kind: "current", refs: ["R1"], label: "i" },
      ],
    },
  });

  const { Vth, Rth } = solveThevenin({ net: solverNet, terminalA: "a", terminalB: "b" });
  return {
    netlist, solverNet, terminalA: "a", terminalB: "b",
    answer: { Vth: round3(Vth), Rth: round3(Rth) },
    archetype: swapTerminals ? "vd_cccs_swap" : "vd_cccs",
    values: { V1, R1, R2, R3, beta },
  };
}

// =====================================================================
// Archetype 4: V + R + CCCS — horizontal pair (a, b가 회로 우측에 수평 배치)
//
//   V1+ ── R1 ── ●mesh ── R3 ── ●a ── R2 ── ●b (terminal pair on top rail)
//                │                              │
//               CCCS                           (R_L placeholder, horizontal)
//                │                              │
//                GND ─────── (return rail) ── GND
//
// vd_cccs와 같은 회로 구조이지만 R2를 top rail의 horizontal segment로 두어
// a, b 단자가 같은 y에 위치 → R_L placeholder가 수평 외부 부하.
// =====================================================================
function buildVdCccsHorizontal(rand: () => number, swapTerminals = false): TheveninGeneration {
  const V1 = pick(NICE_VOLTAGES, rand);
  const R1 = pick(NICE_RESISTORS, rand);
  let R2 = pick(NICE_RESISTORS, rand);
  if (R2 === R1) R2 = pick(NICE_RESISTORS, rand);
  let R3 = pick(NICE_RESISTORS, rand);
  if (R3 === R1 || R3 === R2) R3 = pick(NICE_RESISTORS, rand);
  const beta = pick([2, 3, 4], rand);
  const labelA = swapTerminals ? "b" : "a";
  const labelB = swapTerminals ? "a" : "b";
  // R2/R3 위치 무작위 swap — R_L에 인접한 저항이 R2일 수도, R3일 수도.
  // 좌측(mesh→a) 위치와 우측(a→b) 위치에 R3/R2 중 어느 쪽을 둘지 결정.
  const swapR23 = rand() < 0.5;
  const leftR = swapR23 ? R2 : R3;
  const rightR = swapR23 ? R3 : R2;
  const leftId = swapR23 ? "R2" : "R3";
  const rightId = swapR23 ? "R3" : "R2";

  // a, b 모두 top rail에 위치. b는 별도 노드이지만 bottom_return wire로 GND와 동전위.
  const solverNet: SolverNetwork = {
    nodeIds: ["top", "mesh", "a", "b"],
    groundId: "GND",
    resistors: [
      { id: "R1", a: "top",  b: "mesh", R: R1 },
      // 좌측(mesh→a) / 우측(a→b) 저항 위치 swap 가능
      { id: leftId,  a: "mesh", b: "a", R: leftR },
      { id: rightId, a: "a",    b: "b", R: rightR },
      { id: "WIRE_b_gnd", a: "b", b: "GND", R: 1e-9 },
    ],
    vsources: [{ id: "V1", a: "top", b: "GND", V: V1 }],
    isources: [],
    vccs: [
      { id: "G_cccs", a: "mesh", b: "GND", vca: "top", vcb: "mesh", g: beta / R1 },
    ],
  };

  const netlist = assembleViaBT({
    branches: [
      { id: "br_V1", role: "left_source_leg", orientation: "vertical", fromNode: "top", toNode: "GND",
        components: [{ type: "V", role: "voltage_source", order: 1, required: true, idOverride: "V1" }] },
      { id: "br_R1", role: "top_rail", orientation: "horizontal", fromNode: "top", toNode: "mesh",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: "R1" }] },
      { id: "br_cccs", role: "dependent_source_leg", orientation: "vertical", fromNode: "mesh", toNode: "GND",
        components: [{ type: "CCCS", role: "dep_current_source", order: 1, required: true, idOverride: "F_dep" }] },
      // 좌측 R (mesh → a) — leftId가 R2 또는 R3 중 swap된 것
      { id: "br_left", role: "top_rail", orientation: "horizontal", fromNode: "mesh", toNode: "a",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: leftId }] },
      // 우측 R (a → b) — R_L에 인접한 위치
      { id: "br_right", role: "top_rail", orientation: "horizontal", fromNode: "a", toNode: "b",
        components: [{ type: "R", role: "resistor", order: 1, required: true, idOverride: rightId }] },
      { id: "br_bottom", role: "bottom_return", orientation: "horizontal", fromNode: "b", toNode: "GND",
        components: [{ type: "WIRE", role: "ground_wire", order: 1, required: true, idOverride: "WIRE_b" }] },
    ],
    values: [
      { branchId: "br_V1", componentRole: "voltage_source", type: "V", value: `${V1}V` },
      { branchId: "br_R1", componentRole: "resistor", type: "R", value: `${R1}Ω` },
      { branchId: "br_cccs", componentRole: "dep_current_source", type: "CCCS", value: `${beta}·i` },
      { branchId: "br_left",  componentRole: "resistor", type: "R", value: `${leftR}Ω` },
      { branchId: "br_right", componentRole: "resistor", type: "R", value: `${rightR}Ω` },
    ],
    metadata: {
      nodeAnnotations: [
        { node: "a", label: labelA, style: "terminal_dot" },
        { node: "b", label: labelB, style: "terminal_dot" },
      ],
      measurementMarks: [
        { kind: "current", refs: ["R1"], label: "i" },
      ],
    },
  });

  const { Vth, Rth } = solveThevenin({ net: solverNet, terminalA: "a", terminalB: "b" });
  return {
    netlist, solverNet, terminalA: "a", terminalB: "b",
    answer: { Vth: round3(Vth), Rth: round3(Rth) },
    archetype: swapTerminals ? "vd_cccs_h_swap" : "vd_cccs_h",
    values: { V1, R1, R2, R3, beta },
  };
}

