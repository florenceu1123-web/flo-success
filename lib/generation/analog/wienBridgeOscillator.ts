// src/lib/generation/analog/wienBridgeOscillator.ts
//
// Wien Bridge oscillator (임용 11번 형식) — 비반전 OPAMP + RC 망 β(s) feedback.
//   3-단계 풀이: K = 1 + R_3/R_1 → β(s) 표준형 → 1-Kβ(s)=0에서 R_3/R_1 = 2.

import { randomUUID } from "node:crypto";
import type {
  BlockDiagram,
  CircuitComponent,
  CircuitNetlist,
  FigureVariant,
  GeneratedProblem,
  PinSide,
} from "@/types";
import type { AnalogAnalysis } from "./generateCircuit";
import { buildWienBridgeSubgraph } from "@/lib/analog/subcircuit/wienBridge";

/** Wien Bridge 표준 component 값 — 일정 (deterministic). variant 모드는 향후 추가. */
const VALUES = {
  R_kohm: 10,    // RC 망 공통 저항 R
  C_nF: 16,      // RC 망 공통 캡 C  (ω_0 = 1/(RC) ≈ 6250 rad/s, f_0 ≈ 994 Hz)
  R1_kohm: 10,   // V− → GND 저항
  R3_kohm: 20,   // V− → V_out 음피드백 저항 (R_3/R_1 = 2 → K = 3)
};

/**
 * Wien Bridge oscillator 문제 생성.
 *   (가) Wien Bridge 회로 (analog_netlist),
 *   (나) 피드백 블록도 (block_diagram),
 *   3-단계 풀이 (K · β(s) · R_3/R_1).
 */
