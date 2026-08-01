// 시각 검증용 — 전용 렌더러 SVG를 HTML로 덤프.
//   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/_previewOpampFiniteGainOffset.mjs <out.html>
import { writeFileSync } from "node:fs";
import { generateOpampFiniteGainOffset } from "../lib/generation/topologies/opampFiniteGainOffset.ts";
import { renderOpampFiniteGainOffsetCircuit } from "../lib/renderers/opampFiniteGainOffsetCircuitRenderer.ts";

const out = process.argv[2];
const blocks = ["exam_similar", "exam_variant"].map((mode) => {
  const g = generateOpampFiniteGainOffset({ seed: 3, mode });
  return `<h3 style="font:600 14px sans-serif">${mode} — A₀=${g.values.a0}, R₁=${g.values.r1k}k, R₂=${g.values.r2k}k, V_B=${g.values.vb}V</h3>` +
    `<div style="width:660px">${renderOpampFiniteGainOffsetCircuit(g.circuitDiagram)}</div>`;
});
writeFileSync(out, `<html><body style="background:#fff;margin:0;padding:12px">${blocks.join("")}</body></html>`, "utf8");
console.log("written:", out);
