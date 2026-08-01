// 임용 9번 RLC 주파수응답 곡선 → 정전용량 C 도출 라우팅 검증 (API 호출 없음)
//   신고: "생성이 안돼" — 인벤토리 추출 실패(schema_fail)로 R·L·C 개수가 0이 되어
//   unsupported로 떨어졌고, generic 경로에서 GPT가 solution을 배열로 반환해 500 크래시까지 났다.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeRlcResonanceRouting.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

const base = {
  topic: "RLC 회로의 주파수 응답 분석",
  interpretation: "RLC 회로에서 v(t)의 주파수에 따른 전류 i(t)의 진폭 I[A] 관계 그래프를 이용해 커패시터 C의 정전용량과 전류 i(t)를 구하고, 최대 전류 I_max와 공진 주파수 f₀를 구한다.",
  relatedConcepts: ["RLC 회로", "주파수 응답", "공진", "정전용량"],
  fillInTheBlanks: [],
};
const CASES = [
  { name: "인벤토리 비어 있음 (schema_fail 재현)", a: { ...base, componentInventory: [] }, expect: "rlc_resonance" },
  { name: "인벤토리 정상 (R·L·C·V)", a: { ...base, componentInventory: [{ type: "R" }, { type: "L" }, { type: "C" }, { type: "V" }] }, expect: "rlc_resonance" },
  {
    name: "[회귀] 일반 공진 문제(곡선·정전용량 없음) → universal_ac 유지",
    a: {
      topic: "직렬 RLC 공진", interpretation: "직렬 RLC 회로의 공진 주파수에서 페이저 전압을 구한다.",
      relatedConcepts: ["공진", "페이저"], fillInTheBlanks: [],
      componentInventory: [{ type: "R" }, { type: "L" }, { type: "C" }, { type: "V" }],
    },
    expectNot: "rlc_resonance",
  },
  {
    name: "[회귀] 중첩 문제 → ac_superposition 유지",
    a: {
      topic: "교류 중첩", interpretation: "전류원을 개방하고 전압원을 단락시켜 각각 구한 뒤 합한다.",
      relatedConcepts: ["중첩"], fillInTheBlanks: [],
      componentInventory: [{ type: "V" }, { type: "I" }, { type: "L" }, { type: "C" }, { type: "R" }],
    },
    expect: "ac_superposition",
  },
];
let pass = 0;
for (const c of CASES) {
  const got = classifyCircuitType(c.a, "circuit_theory")?.type;
  const ok = c.expectNot ? got !== c.expectNot : got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name} → ${got}`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
