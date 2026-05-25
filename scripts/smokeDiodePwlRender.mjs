import { writeFileSync } from "node:fs";
import { hasDiodePwl, renderDiodePwlCircuit } from "../lib/renderers/diodePwlCircuitRenderer.ts";

// 임용 6번 형식 sample netlist
const netlist = {
  components: [
    { id: "V_i", type: "V", value: "v_i(t)", pins: [
      { id: "p", node: "n_vi", side: "top" },
      { id: "n", node: "GND", side: "bottom" },
    ]},
    { id: "V_CC", type: "V", value: "15V", pins: [
      { id: "p", node: "n_vcc", side: "top" },
      { id: "n", node: "GND", side: "bottom" },
    ]},
    { id: "SW", type: "SW", value: "단자1↔2", pins: [
      { id: "p", node: "n_vi", side: "left" },
      { id: "n", node: "n_sw", side: "right" },
    ]},
    { id: "C", type: "C", value: "C", pins: [
      { id: "p", node: "n_sw", side: "left" },
      { id: "n", node: "n_clamp", side: "right" },
    ]},
    { id: "D_1", type: "D", pins: [
      { id: "anode", node: "n_clamp", side: "bottom" },
      { id: "cathode", node: "n_vcc", side: "top" },
    ]},
    { id: "D_2", type: "D", pins: [
      { id: "anode", node: "GND", side: "bottom" },
      { id: "cathode", node: "n_clamp", side: "top" },
    ]},
    { id: "R_L", type: "R", value: "R_L", pins: [
      { id: "p", node: "n_clamp", side: "top" },
      { id: "n", node: "GND", side: "bottom" },
    ]},
  ],
  ground: "GND",
};

const detector = hasDiodePwl(netlist);
console.log("hasDiodePwl:", detector);

const svg = renderDiodePwlCircuit(netlist);
console.log("svg length:", svg?.length ?? "null");

// HTML 무조건 저장 (시각 검증용)
const html = `<!doctype html><meta charset="utf-8"><title>Diode PWL smoke</title>
<style>body{margin:20px;font:14px sans-serif}h1{font-size:16px}</style>
<h1>임용 6번 형식 — SW + 다이오드 + AC + C 클램프</h1>
<div style="border:1px solid #ccc;display:inline-block">${svg ?? "(svg null)"}</div>`;
writeFileSync("scripts/smokeDiodePwlRender.html", html);
console.log("SVG saved -> scripts/smokeDiodePwlRender.html");

// 라벨 체크 (informational only)
if (svg) {
  const labels = ["v_i(t)", "단자1", "단자2", "D_1", "D_2", "R_L", "V_o(t)", "15V", "단자1↔2"];
  console.log("Label presence:");
  for (const l of labels) {
    console.log(`  ${l}:`, svg.includes(`>${l}<`) ? "y" : "n");
  }
}

if (!detector) {
  console.log("FAIL — hasDiodePwl should detect (D=2, SW=1, C=1)");
  process.exit(1);
}
if (!svg) {
  console.log("FAIL — renderer returned null");
  process.exit(1);
}
console.log("\nPASS — detector + renderer functional. HTML 시각 검증 가능.");
