import { writeFileSync } from "node:fs";
import { renderSupermeshSwitchedDependentCircuit } from "../lib/renderers/supermeshSwitchedDependentCircuitRenderer.ts";
const mk = (swState) => ({
  swState, vsLabel: "10V", r1Label: "10Ω", r2Label: "10Ω", r3Label: "10Ω", r4Label: "10Ω",
  depLabel: "0.2V₂", isLabel: "1A", v1Label: "V₁", v2Label: "V₂", showSupermesh: swState === "closed",
});
const html =
  `<body style="font-family:sans-serif;background:#fff">` +
  `<h3>(가) SW 열림</h3>${renderSupermeshSwitchedDependentCircuit(mk("open"))}` +
  `<h3>(나) SW 닫힘 — 초메쉬 a</h3>${renderSupermeshSwitchedDependentCircuit(mk("closed"))}</body>`;
writeFileSync(process.argv[2], html);
console.log("OK →", process.argv[2]);
