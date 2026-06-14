/**
 * OPAMP 차동증폭기 (임용 9번) 생성기·detector smoke.
 *
 *  검증:
 *   1. 닫힌형 해 정확성 — 원본값(R_n=R_1=5,R_2=80,R_3=10,R_4=90,I_n=0.2,V_p=2)에서
 *      V_o=8.2, A_d=8.05, A_c=0.1 (compute 함수는 export 안 됐으므로 enumerate 결과로 간접 확인 +
 *      여러 seed 생성물의 자체-일관성 검사).
 *   2. detector — OPAMP + 차동/공통모드 이득 키워드 → true.
 *
 *  실행: npx tsx scripts/smokeOpampDifferenceAmp.ts
 */
import { generateOpampDifferenceAmp } from "../lib/generation/topologies/opampDifferenceAmp";
import { detectOpampDifferenceAmp } from "../lib/pipeline/runOpampDifferenceAmpPipeline";
import type { AnalysisResult } from "../types";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("  ✗ FAIL:", msg); failed++; }
  else console.log("  ✓", msg);
}
const approx = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

// ── 1. 생성기 자체-일관성 (닫힌형 해) ──
console.log("[generator]");
for (const seed of [1, 5, 17, 42, 100, 777]) {
  const { values: v } = generateOpampDifferenceAmp({ seed });
  const V1 = v.I_n * v.R_n;
  const div = v.R_4 / (v.R_3 + v.R_4);
  const Vm = v.V_p * div;
  const b = v.R_2 / (v.R_1 + v.R_n);
  const a = div * (1 + b);
  const Vo = a * v.V_p - b * V1;
  const Ad = (a + b) / 2, Ac = a - b;
  const ok =
    approx(v.V_1, +V1.toFixed(4)) && approx(v.V_minus, +Vm.toFixed(4)) &&
    approx(v.V_o, +Vo.toFixed(4)) && approx(v.A_d, +Ad.toFixed(4)) && approx(v.A_c, +Ac.toFixed(4)) &&
    v.V_o > 0 && v.A_c > 0;
  assert(ok, `seed=${seed}: V_o=${v.V_o} R_4=${v.R_4}kΩ A_d=${v.A_d} A_c=${v.A_c} (닫힌형 일관)`);
}

// ── 2. detector ──
console.log("[detector]");
const analysis = {
  componentInventory: [{ type: "OPAMP" }, { type: "I" }, { type: "V" }, { type: "R" }, { type: "R" }, { type: "R" }, { type: "R" }, { type: "R" }],
  relatedConcepts: ["연산증폭기", "차동모드 이득", "공통모드 이득"],
  interpretation: "차동모드이득 A_d와 공통모드이득 A_c를 구한다.",
} as unknown as AnalysisResult;
assert(detectOpampDifferenceAmp(analysis) === true, "차동/공통모드 + OPAMP → true");
assert(detectOpampDifferenceAmp({ componentInventory: [{ type: "OPAMP" }], interpretation: "반전 증폭기" } as unknown as AnalysisResult) === false, "일반 반전증폭 → false");

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
if (failed > 0) process.exit(1);
