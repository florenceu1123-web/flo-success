import { writeFileSync } from "node:fs";
import { generateBjtBias } from "../lib/generation/topologies/bjtBias.ts";
import { renderBjtCircuit, hasBjt } from "../lib/renderers/bjtCircuitRenderer.ts";

const gen = generateBjtBias({ params: { multiBjtMirror: true, bjtCount: 4 }, seed: 42 });
console.log("kind:", gen.kind);
console.log("values:", JSON.stringify(gen.values));
console.log("answer:", JSON.stringify(gen.answer));
console.log("netlist component types:", gen.netlist.components.map(c => `${c.id}(${c.type})`).join(", "));
console.log("hasBjt:", hasBjt(gen.netlist));
const svg = renderBjtCircuit(gen.netlist);
console.log("svg length:", svg?.length ?? "null");
if (svg) {
  const labels = ["Q1", "Q2", "Q3", "Q5", "R_1", "R_2", "R_3", "V_CC", "V_2", "V_1", "V_o", "I_1", "I_3", "I_5", "mirror", "V_tail", "V_M"];
  for (const l of labels) console.log(`  ${l}:`, svg.includes(`>${l}<`) ? "y" : "n");
  const html = `<!doctype html><meta charset="utf-8"><title>BJT mirror+diff smoke</title>
<style>body{margin:20px;font:14px sans-serif}h1{font-size:16px}pre{background:#f5f5f5;padding:8px;font-size:11px;white-space:pre-wrap}</style>
<h1>BJT 전류미러 + 차동증폭기 (smoke)</h1>
<pre>values: ${JSON.stringify(gen.values, null, 2)}
answer: ${JSON.stringify(gen.answer, null, 2)}</pre>
<div style="border:1px solid #ccc;display:inline-block">${svg}</div>`;
  writeFileSync("scripts/smokeBjtMirrorRender.html", html);
  console.log("\nSVG saved -> scripts/smokeBjtMirrorRender.html");
}
