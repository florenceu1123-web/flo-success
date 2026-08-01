import { writeFileSync } from "node:fs";
import { generateTheveninDepVoltage, writeTheveninDepVoltageText } from "@/lib/generation/topologies/theveninDepVoltage";
import { renderTheveninDepVoltageCircuit } from "@/lib/renderers/theveninDepVoltageCircuitRenderer";

const out = process.argv[2] ?? "tdv.html";
const blocks: string[] = [];
for (const seed of [1, 2, 3]) {
  const gen = generateTheveninDepVoltage({ seed });
  const text = writeTheveninDepVoltageText({ generation: gen });
  const ga = renderTheveninDepVoltageCircuit(gen.gaNetlist);
  const na = renderTheveninDepVoltageCircuit(gen.naNetlist);
  blocks.push(
    `<div style="border:1px solid #ccc;margin:12px;padding:8px">` +
      `<div style="font:13px sans-serif;color:#1e3a8a">seed ${seed} — Vs=${gen.values.Vs} R1=${gen.values.R1} Rx=${gen.values.Rx} k=${gen.values.k} RL=${gen.values.RL} ` +
      `| R_TH=${gen.solution.rth} V_TH=${gen.solution.vth} I_L=${gen.solution.iL} V_L=${gen.solution.vL}</div>` +
      `<div style="display:flex">${ga ?? "GA NULL"}${na ?? "NA NULL"}</div>` +
      `<pre style="font:11px monospace;white-space:pre-wrap">${text.answer}</pre>` +
      `</div>`,
  );
}
writeFileSync(out, `<html><body style="background:#fff">${blocks.join("\n")}</body></html>`);
console.log("wrote", out);
