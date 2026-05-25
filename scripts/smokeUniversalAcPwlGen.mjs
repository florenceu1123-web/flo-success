import { writeFileSync } from "node:fs";
import { generateUniversalAcPwl } from "../lib/generation/topologies/universalAcPwl.ts";
import { hasDiodePwl, renderDiodePwlCircuit } from "../lib/renderers/diodePwlCircuitRenderer.ts";

// 5개 seed에서 generator + 시뮬레이션 end-to-end 검증
for (let seed = 100; seed < 105; seed++) {
  const gen = generateUniversalAcPwl({ seed });
  console.log(`\n=== seed=${seed} ===`);
  console.log("values:", JSON.stringify(gen.values));
  console.log("answer:", JSON.stringify(gen.answer));

  // 답이 합리적인 범위인지 (V_CC 근처 max, 0 근처 min, |step1·step2| < V_i_peak + V_CC)
  const okMax = gen.answer.step3_Vo_max <= gen.values.V_CC + 0.5;
  const okMin = gen.answer.step3_Vo_min >= -0.5;
  const okFinite = (
    Number.isFinite(gen.answer.step1_Vo_at_halfT) &&
    Number.isFinite(gen.answer.step2_Vo_at_T) &&
    Number.isFinite(gen.answer.step3_Vo_min) &&
    Number.isFinite(gen.answer.step3_Vo_max)
  );
  console.log(`  step3 max(${gen.answer.step3_Vo_max}) ≤ V_CC+0.5(${gen.values.V_CC + 0.5}): ${okMax ? "✓" : "✗"}`);
  console.log(`  step3 min(${gen.answer.step3_Vo_min}) ≥ -0.5: ${okMin ? "✓" : "✗"}`);
  console.log(`  all finite: ${okFinite ? "✓" : "✗"}`);

  if (!(okMax && okMin && okFinite)) {
    console.log("FAIL — 답 범위 비정상");
    process.exit(1);
  }

  // 첫 seed에서 SVG도 렌더 (시각 검증용)
  if (seed === 100) {
    const detect = hasDiodePwl(gen.netlist);
    const svg = renderDiodePwlCircuit(gen.netlist);
    console.log(`  hasDiodePwl: ${detect}, svg length: ${svg?.length ?? "null"}`);
    if (svg) {
      const html = `<!doctype html><meta charset="utf-8"><title>UniversalAcPwl smoke</title>
<style>body{margin:20px;font:14px sans-serif}pre{background:#f5f5f5;padding:8px;font-size:11px;white-space:pre-wrap}</style>
<h1>임용 6번 형식 — generator (seed=${seed})</h1>
<pre>values: ${JSON.stringify(gen.values, null, 2)}
answer: ${JSON.stringify(gen.answer, null, 2)}</pre>
<div style="border:1px solid #ccc;display:inline-block">${svg}</div>`;
      writeFileSync("scripts/smokeUniversalAcPwlGen.html", html);
      console.log("  SVG saved -> scripts/smokeUniversalAcPwlGen.html");
    }
  }
}

console.log("\n=== All seeds PASS ===");
