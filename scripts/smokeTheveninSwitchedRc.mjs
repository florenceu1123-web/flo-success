/**
 * Thevenin + Switched RC smoke — generator + 2 renderer (no OpenAI).
 *
 *   - 5 seed generator + 2 figure 렌더
 *   - 검증: Thevenin V_Th·R_Th 분석값 vs 솔버값 일치, v_o(0⁻)=V_s, τ=R_Th·C_eq
 *   - HTML 출력
 */
import { writeFileSync } from "node:fs";
import { generateTheveninSwitchedRc } from "../lib/generation/topologies/theveninSwitchedRc.ts";
import {
  renderTheveninOriginal,
  renderTheveninEquivalent,
} from "../lib/renderers/theveninSwitchedRcRenderer.ts";

const blocks = [];
let firstSvgPair = null;

for (let seed = 1; seed <= 5; seed++) {
  const gen = generateTheveninSwitchedRc({ seed });
  const { values: v, answer: a } = gen;
  console.log(`\n=== seed=${seed} ===`);
  console.log("  values:", JSON.stringify(v));
  console.log("  answer: V_Th=", a.V_Th, "R_Th=", a.R_Th, "τ=", a.tau, "v_o(0⁻)=", a.v_o_0minus, "v_o(∞)=", a.v_o_inf);

  // 분석값 검증 — new topology (interp B + V_s/C_2 직렬):
  //   R_Th = R_b || (R_a + R_c)
  //   V_Th = I_s · R_b · R_c / (R_a + R_b + R_c)
  //   v_o(0⁻) = V_s · α where α = C_2/(C_1+C_2)  (V_s+C_2 series 전압분배)
  //   v_o(∞) = V_Th, τ = R_Th · C_1
  const expectedRTh = v.R_b * (v.R_a + v.R_c) / (v.R_a + v.R_b + v.R_c);
  const expectedVTh = v.I_s * v.R_b * v.R_c / (v.R_a + v.R_b + v.R_c);
  const expectedAlpha = v.C_2 / (v.C_1 + v.C_2);
  const expectedVo0 = v.V_s * expectedAlpha;
  const expectedTau = expectedRTh * v.C_1;

  const checks = [
    { name: `V_Th ≈ ${expectedVTh.toFixed(3)}`, ok: Math.abs(a.V_Th - expectedVTh) < 0.01 },
    { name: `R_Th ≈ ${expectedRTh.toFixed(3)}`, ok: Math.abs(a.R_Th - expectedRTh) < 0.01 },
    { name: `v_o(0⁻) = V_s·α = ${expectedVo0.toFixed(3)}`, ok: Math.abs(a.v_o_0minus - expectedVo0) < 0.01 },
    { name: `v_o(∞) = V_Th`, ok: Math.abs(a.v_o_inf - a.V_Th) < 0.01 },
    { name: `τ = R_Th·C_1 = ${expectedTau.toFixed(3)}`, ok: Math.abs(a.tau - expectedTau) < 0.01 },
    { name: `C_eq = C_1 = ${v.C_1} F`, ok: Math.abs(a.C_eq - v.C_1) < 0.01 },
  ];
  for (const c of checks) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
    if (!c.ok) {
      console.log("FAIL");
      process.exit(1);
    }
  }

  // Render check
  const origSvg = renderTheveninOriginal({
    V_s_label: `${v.V_s}V`,
    R_top_label: `${v.R_top}Ω`,
    C_1_label: `${v.C_1}F`,
    C_2_label: `${v.C_2}F`,
    R_a_label: `${v.R_a}Ω`,
    R_b_label: `${v.R_b}Ω`,
    R_c_label: `${v.R_c}Ω`,
    I_s_label: `${v.I_s}A`,
    swState: "closed_to_term1",
  });
  const equivSvg = renderTheveninEquivalent({
    V_s_label: `${v.V_s}V`,
    R_top_label: `${v.R_top}Ω`,
    C_1_label: `${v.C_1}F`,
    C_2_label: `${v.C_2}F`,
    V_Th_label: `V_Th = ${a.V_Th}V`,
    R_Th_label: `R_Th = ${a.R_Th}Ω`,
    swState: "closed_to_term2",
  });
  console.log(`  SVG sizes: orig=${origSvg.length}, equiv=${equivSvg.length}`);
  if (origSvg.length < 1000 || equivSvg.length < 800) {
    console.log("FAIL — SVG too small (rendering issue)");
    process.exit(1);
  }
  if (!firstSvgPair) firstSvgPair = { v, a, origSvg, equivSvg };

  if (seed <= 3) {
    blocks.push(`
<h2>seed=${seed}</h2>
<pre>values: ${JSON.stringify(v, null, 2)}
answer: V_Th=${a.V_Th}V, R_Th=${a.R_Th}Ω, τ=${a.tau}s
        v_o(0⁻)=${a.v_o_0minus}V, v_o(∞)=${a.v_o_inf}V
        v_o(t) = ${a.v_o_t_expr}</pre>
<h3>(가) 원본 회로</h3>
<div style="border:1px solid #ccc;display:inline-block">${origSvg}</div>
<h3>(나) Thevenin 등가 회로</h3>
<div style="border:1px solid #ccc;display:inline-block">${equivSvg}</div>
<hr/>`);
  }
}

const html = `<!doctype html><meta charset="utf-8"><title>Thevenin Switched RC smoke</title>
<style>body{margin:20px;font:14px sans-serif}pre{background:#f5f5f5;padding:8px;font-size:11px;white-space:pre-wrap}</style>
<h1>Thevenin + Switched RC archetype smoke (5 seed)</h1>
${blocks.join("\n")}`;
writeFileSync("scripts/smokeTheveninSwitchedRc.html", html);
console.log("\nHTML saved -> scripts/smokeTheveninSwitchedRc.html");
console.log("\n=== All 5 seeds PASS ===");
