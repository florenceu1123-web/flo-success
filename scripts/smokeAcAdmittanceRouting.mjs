// 어드미턴스 공진 (임용 7번 회로이론) 라우팅 회귀 — API 없음
//
//   사용자 신고(2026-08-01): 원본(전압원 → C ∥ (R+L), Y_eq=a+jb → ω₀ → I_M)이
//   **RLC 직렬 공진 + 주파수응답 곡선**으로 생성됐다. 전용 archetype은 있는데 0-PRE의
//   발화 조건이 "어드미턴스" 낱말 필수라, Vision 요약이 그 낱말을 흘린 회차에서 통째로 샜다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeAcAdmittanceRouting.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split(":");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
});

// 원본 인벤토리 — 10cos(ωt)[V] 전압원 + 0.05[F] + 1[Ω] + 0.1[H]
const ORIG_INV = inv("V:10cos(ωt)V", "C:0.05F", "R:1Ω", "L:0.1H");

console.log("\n[1] 원본 — 표현이 흔들려도 ac_admittance_resonance");
const CASES = [
  ["'어드미턴스' 명시", mk(
    "RLC 회로의 등가 어드미턴스와 공진",
    "교류 전원이 포함된 RLC 회로에서 점선 내부 회로에 대한 등가 어드미턴스 Y_eq = a + jb의 실수부 a와 허수부 b를 ω가 포함된 식으로 구하고, 공진 주파수 ω₀와 전류 i(t)의 최댓값 I_M을 구한다.",
    ["어드미턴스", "공진 주파수", "전류 최댓값", "RLC"],
    ORIG_INV,
  )],
  // ★★ 실측 신고 회귀 — Vision이 "어드미턴스"를 흘리고 실수부·허수부만 남긴 회차.
  ["★ '어드미턴스' 누락 + 실수부·허수부만", mk(
    "RLC 회로의 공진 주파수와 전류 최댓값",
    "교류 전원이 포함된 RLC 회로에서 점선 내부 회로에 대한 등가 회로의 실수부 a와 허수부 b를 각각 ω가 포함된 식으로 구하고, 이를 이용하여 회로의 공진 주파수 ω₀[rad/s]와 전류 i(t)의 최댓값 I_M[A]을 구한다.",
    ["공진 주파수", "전류의 최댓값", "실수부", "허수부"],
    ORIG_INV,
  )],
  ["'Y_eq' 기호만", mk(
    "교류 RLC 회로 해석",
    "회로의 Y_eq = a + jb를 구하고 공진 주파수와 전류의 최댓값을 구한다.",
    ["공진", "RLC"],
    ORIG_INV,
  )],
];
for (const [name, a] of CASES) {
  for (const subject of ["circuit_theory", "electronics"]) {
    const got = classifyCircuitType(a, subject).type;
    ok(`${name} (subject=${subject}) → ac_admittance_resonance`, got === "ac_admittance_resonance", `got ${got}`);
  }
}

console.log("\n[2] 형제 회귀 — 평범한 직렬 RLC 공진을 뺏지 않는다");
const SIBLINGS = [
  ["직렬 RLC 공진 (실수부·허수부 언급 없음)", mk(
    "직렬 RLC 회로의 공진",
    "직렬로 연결된 R, L, C 회로에서 공진 주파수와 그때의 전류를 구하는 문제이다.",
    ["공진 주파수", "직렬 RLC"],
    inv("V:10V", "R:200Ω", "L:500mH", "C:2μF"),
  )],
  ["역률 보정 (임용 9번)", mk(
    "AC 역률 보정과 전력",
    "직렬 R+L 회로에 부하 R∥C가 연결된 회로에서 역률이 1이 되는 X_C를 구하고 평균 전력과 무효 전력, 피상 전력을 구한다.",
    ["역률", "피상 전력", "무효 전력"],
    inv("V:100V", "R:10Ω", "L:0.1H", "C:1μF", "R:20Ω"),
  ), "ac_power_factor"],
];
for (const [name, a, want] of SIBLINGS) {
  const got = classifyCircuitType(a, "circuit_theory").type;
  ok(`${name} → 뺏기지 않음 (got ${got})`, got !== "ac_admittance_resonance");
  if (want) ok(`${name} → 기대 유형 ${want} 유지`, got === want, `got ${got}`);
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
