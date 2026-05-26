/**
 * Thevenin Switched RC + RL smoke — generator + 2 renderer (no OpenAI).
 *
 *   - exam_similar (RC) + exam_variant (RL) 양 mode 각 3 seed 검증
 *   - 솔버 분석값 vs 이론값 일치 확인
 *   - HTML 출력 (양 mode 결과)
 */
import { writeFileSync } from "node:fs";
import { generateTheveninSwitchedRc } from "../lib/generation/topologies/theveninSwitchedRc.ts";
import {
  renderTheveninOriginal,
  renderTheveninEquivalent,
} from "../lib/renderers/theveninSwitchedRcRenderer.ts";

const MODES = [
  { label: "exam_similar (RC mode)", mode: "exam_similar" },
  { label: "exam_variant (RL mode)", mode: "exam_variant" },
];

const blocks = [];

for (const { label, mode } of MODES) {
  console.log(`\n#### ${label} ####`);
  for (let seed = 1; seed <= 3; seed++) {
    const gen = generateTheveninSwitchedRc({ seed, mode });
    const { values: v, answer: a, componentMode } = gen;
    console.log(`\n=== seed=${seed} (${componentMode}) ===`);
    console.log("  values:", JSON.stringify(v));
    console.log("  answer:", JSON.stringify(a));

    const expectedRTh = (v.R_b * (v.R_a + v.R_c)) / (v.R_a + v.R_b + v.R_c);
    const expectedVTh = (v.I_s * v.R_b * v.R_c) / (v.R_a + v.R_b + v.R_c);

    let expectedVo0, expectedVoInf, expectedTau, icLabel, unit;
    if (componentMode === "RL") {
      expectedVo0 = v.V_s / v.R_top;
      expectedVoInf = expectedVTh / expectedRTh;
      expectedTau = v.C_1 / expectedRTh;
      icLabel = "i_o";
      unit = "A";
    } else {
      const alpha = v.C_2 / (v.C_1 + v.C_2);
      expectedVo0 = v.V_s * alpha;
      expectedVoInf = expectedVTh;
      expectedTau = expectedRTh * v.C_1;
      icLabel = "v_o";
      unit = "V";
    }

    const checks = [
      { name: `V_Th ≈ ${expectedVTh.toFixed(3)}`, ok: Math.abs(a.V_Th - expectedVTh) < 0.01 },
      { name: `R_Th ≈ ${expectedRTh.toFixed(3)}`, ok: Math.abs(a.R_Th - expectedRTh) < 0.01 },
      { name: `${icLabel}(0⁻) = ${expectedVo0.toFixed(3)} ${unit}`, ok: Math.abs(a.v_o_0minus - expectedVo0) < 0.01 },
      { name: `${icLabel}(∞) = ${expectedVoInf.toFixed(3)} ${unit}`, ok: Math.abs(a.v_o_inf - expectedVoInf) < 0.01 },
      { name: `τ = ${expectedTau.toFixed(3)} sec`, ok: Math.abs(a.tau - expectedTau) < 0.01 },
    ];
    for (const c of checks) {
      console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
      if (!c.ok) {
        console.log("FAIL");
        process.exit(1);
      }
    }

    // Render
    const reactiveUnit = componentMode === "RL" ? "H" : "F";
    const origSvg = renderTheveninOriginal({
      V_s_label: `${v.V_s}V`,
      R_top_label: `${v.R_top}Ω`,
      C_1_label: `${v.C_1}${reactiveUnit}`,
      C_2_label: `${v.C_2}${reactiveUnit}`,
      R_a_label: `${v.R_a}Ω`,
      R_b_label: `${v.R_b}Ω`,
      R_c_label: `${v.R_c}Ω`,
      I_s_label: `${v.I_s}A`,
      swState: "closed_to_term1",
      componentMode,
    });
    const equivSvg = renderTheveninEquivalent({
      V_s_label: `${v.V_s}V`,
      R_top_label: `${v.R_top}Ω`,
      C_1_label: `${v.C_1}${reactiveUnit}`,
      C_2_label: `${v.C_2}${reactiveUnit}`,
      V_Th_label: `V_Th`,
      R_Th_label: `R_Th`,
      swState: "closed_to_term2",
      componentMode,
    });
    console.log(`  SVG sizes: orig=${origSvg.length}, equiv=${equivSvg.length}`);

    if (seed === 1) {
      blocks.push(`
<h2>${label} — seed=${seed} (${componentMode})</h2>
<pre>values: ${JSON.stringify(v, null, 2)}
answer: V_Th=${a.V_Th}V, R_Th=${a.R_Th}Ω, τ=${a.tau}s
        ${icLabel}(0⁻)=${a.v_o_0minus}${unit}, ${icLabel}(∞)=${a.v_o_inf}${unit}
        ${icLabel}(t) = ${a.v_o_t_expr} [${unit}]</pre>
<h3>(가) 원본 회로</h3>
<div style="border:1px solid #ccc;display:inline-block">${origSvg}</div>
<h3>(나) Thevenin 등가</h3>
<div style="border:1px solid #ccc;display:inline-block">${equivSvg}</div>
<hr/>`);
    }
  }
}

const html = `<!doctype html><meta charset="utf-8"><title>Thevenin Switched RC/RL smoke</title>
<style>body{margin:20px;font:14px sans-serif}pre{background:#f5f5f5;padding:8px;font-size:11px;white-space:pre-wrap}</style>
<h1>Thevenin Switched RC/RL — 양 mode smoke</h1>
${blocks.join("\n")}`;
writeFileSync("scripts/smokeTheveninSwitchedRc.html", html);
console.log("\nHTML saved -> scripts/smokeTheveninSwitchedRc.html");
console.log("\n=== All seeds (RC + RL) PASS ===");