export function generateWienBridgeOscillator(_a: AnalogAnalysis): GeneratedProblem {
  const { R_kohm, C_nF, R1_kohm, R3_kohm } = VALUES;
  const R_ohm = R_kohm * 1000;
  const C_F = C_nF * 1e-9;
  const omega_0 = 1 / (R_ohm * C_F);   // rad/s
  const f_0 = omega_0 / (2 * Math.PI); // Hz
  const K = 1 + R3_kohm / R1_kohm;     // = 3 by design
  const R3_R1_ratio = R3_kohm / R1_kohm; // = 2

  // ── (가) Wien Bridge 회로 — subcircuit expansion 방식 ──
  //
  //   canonical 구조:
  //     V+ (양피드백) = frequency-selective positive feedback (RC bridge β(s))
  //     V− (음피드백) = resistive negative feedback (R_1·R_3 분배기 → K = 1 + R_3/R_1)
  //
  //   V+ path는 buildWienBridgeSubgraph()의 template subgraph로 정확히 생성.
  //   V− path는 R_1·R_3 두 R로 직접 구성. OPAMP를 두 path가 만나는 hub로 사용.

  // V+ path subcircuit expansion — buildWienBridgeSubgraph → CircuitComponent[].
  //   subgraph 노드명을 회로 노드명으로 mapping (WienMid → n_Z1).
  //   subgraph 컴포넌트 id를 회로 id로 mapping (R1→R_a, C1→C_a, R2→R_b, C2→C_b).
  const wienSubgraph = buildWienBridgeSubgraph();
  const wienNodeMap: Record<string, string> = {
    Vout: "Vout", Vplus: "Vplus", WienMid: "n_Z1", GND: "GND",
  };
  const wienIdMap: Record<string, string> = {
    R1: "R_a", C1: "C_a", R2: "R_b", C2: "C_b",
  };
  // 각 component의 pin side hint — series chain·shunt branch별로 다름.
  const wienPinSides: Record<string, [PinSide, PinSide]> = {
    R_a: ["bottom", "right"],
    C_a: ["left",   "right"],
    R_b: ["bottom", "top"],
    C_b: ["bottom", "top"],
  };
  const wienComponents: CircuitComponent[] = wienSubgraph.components.map((sc) => {
    const id = wienIdMap[sc.id];
    const [side1, side2] = wienPinSides[id];
    return {
      id,
      type: sc.type as CircuitComponent["type"],
      value: sc.type === "R" ? `${R_kohm}kΩ` : `${C_nF}nF`,
      pins: [
        { id: "p1", node: wienNodeMap[sc.between[0]], side: side1 },
        { id: "p2", node: wienNodeMap[sc.between[1]], side: side2 },
      ],
    };
  });
  //
  //   layout: OPAMP를 중심으로 위쪽(V−)에는 저항 분배기, 아래쪽(V+)에는 RC bridge를
  //          분리 배치 → 두 피드백 경로가 시각적으로 구분되도록.
  //
  //   ┌─── R_3 ───────────┐   (V− 음피드백 — 위쪽 rail)
  //   │                    │
  //   V−                   │
  //   │                    │
  //   R_1                OPAMP ── V_o
  //   │                    │
  //   GND                  │
  //   V+                   │
  //   │                    │
  //   R_b∥C_b           Z_1=R_a+C_a (V+ 양피드백 — 아래쪽 rail)
  //   │                    │
  //   GND ─────────────────┘
  const netlist: CircuitNetlist = {
    ground: "GND",
    components: [
      {
        id: "U1", type: "OPAMP",
        pins: [
          { id: "p1", node: "Vplus",  side: "left",  role: "non_inverting" },
          { id: "p2", node: "Vminus", side: "left",  role: "inverting" },
          { id: "p3", node: "Vout",   side: "right", role: "output" },
        ],
      },
      // ── V− 저항 분배기 (음피드백) ──
      // R_1: V− → GND (분배기 ground side)
      {
        id: "R_1", type: "R", value: `${R1_kohm}kΩ`,
        pins: [
          { id: "p1", node: "Vminus", side: "bottom" },
          { id: "p2", node: "GND",    side: "top" },
        ],
      },
      // R_3: V_out → V− (분배기 feedback side) — 단일 2-pin (validator U1 통과)
      {
        id: "R_3", type: "R", value: `${R3_kohm}kΩ`,
        pins: [
          { id: "p1", node: "Vminus", side: "top" },
          { id: "p2", node: "Vout",   side: "top" },
        ],
      },
      // ── V+ RC bridge (양피드백 — frequency-selective) — subcircuit expansion ──
      ...wienComponents,
    ],
    nodeAnnotations: [
      { node: "Vminus", label: "V−",  style: "label_only" },
      { node: "Vplus",  label: "V+",  style: "label_only" },
      { node: "Vout",   label: "V_o", style: "label_only" },
    ],
    measurementMarks: [{ kind: "voltage", refs: ["Vout", "GND"], label: "V_o" }],
    positions: {
      // 노드 좌표 — OPAMP 중심으로 V− 위·V+ 아래로 분리.
      Vminus: { x: 240, y: 200 },
      Vplus:  { x: 240, y: 420 },
      Vout:   { x: 620, y: 310 },
      n_Z1:   { x: 440, y: 500 },
      U1:     { x: 420, y: 310 },
      GND:    { x: 240, y: 600 },
      // 컴포넌트 좌표 — 노드 사이에 배치.
      R_1: { x: 240, y: 300 },   // V− → GND 수직
      R_3: { x: 430, y: 140 },   // V− → V_out 상단 수평
      R_a: { x: 540, y: 500 },   // V_out → n_Z1 (V_out 아래로 내려 좌측으로)
      C_a: { x: 340, y: 500 },   // n_Z1 → V+ 하단 수평
      R_b: { x: 200, y: 510 },   // V+ → GND 수직 (좌)
      C_b: { x: 280, y: 510 },   // V+ → GND 수직 (우, R_b 옆)
    },
  };

  // ── (나) 블록도 ──
  const blockDiagram: BlockDiagram = {
    nodes: [
      { id: "Vminus_term", kind: "input",  label: "V^-", x: 60,  y: 200 },
      { id: "Vo_term",     kind: "output", label: "V_o", x: 560, y: 200 },
    ],
    blocks: [
      { id: "K_block",    label: "증폭기 (K)", shape: "triangle", x: 220, y: 170, width: 120, height: 60 },
      { id: "beta_block", label: "β(s)",       shape: "rect",     x: 320, y: 320, width: 120, height: 50 },
    ],
    edges: [
      { from: "Vminus_term", to: "K_block",    routeHint: "direct" },
      { from: "K_block",     to: "Vo_term",    routeHint: "direct" },
      { from: "Vo_term",     to: "beta_block", routeHint: "below" },
      { from: "beta_block",  to: "Vminus_term", routeHint: "below" },
    ],
  };

  const figureVariants: FigureVariant[] = [
    {
      id: "fig_circuit",
      label: "(가) Wien Bridge 회로",
      role: "original_circuit",
      diagramType: "analog_netlist",
      diagram: netlist,
    },
    {
      id: "fig_block",
      label: "(나) 피드백 블록도",
      role: "equivalent_circuit",
      diagramType: "block_diagram",
      diagram: blockDiagram,
    },
  ];

  // ── 텍스트 ──
  const content =
    `그림 (가)는 비반전 연산증폭기와 RC 회로망을 이용해 구성한 사인파 발진회로이며, ` +
    `그림 (나)는 (가)의 블록도이다. 회로에서 사인파 발진이 일어나기 위한 조건을 구하려고 한다. ` +
    `(단, 연산증폭기는 안정한 선형영역에서 동작하며, 입력 임피던스는 무한대·출력 임피던스는 영(0)이다.)`;

  const conditions = [
    `R = ${R_kohm} kΩ, C = ${C_nF} nF (양쪽 RC 망 동일)`,
    `R_1 = ${R1_kohm} kΩ, R_3 = ${R3_kohm} kΩ (음피드백)`,
    `ω_0 = 1/(RC) (정규화 각주파수)`,
  ];

  const question =
    `[단계 1] (가)의 증폭기에서 V^- = V^+ 관계를 이용하여 전압이득 K = V_o/V^- 를 R_1과 R_3로 구한다.\n` +
    `[단계 2] (가)와 (나)에서 V^-/V_o = β(s)로 둘 때, β(s)의 표준형 ` +
    `β(s) = sω_0/(s² + b·sω_0 + ω_0²)의 b 값을 구한다.\n` +
    `[단계 3] [단계 1]의 K와 [단계 2]의 β(s)를 이용하여 특성방정식 1 - K·β(s) = 0에서 ` +
    `발진이 일어나기 위한 R_3/R_1을 구한다.`;

  const answer =
    `[단계 1] K = 1 + R_3/R_1\n` +
    `[단계 2] b = 3 (즉 β(s) = sω_0/(s² + 3sω_0 + ω_0²))\n` +
    `[단계 3] R_3/R_1 = ${R3_R1_ratio} (즉 K = 3)`;

  const solution =
    `[단계 1] 비반전 증폭기 가상단락 V^- = V^+. V^- 분배: V^- = V_o · R_1/(R_1 + R_3). ` +
    `따라서 K = V_o/V^- = (R_1 + R_3)/R_1 = 1 + R_3/R_1.\n` +
    `[단계 2] Z_1 = R + 1/(sC) = (sRC + 1)/(sC), Z_2 = R ∥ 1/(sC) = R/(sRC + 1). ` +
    `β(s) = Z_2/(Z_1 + Z_2) = sRC / (s²R²C² + 3sRC + 1). ω_0 = 1/(RC)로 정규화하면 ` +
    `β(s) = sω_0/(s² + 3sω_0 + ω_0²). 따라서 b = 3.\n` +
    `[단계 3] 1 - K·β(s) = 0 → s² + (3 - K)·sω_0 + ω_0² = 0. ` +
    `발진(허수축 근) 조건은 1차 항 계수 = 0 → K = 3. ` +
    `K = 1 + R_3/R_1 = 3이므로 R_3/R_1 = 2. ` +
    `이때 발진 주파수는 ω = ω_0 = 1/(RC) ≈ ${omega_0.toFixed(0)} rad/s (f ≈ ${f_0.toFixed(0)} Hz).`;

  return {
    id: randomUUID(),
    content,
    conditions,
    question,
    answer,
    solution,
    topicKey: "opamp",
    semantic: {
      hasStateTransition: false,
      hasEquivalentTransformation: false,
      hasWaveformEvolution: false,  // symbolic 분석 — 파형 그리지 않음
      requiresMultiFigure: true,    // (가) + (나)
    },
    figureVariants,
  };
}
