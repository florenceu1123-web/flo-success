// 개념 명칭형(원리·법칙 이름 쓰기) — 회로 archetype으로 새지 않는지 검증 (API 호출 없음)
//   신고: "㉠·㉡에서 설명하는 원리 또는 법칙의 이름을 쓰시오"(KVL·중첩)가
//   ac_superposition(AC 다중 전원 회로 계산)으로 생성됐다.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeConceptNaming.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { isPrincipleNamingText, isConceptNamingText } from "../lib/analysis/deviceIdentity.ts";
import { resolveRules } from "../lib/rules/index.ts";

const naming = {
  topic: "선형 회로 해석의 원리와 법칙",
  interpretation: "㉠은 회로의 임의의 폐경로에서 인가 전압과 강하 전압의 대수합이 0이라는 설명이고, ㉡은 두 개 이상의 독립 전원이 있을 때 임의의 소자의 전압·전류가 개별 전원에 의한 값의 합과 같다는 설명이다. ㉠과 ㉡에서 설명하는 원리 또는 법칙의 이름을 순서대로 쓰시오.",
  relatedConcepts: ["키르히호프 전압법칙", "중첩의 원리", "선형 회로"],
  fillInTheBlanks: [],
  componentInventory: [],
};
const computeSuper = {
  topic: "중첩의 원리와 전력 계산",
  interpretation: "중첩의 원리를 이용하여 12Ω 저항에서 소비되는 전력 P[W]를 구하는 문제. 전압원과 전류원이 혼합된 회로.",
  relatedConcepts: ["중첩의 원리", "전력"],
  fillInTheBlanks: [],
  componentInventory: [{ type: "V" }, { type: "I" }, { type: "R" }],
};

const markerOnly = {
  topic: "회로 해석의 기본 원리",
  interpretation: "㉠은 폐경로에서 전압의 대수합이 0이라는 설명이고, ㉡은 여러 독립 전원이 있을 때 각 전원이 단독으로 작용한 결과의 합과 같다는 설명이다.",
  relatedConcepts: ["회로 해석", "원리"],
  fillInTheBlanks: [],
  componentInventory: [],
};
const CASES = [
  { name: "[신고 재현] 마커(㉠·㉡)만 있고 명칭 표현 없음 → 개념형", got: isPrincipleNamingText(markerOnly.topic + " " + markerOnly.interpretation), expect: true },
  { name: "[신고 재현] 회로 archetype 아님", got: classifyCircuitType(markerOnly, "circuit_theory")?.type, expect: "unsupported" },
  { name: "원리 명칭형 → 회로 archetype 아님", got: classifyCircuitType(naming, "circuit_theory")?.type, expect: "unsupported" },
  { name: "원리 명칭형 판정", got: isPrincipleNamingText(naming.interpretation), expect: true },
  { name: "개념 명칭형 통합 판정", got: isConceptNamingText(naming.interpretation), expect: true },
  {
    name: "figure role 면제 (회로 그림 요구 안 함)",
    got: resolveRules({ subject: "circuit_theory", semantic: {}, text: naming.interpretation }).requiredFigureRoles.length,
    expect: 0,
  },
  // 회귀 — 계산이 있는 중첩 문제는 회로 경로 유지
  { name: "[회귀] 중첩+전력 계산 → 명칭형 아님", got: isPrincipleNamingText(computeSuper.interpretation), expect: false },
  { name: "[회귀] 중첩+전력 계산 → 회로 archetype 유지", got: classifyCircuitType(computeSuper, "circuit_theory")?.type !== "unsupported", expect: true },
];
let pass = 0;
for (const c of CASES) {
  const ok = c.got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name} (실제=${c.got})`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
