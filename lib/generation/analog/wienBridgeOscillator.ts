// src/lib/generation/analog/wienBridgeOscillator.ts
//
// Wien Bridge oscillator (임용 11번 형식) — 비반전 OPAMP + RC 망 β(s) feedback.
//   3-단계 풀이: K = 1 + R_3/R_1 → β(s) 표준형 → 1-Kβ(s)=0에서 R_3/R_1 = 2.

import { randomUUID } from "node:crypto";
import type {
  BlockDiagram,
  CircuitNetlist,
  FigureVariant,
  GeneratedProblem,
} from "@/types";
import type { AnalogAnalysis } from "./generateCircuit";

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

  // ── (가) Wien Bridge 회로 ──
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
      // 음피드백 — V− → GND R_1
      {
        id: "R_1", type: "R", value: `${R1_kohm}kΩ`,
        pins: [
          { id: "p1", node: "Vminus", side: "top" },
          { id: "p2", node: "GND",    side: "bottom" },
        ],
      },
      // 음피드백 — V_out → V− R_3 (단일 2-pin: validator U1 통과 보장)
      {
        id: "R_3", type: "R", value: `${R3_kohm}kΩ`,
        pins: [
          { id: "p1", node: "Vminus", side: "left" },
          { id: "p2", node: "Vout",   side: "right" },
        ],
      },
      // 양피드백 RC 망 Z_1: Vout → R_a → midZ1 → C_a → Vplus (R+C 직렬)
      {
        id: "R_a", type: "R", value: `${R_kohm}kΩ`,
        pins: [
          { id: "p1", node: "Vout",  side: "left" },
          { id: "p2", node: "midZ1", side: "right" },
        ],
      },
      {
        id: "C_a", type: "C", value: `${C_nF}nF`,
        pins: [
          { id: "p1", node: "midZ1", side: "left" },
          { id: "p2", node: "Vplus", side: "right" },
        ],
      },
      // 양피드백 RC 망 Z_2: Vplus → R_b ∥ C_b → GND (R∥C)
      {
        id: "R_b", type: "R", value: `${R_kohm}kΩ`,
        pins: [
          { id: "p1", node: "Vplus", side: "top" },
          { id: "p2", node: "GND",   side: "bottom" },
        ],
      },
      {
        id: "C_b", type: "C", value: `${C_nF}nF`,
        pins: [
          { id: "p1", node: "Vplus", side: "top" },
          { id: "p2", node: "GND",   side: "bottom" },
        ],
      },
    ],
    nodeAnnotations: [
      { node: "Vminus", label: "V−",  style: "label_only" },
      { node: "Vplus",  label: "V+",  style: "label_only" },
      { node: "Vout",   label: "V_o", style: "label_only" },
    ],
    measurementMarks: [{ kind: "voltage", refs: ["Vout", "GND"], label: "V_o" }],
    positions: {
      Vminus: { x: 220, y: 200 },
      Vplus:  { x: 220, y: 360 },
      Vout:   { x: 540, y: 280 },
      midZ1:  { x: 540, y: 460 },
      U1:     { x: 360, y: 280 },
      GND:    { x: 360, y: 600 },
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
