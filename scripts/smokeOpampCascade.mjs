/**
 * 2-OPAMP cascade smoke — generator + renderer (no OpenAI).
 */
import { writeFileSync } from "node:fs";
import { generateOpampCascade } from "../lib/generation/topologies/opampCascade.ts";
import { renderOpampCascade } from "../lib/renderers/opampCascadeRenderer.ts";

const blocks = [];
for (let seed = 1; seed <= 5; seed++) {
  const gen = generateOpampCascade({ seed });
  const { values: v, answer: a } = gen;
  console.log(`\n=== seed=${seed} ===`);
  console.log("  values:", JSON.stringify(v));
  console.log("  answer:", JSON.stringify(a));

  // 분석값
  const expVsVo = -v.R_5 / v.R_4;
  const expVoVi = -v.R_3 / v.R_1;
  const expVsVi = (v.R_3 * v.R_5) / (v.R_1 * v.R_4);

  const checks = [
    { name: `V_s/V_o = ${expVsVo}`, ok: Math.abs(a.Vs_over_Vo - expVsVo) < 0.01 },
    { name: `V_o/V_i = ${expVoVi}`, ok: Math.abs(a.Vo_over_Vi - expVoVi) < 0.01 },
    { name: `V_s/V_i = ${expVsVi}`, ok: Math.abs(a.Vs_over_Vi - expVsVi) < 0.01 },
  ];
  for (const c of checks) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
    if (!c.ok) { console.log("FAIL"); process.exit(1); }
  }

  const svg = renderOpampCascade({
    V_i_label: "v_i(t)",
    R_1_label: `${v.R_1}kΩ`,
    R_2_label: `${v.R_2}kΩ`,
    R_3_label: `${v.R_3}kΩ`,
    R_4_label: `${v.R_4}kΩ`,
    R_5_label: `${v.R_5}kΩ`,
    R_6_label: `${v.R_6}kΩ`,
  });
  console.log(`  SVG size: ${svg.length}`);
  if (svg.length < 1500) { console.log("FAIL — SVG too small"); process.exit(1); }

  if (seed <= 2) {
    blocks.push(`
<h2>seed=${seed}</h2>
<pre>values: ${JSON.stringify(v, null, 2)}
answer: V_s/V_o=${a.Vs_over_Vo}, V_o/V_i=${a.Vo_over_Vi}, V_s/V_i=${a.Vs_over_Vi}</pre>
<div style="border:1px solid #ccc;display:inline-block">${svg}</div><hr/>`);
  }
}

const html = `<!doctype html><meta charset="utf-8"><title>OPAMP cascade smoke</title>
<style>body{margin:20px;font:14px sans-serif}pre{background:#f5f5f5;padding:8px;font-size:11px;white-space:pre-wrap}</style>
<h1>2-OPAMP cascade archetype smoke</h1>${blocks.join("\n")}`;
writeFileSync("scripts/smokeOpampCascade.html", html);
console.log("\nHTML saved -> scripts/smokeOpampCascade.html");
console.log("\n=== All 5 seeds PASS ===");
