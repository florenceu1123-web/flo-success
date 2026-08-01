import { writeFileSync } from "node:fs";
import { generateSwitchedRlDepI } from "@/lib/generation/topologies/switchedRlDepI";
import { renderSwitchedRlDepICircuit } from "@/lib/renderers/switchedRlDepICircuitRenderer";

const out = process.argv[2] ?? "srdi.html";
const seeds = [1, 2, 3];
const blocks: string[] = [];
for (const seed of seeds) {
  const gen = generateSwitchedRlDepI({ seed });
  const svg = renderSwitchedRlDepICircuit(gen.netlist);
  blocks.push(
    `<div style="border:1px solid #ccc;margin:12px;padding:8px">` +
      `<div style="font:13px sans-serif;color:#1e3a8a">seed ${seed} — Vs=${gen.values.Vs} R1=${gen.values.R1} Rr=${gen.values.Rr} k=${gen.values.k} L=${gen.values.L} ` +
      `| i_L(0⁻)=${gen.solution.iL0} i_R(∞)=${gen.solution.iRinf} τ=${gen.solution.tau}</div>` +
      (svg ?? "<pre>RENDER NULL</pre>") +
      `</div>`,
  );
}
writeFileSync(out, `<html><body style="background:#fff">${blocks.join("\n")}</body></html>`);
console.log("wrote", out);
