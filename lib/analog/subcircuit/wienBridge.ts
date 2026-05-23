// src/lib/analog/subcircuit/wienBridge.ts
//
// Wien Bridge RC 망 subcircuit template builder.
//   archetype → subcircuit template → expand → component graph → routing.
//
//   topology:
//     Vout ─── R1 ── WienMid ── C1 ── Vplus    (series Z_1)
//                                      │
//                                      ├── R2 ── GND   (shunt R)
//                                      │
//                                      └── C2 ── GND   (shunt C, parallel to R2)
//
//   이 template은 Wien Bridge oscillator의 V+ 양피드백 path (frequency-selective).
//   음피드백 R_1·R_3 분배기는 별개 — 이 subgraph에 포함하지 않는다.

import type { SubcircuitTemplate } from "./types";

export function buildWienBridgeSubgraph(): SubcircuitTemplate {
  return {
    nodes: ["Vout", "Vplus", "WienMid", "GND"],

    components: [
      // series RC (Z_1 = R + 1/sC)
      {
        type: "R",
        id: "R1",
        between: ["Vout", "WienMid"],
      },
      {
        type: "C",
        id: "C1",
        between: ["WienMid", "Vplus"],
      },

      // shunt RC (Z_2 = R ∥ 1/sC)
      {
        type: "R",
        id: "R2",
        between: ["Vplus", "GND"],
      },
      {
        type: "C",
        id: "C2",
        between: ["Vplus", "GND"],
      },
    ],
  };
}
