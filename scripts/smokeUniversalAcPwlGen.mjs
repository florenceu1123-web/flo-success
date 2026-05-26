import { writeFileSync } from "node:fs";
import { generateUniversalAcPwl } from "../lib/generation/topologies/universalAcPwl.ts";
import { hasDiodePwl, renderDiodePwlCircuit } from "../lib/renderers/diodePwlCircuitRenderer.ts";

// 두 polarity (exam_similar=positive, exam_variant=negative) 각 5 seed 검증.
const MODES = [
  { label: "exam_similar (positive clamper)", mode: "exam_similar", expectPolarity: "positive" },
  { label: "exam_variant (negative clamper)", mode: "exam_variant", expectPolarity: "negative" },
];

let firstSvgPositive = null;
let firstSvgNegative = null;

for (const { label, mode, expectPolarity } of MODES) {
  console.log(`\n#### ${label} ####`);
  for (let seed = 100; seed < 105; seed++) {
    const gen = generateUniversalAcPwl({ seed, mode });
    console.log(`\n=== seed=${seed} ===`);
    console.log("polarity:", gen.polarity);
    console.log("values:", JSON.stringify(gen.values));
    console.log("answer:", JSON.stringify(gen.answer));

    if (gen.polarity !== expectPolarity) {
      console.log(`FAIL — polarity ${gen.polarity} ≠ expect ${expectPolarity}`);
      process.exit(1);
    }

    // 답이 합리적인 범위인지 — polarity별 검증
    let okMax, okMin;
    if (gen.polarity === "positive") {
      // V_o ∈ [0, V_CC]: max ≈ V_CC, min ≈ 0
      okMax = gen.answer.step3_Vo_max <= gen.values.V_CC + 0.5;
      okMin = gen.answer.step3_Vo_min >= -0.5;
    } else {
      // V_o ∈ [-V_CC, 0]: max ≈ 0, min ≈ -V_CC
      okMax = gen.answer.step3_Vo_max <= 0.5;
      okMin = gen.answer.step3_Vo_min >= -gen.values.V_CC - 0.5;
    }
    const okFinite = (
      Number.isFinite(gen.answer.step1_Vo_at_halfT) &&
      Number.isFinite(gen.answer.step2_Vo_at_T) &&
      Number.isFinite(gen.answer.step3_Vo_min) &&
      Number.isFinite(gen.answer.step3_Vo_max)
    );
    const expectMax = gen.polarity === "positive" ? gen.values.V_CC : 0;
    const expectMin = gen.polarity === "positive" ? 0 : -gen.values.V_CC;
    console.log(`  step3 max(${gen.answer.step3_Vo_max}) target≈${expectMax}: ${okMax ? "✓" : "✗"}`);
    console.log(`  step3 min(${gen.answer.step3_Vo_min}) target≈${expectMin}: ${okMin ? "✓" : "✗"}`);
    console.log(`  all finite: ${okFinite ? "✓" : "✗"}`);

    // 분석적 예측 비교 (clamping case 2V_p > V_CC 인 경우)
    const d1Clamps = 2 * gen.values.V_i_peak > gen.values.V_CC;
    if (d1Clamps) {
      const expectedStep1 = gen.polarity === "positive" ? gen.values.V_i_peak : -gen.values.V_i_peak;
      const expectedStep2 = gen.polarity === "positive"
        ? gen.values.V_CC - gen.values.V_i_peak
        : gen.values.V_i_peak - gen.values.V_CC;
      const step1Ok = Math.abs(gen.answer.step1_Vo_at_halfT - expectedStep1) < 0.1;
      const step2Ok = Math.abs(gen.answer.step2_Vo_at_T - expectedStep2) < 0.1;
      console.log(`  step1 ≈ ${expectedStep1}: ${step1Ok ? "✓" : "✗"} (got ${gen.answer.step1_Vo_at_halfT})`);
      console.log(`  step2 ≈ ${expectedStep2}: ${step2Ok ? "✓" : "✗"} (got ${gen.answer.step2_Vo_at_T})`);
      if (!(step1Ok && step2Ok)) {
        console.log("FAIL — 분석값과 시뮬값 불일치");
        process.exit(1);
      }
    }

    if (!(okMax && okMin && okFinite)) {
      console.log("FAIL — 답 범위 비정상");
      process.exit(1);
    }

    // 첫 seed에서 SVG도 렌더 (시각 검증용) — polarity별 보존
    if (seed === 100) {
      const detect = hasDiodePwl(gen.netlist);
      const svg = renderDiodePwlCircuit(gen.netlist);
      console.log(`  hasDiodePwl: ${detect}, svg length: ${svg?.length ?? "null"}`);
      if (gen.polarity === "positive") firstSvgPositive = { gen, svg };
      else firstSvgNegative = { gen, svg };
    }
  }
}

// HTML output — 양 polarity 나란히
const blocks = [];
for (const [label, entry] of [["positive (exam_similar)", firstSvgPositive], ["negative (exam_variant)", firstSvgNegative]]) {
  if (!entry) continue;
  blocks.push(`
<h2>${label}</h2>
<pre>values: ${JSON.stringify(entry.gen.values, null, 2)}
answer: ${JSON.stringify(entry.gen.answer, null, 2)}
polarity: ${entry.gen.polarity}</pre>
<div style="border:1px solid #ccc;display:inline-block">${entry.svg ?? "<i>no svg</i>"}</div>`);
}
const html = `<!doctype html><meta charset="utf-8"><title>UniversalAcPwl polarity smoke</title>
<style>body{margin:20px;font:14px sans-serif}pre{background:#f5f5f5;padding:8px;font-size:11px;white-space:pre-wrap}</style>
<h1>임용 6번 — 양 polarity (positive vs negative clamper, seed=100)</h1>
${blocks.join("\n")}`;
writeFileSync("scripts/smokeUniversalAcPwlGen.html", html);
console.log("\nSVG saved -> scripts/smokeUniversalAcPwlGen.html");

console.log("\n=== All seeds (positive + negative) PASS ===");
