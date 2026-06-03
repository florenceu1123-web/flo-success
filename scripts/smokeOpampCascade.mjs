/**
 * 2-OPAMP cascade (전역 피드백) smoke — generator + textWriter + renderer (no OpenAI).
 *
 *  핵심 검증: generator의 닫힌형 해를 ★ 독립적인 수치 해석 ★ (회로 방정식 3×3 연립,
 *  Gaussian elimination)으로 교차 검증 — 그림·풀이 불일치 회귀 방지 (사용자 신고 건).
 *
 *  회로 방정식 (이상 OPAMP, V_i=1):
 *    eq1  KCL at V⁻(U_1):  (1 − Vm1)/R_1 + (V_o − Vm1)/R_3 = 0
 *    eq2  V⁺(U_1) 분배:     Vm1 = V_s·R_6/(R_2+R_6)
 *    eq3  KCL at V⁻(U_2)=0: V_o/R_4 + V_s/R_5 = 0
 */
import { writeFileSync } from "node:fs";
import { generateOpampCascade } from "../lib/generation/topologies/opampCascade.ts";
import { writeOpampCascadeText } from "../lib/generation/topologies/opampCascadeTextWriter.ts";
import { renderOpampCascade } from "../lib/renderers/opampCascadeRenderer.ts";

/** 3×3 선형계 Ax=b 풀이 (Gaussian elimination, partial pivoting). */
function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    // pivot
    let piv = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    [M[col], M[piv]] = [M[piv], M[col]];
    if (Math.abs(M[col][col]) < 1e-15) throw new Error("singular");
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c < 4; c++) M[r][c] -= f * M[col][c];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/** 회로를 독립적으로 수치 해석 — [V_o/V_i, V_s/V_i] 반환. */
function numericSolve(v) {
  // 미지수 x = [V_o, V_s, Vm1], V_i = 1
  const A = [
    [1 / v.R_3, 0, -(1 / v.R_1 + 1 / v.R_3)],          // eq1
    [0, -v.R_6 / (v.R_2 + v.R_6), 1],                   // eq2
    [1 / v.R_4, 1 / v.R_5, 0],                          // eq3
  ];
  const b = [-1 / v.R_1, 0, 0];
  const [V_o, V_s] = solve3(A, b);
  return { Vo_over_Vi: V_o, Vs_over_Vi: V_s };
}

const isNiceHalf = (x) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-6;

let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fail++;
};

const blocks = [];
const signatures = new Set();

for (let seed = 1; seed <= 10; seed++) {
  const gen = generateOpampCascade({ seed: seed * 7919 });
  const { values: v, answer: a } = gen;
  console.log(`\n=== seed=${seed} ===`);
  console.log(`  values: R_1=${v.R_1} R_2=${v.R_2} R_3=${v.R_3} R_4=${v.R_4} R_5=${v.R_5} R_6=${v.R_6}`);
  console.log(`  answer: V_s/V_o=${a.Vs_over_Vo}, V_o/V_i=${a.Vo_over_Vi}, V_s/V_i=${a.Vs_over_Vi}`);
  signatures.add(JSON.stringify(v));

  // ★ 독립 수치 해석과 교차 검증 (닫힌형 해와 무관한 별도 풀이)
  const num = numericSolve(v);
  check(`수치해석 V_o/V_i 일치 (${num.Vo_over_Vi.toFixed(4)})`, Math.abs(num.Vo_over_Vi - a.Vo_over_Vi) < 1e-6);
  check(`수치해석 V_s/V_i 일치 (${num.Vs_over_Vi.toFixed(4)})`, Math.abs(num.Vs_over_Vi - a.Vs_over_Vi) < 1e-6);

  // 단계 1 (U_2 반전증폭) — 항상 −R_5/R_4
  check(`V_s/V_o = −R_5/R_4`, Math.abs(a.Vs_over_Vo - -v.R_5 / v.R_4) < 1e-9);

  // 답이 깔끔한지 (0.5 단위)
  check(`답 깔끔함 (0.5 단위)`, isNiceHalf(a.Vo_over_Vi) && isNiceHalf(a.Vs_over_Vi) && isNiceHalf(a.Vs_over_Vo));

  // ★ 단순 cascade 수식(이전 버그)과 다른지 — 전역 피드백이 실제 반영됐는지
  const wrongSimpleCascade = -v.R_3 / v.R_1;
  check(`단순 cascade 수식(−R_3/R_1=${wrongSimpleCascade})과 다름 (전역 피드백 반영)`,
    Math.abs(a.Vo_over_Vi - wrongSimpleCascade) > 1e-9);

  // textWriter (결정론) — 풀이가 수식과 일치하는 키워드 포함
  const text = await writeOpampCascadeText({ generation: gen, mode: "exam_similar" });
  check("조건: 전역 피드백 명시", text.conditions.some((c) => c.includes("전역 피드백")));
  check("조건: 'V⁺ 모두 GND' 오류 문구 없음", !text.conditions.some((c) => c.includes("모두 GND")));
  check("풀이: V⁺ 분배 단계 포함", text.solution.includes("전압 분배") || text.solution.includes("R_2+R_6"));
  check("풀이: 가상 단락 V⁺=V⁻ 포함", text.solution.includes("V⁺(U_1) = V⁻(U_1)") || text.solution.includes("가상 단락"));
  check("정답에 최종 V_s/V_i 포함", text.answer.includes(String(a.Vs_over_Vi)));

  // renderer
  const svg = renderOpampCascade({
    V_i_label: "v_i(t)",
    R_1_label: `${v.R_1}kΩ`,
    R_2_label: `${v.R_2}kΩ`,
    R_3_label: `${v.R_3}kΩ`,
    R_4_label: `${v.R_4}kΩ`,
    R_5_label: `${v.R_5}kΩ`,
    R_6_label: `${v.R_6}kΩ`,
  });
  check(`renderer SVG (${svg.length} bytes)`, svg.length > 1500);

  if (seed <= 2) {
    blocks.push(`
<h2>seed=${seed}</h2>
<pre>values: ${JSON.stringify(v, null, 2)}
answer: V_s/V_o=${a.Vs_over_Vo}, V_o/V_i=${a.Vo_over_Vi}, V_s/V_i=${a.Vs_over_Vi}
[풀이]
${text.solution}</pre>
<div style="border:1px solid #ccc;display:inline-block">${svg}</div><hr/>`);
  }
}

console.log(`\n값 다양성: ${signatures.size}종 (10 seed)`);
check("값 다양성 ≥ 5종", signatures.size >= 5);

const html = `<!doctype html><meta charset="utf-8"><title>OPAMP cascade smoke</title>
<style>body{margin:20px;font:14px sans-serif}pre{background:#f5f5f5;padding:8px;font-size:11px;white-space:pre-wrap}</style>
<h1>2-OPAMP cascade (전역 피드백) archetype smoke</h1>${blocks.join("\n")}`;
writeFileSync("scripts/smokeOpampCascade.html", html);
console.log("HTML saved -> scripts/smokeOpampCascade.html");

if (fail > 0) {
  console.log(`\n=== FAIL (${fail}) ===`);
  process.exit(1);
}
console.log("\n=== All seeds PASS ===");
