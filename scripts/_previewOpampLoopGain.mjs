// 시각 검증용 — (가)/(나) SVG를 HTML로 덤프.
//   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_previewOpampLoopGain.mjs <out.html> [mode]
import { writeFileSync } from "node:fs";
import { generateOpampLoopGainStability } from "../lib/generation/topologies/opampLoopGainStability.ts";
import { renderOpampLoopGainStabilityCircuit } from "../lib/renderers/opampLoopGainStabilityCircuitRenderer.ts";

const out = process.argv[2];
const mode = process.argv[3] ?? "exam_similar";
const g = generateOpampLoopGainStability({ seed: 4, mode });
const head = `<h3 style="font:600 14px sans-serif">${mode} — R_a=${g.labels.ra}, R_f=${g.labels.rf}, R_p=${g.labels.rp} → ${g.answer.ineqText}</h3>`;
writeFileSync(out,
  `<html><body style="background:#fff;margin:0;padding:12px">${head}` +
  `<div style="width:660px">${renderOpampLoopGainStabilityCircuit(g.circuitA)}</div>` +
  `<div style="width:660px">${renderOpampLoopGainStabilityCircuit(g.circuitB)}</div></body></html>`, "utf8");
console.log("written:", out, "|", g.answer.ineqText);
