/**
 * 전원변환 + 전압비 (임용 7번) 생성기·detector smoke.
 *
 *  검증:
 *   1. detectSourceTransformRatio가 분석 텍스트에서 전압비 [a,b,c]를 추출하는가.
 *   2. generateSourceTransformRatio가 전압비를 만족하는 nice 값을 만드는가
 *      (V_1:V_2:V_3 = a:b:c, I_a+I_x=I, R_a∥R_x로 R_x 일관).
 *
 *  실행: npx tsx scripts/smokeSourceTransformRatio.ts
 */
import { generateSourceTransformRatio } from "../lib/generation/topologies/sourceTransformRatio";
import { detectSourceTransformRatio } from "../lib/pipeline/runSourceTransformRatioPipeline";
import type { AnalysisResult } from "../types";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("  ✗ FAIL:", msg); failed++; }
  else console.log("  ✓", msg);
}
function approx(a: number, b: number, eps = 1e-6) { return Math.abs(a - b) < eps; }

// ── 1. detector — 임용 7번 분석 형태 ──
console.log("[detector]");
const analysis = {
  semantic: { hasEquivalentTransformation: true },
  interpretation: "전원 변환을 통해 전류원을 전압원으로 바꾼다.",
  fillInTheBlanks: [
    { sentence: "전압 비율은 V_1:V_2:V_3 = ____:2:1이다.", answer: "3" },
  ],
} as unknown as AnalysisResult;
const ratio = detectSourceTransformRatio(analysis);
assert(ratio !== null && ratio[0] === 3 && ratio[1] === 2 && ratio[2] === 1, `ratio 추출 = ${ratio?.join(":")}`);
assert(detectSourceTransformRatio({} as AnalysisResult) === null, "전원변환 신호 없으면 null");

// ── 2. generator — 여러 seed로 전압비·전류 일관성 ──
console.log("[generator]");
for (const seed of [1, 7, 42, 123, 999, 12345]) {
  const g = generateSourceTransformRatio({ ratio: [3, 2, 1], seed, mode: "exam_similar" });
  const v = g.values;
  const okRatio = approx(v.V1 / v.V3, 3, 1e-3) && approx(v.V2 / v.V3, 2, 1e-3);
  const okKcl = approx(v.I_a + v.I_x, v.I, 1e-6);
  const okParallel = approx((v.R_a * v.R_x) / (v.R_a + v.R_x), v.P, 1e-6);
  const okVs = approx(v.V_s, (v.I_s * v.R_p) / 1000, 1e-6);
  assert(okRatio && okKcl && okParallel && okVs && Number.isInteger(v.R_x),
    `seed=${seed}: R_3=${v.R_x}Ω V_s=${v.V_s}V I=${v.I}mA I_3=${v.I_x}mA (ratio·KCL·∥·Vs ok)`);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
if (failed > 0) process.exit(1);
