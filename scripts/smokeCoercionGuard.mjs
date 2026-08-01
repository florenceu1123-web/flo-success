// ★ 안전망이 올바른 전용 분류를 덮어쓰지 않는지 — 감지기 단위 검증 (API 호출 없음)
//   실측 사고 2건: counter_dac_comparator를 jk_sync_counter 안전망이,
//   opamp_positive_feedback을 opamp_finite_gain_block 안전망이 덮어썼다.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeCoercionGuard.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectJkSyncCounter } from "../lib/pipeline/runJkSyncCounterPipeline.ts";
import { detectOpampFiniteGainBlock } from "../lib/pipeline/runOpampFiniteGainBlockPipeline.ts";

const counterDac = {
  topic: "2비트 동기식 카운터 회로 분석",
  interpretation: "2비트 동기식 카운터와 D/A 변환기 및 비교기를 이용한 응용 회로. JK 플립플롭 출력 Q̄_A·Q̄_B 파형과 비교기 출력 V_o 파형을 도시한다.",
  relatedConcepts: ["JK 플립플롭", "D/A 변환", "비교기", "카운터"],
  fillInTheBlanks: [],
  componentInventory: [{ type: "R" }, { type: "OPAMP" }],
};
const pureJk = {
  topic: "JK 플립플롭 동기식 카운터",
  interpretation: "JK 플립플롭 3개로 구성된 동기식 카운터의 타이밍 도표를 도시한다.",
  relatedConcepts: ["JK 플립플롭", "카운터", "타이밍"],
  fillInTheBlanks: [],
  componentInventory: [],
};
const positiveFb = {
  topic: "정귀환 OPAMP 회로 해석",
  interpretation: "정귀환이 가해진 연산 증폭기에서 개방 루프 이득 A(s)를 고려해 비반전 입력 전압 V⁺=βV_out의 β를 구한다.",
  relatedConcepts: ["정귀환", "개방 루프 이득"],
  fillInTheBlanks: [],
  componentInventory: [{ type: "OPAMP" }],
};

const CASES = [
  { name: "임용8(카운터+DAC+비교기) 분류", got: classifyCircuitType(counterDac, "circuit_theory")?.type, expect: "counter_dac_comparator" },
  { name: "임용8 — JK 안전망이 덮어쓰지 않음", got: detectJkSyncCounter(counterDac), expect: false },
  { name: "순수 JK 동기식 카운터 — JK 안전망 정상 발화", got: detectJkSyncCounter(pureJk), expect: true },
  { name: "임용6(정귀환) 분류", got: classifyCircuitType(positiveFb, "electronics")?.type, expect: "opamp_positive_feedback" },
  { name: "임용6 — finite_gain 안전망이 덮어쓰지 않음", got: detectOpampFiniteGainBlock(positiveFb), expect: false },
];

let pass = 0;
for (const c of CASES) {
  const ok = c.got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name} (실제=${c.got})`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
