// 조합논리회로 ↔ 4×1 MUX 등가 구현(임용 5번) 라우팅 회귀 — API 없음
//
//   사용자 신고: "생성했던 문제인데 유사문제가 생성 안돼".
//   실측 로그: reclassified=**universal_digital** → figures=truth_table,logic_network (전혀 다른 문제).
//   원인: 전용 `mux_implementation` 분기가 넓은 universal_digital(N변수/M함수) 분기 **아래**에 있었다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeMuxImplRouting.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

let pass = 0, fail = 0;
const mk = (topic, interpretation, concepts = []) => ({ topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [] });
const expect = (name, a, want, subject = "digital_logic") => {
  const got = classifyCircuitType(a, subject).type;
  if (got === want) { pass++; console.log(`  ✅ ${name} → ${got}`); }
  else { fail++; console.log(`  ❌ ${name} → ${got} (기대: ${want})`); }
};

console.log("\n[1] 이 원본 — 표현·과목이 흔들려도 mux_implementation");
const REAL = mk(
  "조합논리회로와 멀티플렉서",
  "입력 변수 A, B, C를 갖는 조합논리회로의 출력 불 함수 F(A,B,C)를 최대항의 곱으로 표현하고, 이를 최소항의 합으로 변환한 뒤, 4×1 멀티플렉서를 이용한 등가회로가 되도록 I_0와 I_1에 대한 입력신호를 구하는 문제이다.",
  ["조합논리회로", "멀티플렉서", "최대항의 곱", "최소항의 합", "등가회로", "선택선"],
);
for (const subject of ["digital_logic", "mixed_signal", "electronics"]) {
  expect(`실측 요약 (subject=${subject})`, REAL, "mux_implementation", subject);
}
expect("'MUX'로만 표기 + 등가", mk(
  "MUX 등가 구현",
  "3입력 조합 논리 회로와 등가인 4:1 MUX 회로를 만들기 위해 각 입력 단자에 들어갈 신호를 구한다.",
  ["MUX", "조합 논리", "등가"],
), "mux_implementation");

console.log("\n[2] 형제 회귀 — 순차·다른 유형은 뺏기지 않는다");
expect("D-FF/T-FF + 2×1 MUX 순차회로", mk(
  "D 플립플롭과 2×1 MUX 순서 회로",
  "D 플립플롭 2개와 2×1 MUX로 구성된 자율 순환 순서 회로의 상태표를 완성하고 MUX 입력을 구한다.",
  ["D 플립플롭", "MUX", "상태표", "클럭"],
), "dff_mux_sequential");

expect("SR-FF + 2×1 MUX 순차회로", mk(
  "SR 플립플롭과 2×1 MUX 순서 회로",
  "SR 플립플롭 2개와 2×1 MUX 4개로 구성된 상태 순환 순서 회로에서 상태표와 MUX 입력을 구한다.",
  ["SR 플립플롭", "MUX", "상태 순환", "클럭"],
), "sr_ff_mux_sequential");

expect("공유항·입력결정 (universal_digital 원본)", mk(
  "다중 출력 함수의 공유 항",
  "F1(A,B,C,D)와 F2(A,B,C,D)가 Σm으로 주어질 때 카르노맵에서 중복되는 공유 항을 찾고 회로의 ⓐ에 들어갈 입력변수를 결정한다.",
  ["카르노맵", "공유 항", "다중 출력", "입력변수 결정"],
), "universal_digital");

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
