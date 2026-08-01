// 원리·법칙 명칭형(개념 문항) 구조 신호 라우팅 — API 호출 없음
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeConceptNamingStructural.mjs
import { isPrincipleNamingAnalysis, isConceptNamingAnalysis } from "../lib/analysis/deviceIdentity.ts";
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

// ★ 아래 3종은 같은 원본(원리·법칙 이름 쓰기)을 실제로 analyze 했을 때 나온 Vision 요약들이다.
const runA = { // 신고 당시 실행
  topic: "회로 해석의 기본 원리",
  interpretation: "이 문제는 선형 회로 해석에 필요한 원리 또는 법칙을 설명한 것이다.",
  relatedConcepts: ["회로 해석", "원리"], fillInTheBlanks: [], componentInventory: [],
};
const runB = { // 직접 재현한 실행 — 마커도, "이름을 쓰라"도 없다
  topic: "회로 해석 원리 설명",
  interpretation:
    "이 문제는 회로 해석에 필요한 기본 원리인 키르히호프의 전압 법칙(KVL)과 키르히호프의 전류 법칙(KCL)을 설명하고, 이를 통해 회로의 전압 및 전류를 분석하는 방법을 묻고 있습니다.",
  relatedConcepts: ["KVL", "KCL"], fillInTheBlanks: [], componentInventory: [{ type: "R", value: "" }],
};
const runC = { // 문구가 살아 있는 실행
  topic: "선형 회로 해석의 원리",
  interpretation: "㉠, ㉡에서 설명하는 원리 또는 법칙의 이름을 순서대로 쓰시오.",
  relatedConcepts: ["중첩의 원리"], fillInTheBlanks: [], componentInventory: [],
};
// 회귀 — 이건 계산 문제라 회로 경로를 유지해야 한다.
const calc = {
  topic: "중첩의 원리를 이용한 전력 계산",
  interpretation: "중첩의 원리를 적용하여 10Ω 저항에서 소비되는 전력을 구하시오.",
  relatedConcepts: ["중첩의 원리"], fillInTheBlanks: [],
  componentInventory: [{ type: "V", value: "20V" }, { type: "R", value: "10Ω" }, { type: "I", value: "2A" }],
};
// 회귀 — 수치가 없어도 "구하라"가 있으면 계산 문제.
const calcNoNum = {
  topic: "테브난 정리", interpretation: "테브난 등가회로를 구하여 부하 전류를 계산하시오.",
  relatedConcepts: ["테브난 정리"], fillInTheBlanks: [], componentInventory: [{ type: "R", value: "" }],
};

// ★ 실측 실행 — 원본에 예시 회로 그림이 딸려 Vision이 소자를 값까지 뽑아낸 경우.
//   같은 원본이 실행마다 소자 0개~12개로 흔들리므로 "소자 없음"은 판정 근거가 될 수 없다.
const runD = {
  topic: "회로 해석의 기본 원리",
  interpretation:
    "이 문제는 회로 해석에 필요한 기본 원리인 키르히호프의 전압 법칙(KVL)과 키르히호프의 전류 법칙(KCL)을 설명하고, 이를 통해 회로의 전압과 전류를 분석하는 방법을 묻고 있다.",
  relatedConcepts: ["키르히호프의 전압 법칙", "키르히호프의 전류 법칙"],
  fillInTheBlanks: [],
  // ★ 실측: Vision이 예시 그림에서 소자를 뽑아도 **값은 비어 있다**(덤프 확인: 12개, 값 있는 소자 0개).
  componentInventory: [
    { id: "R1", type: "R" }, { id: "R2", type: "R" }, { id: "V1", type: "V" },
  ],
};
// 회귀 — 법칙 이름이 2개라도 도출 요구가 있으면 계산 문제다.
const calcTwoLaws = {
  topic: "회로 해석",
  interpretation: "키르히호프 전압 법칙과 중첩의 원리를 이용하여 10Ω에 흐르는 전류를 구하시오.",
  relatedConcepts: [], fillInTheBlanks: [], componentInventory: [{ type: "R", value: "10Ω" }],
};

// ★ 실측 실행 — interpretation이 **중첩의 원리의 정의**를 서술하며 "전류를 구하는"을 포함한다.
//   이건 요구가 아니라 정의다. 요구로 오판하면 개념 문항이 회로 계산으로 샌다(실측 1/5 실패 원인).
const runE = {
  topic: "회로 해석의 기본 원리와 법칙",
  interpretation:
    "이 문제는 회로 해석에 필요한 기본 원리와 법칙을 설명하고, 그 명칭을 쓰는 문제입니다. 첫 번째 원리는 회로의 임의의 폐경로 상의 전압의 대수적 합이 0이라는 키르히호프의 전압 법칙(KVL)입니다. 두 번째 원리는 독립 전원이 여러 개 있는 회로에서 각 전원이 단독으로 존재할 때의 전압이나 전류의 합으로 전체 전압이나 전류를 구하는 중첩의 원리입니다.",
  relatedConcepts: ["키르히호프의 전압 법칙", "중첩의 원리"], fillInTheBlanks: [],
  componentInventory: [{ id: "R1", type: "R" }, { id: "R2", type: "R" }], // 실측: 값 없음
};

// ★ 회귀(사용자 신고 2026-07-27) — 테브난 등가 + 최대 전력 **계산** 문제.
//   법칙 이름이 2개(테브난 정리·최대 전력 전달) 나오지만 수치가 주어진 계산 문제다.
//   개념형으로 가로채면 "원리 이름 쓰기" 문항이 생성된다(실제로 두 번 발생).
const theveninCalc = {
  topic: "테브난 등가 회로 해석",
  interpretation:
    "직류 전원들이 포함된 회로에서 단자 a와 b를 개방했을 때 테브난 등가 저항 R_Th와 테브난 등가 전압 V_Th를 구하고, 부하 저항 R_L에 최대 전력이 전달되도록 하는 R_L과 최대 전력을 구하는 문제이다.",
  relatedConcepts: ["테브난 정리", "최대 전력 전달", "등가 회로"],
  fillInTheBlanks: [],
  componentInventory: [
    { id: "V1", type: "V", value: "5V" }, { id: "V2", type: "V", value: "7V" },
    { id: "R1", type: "R", value: "3kΩ" }, { id: "R2", type: "R", value: "3kΩ" },
    { id: "R3", type: "R", value: "6kΩ" }, { id: "I1", type: "I", value: "2mA" },
  ],
};
// 수치가 인벤토리에 안 잡히고 본문에만 있는 실행도 계산 문제로 남아야 한다.
const theveninTextOnly = {
  topic: "테브난 등가 회로 해석",
  interpretation:
    "5V 전원과 3kΩ 저항이 포함된 회로에서 단자 a-b의 테브난 등가와 최대 전력 전달 조건을 다룬다.",
  relatedConcepts: ["테브난 정리", "최대 전력 전달"], fillInTheBlanks: [], componentInventory: [],
};

const cases = [
  ["[회귀 신고] 테브난+최대전력 계산 → 개념형 아님", isPrincipleNamingAnalysis(theveninCalc), false],
  ["[회귀 신고] 테브난+최대전력 → 회로 경로 유지", classifyCircuitType(theveninCalc, "circuit_theory")?.type !== "unsupported", true],
  ["[회귀] 수치가 본문에만 있어도 계산 문제", isPrincipleNamingAnalysis(theveninTextOnly), false],
  ["[실측 runE: 법칙 정의문에 '구하는' 포함] 개념형 판정", isPrincipleNamingAnalysis(runE), true],
  ["[실측 runE] 회로 archetype 아님", classifyCircuitType(runE, "circuit_theory")?.type, "unsupported"],
  ["[실측 runD: 소자 3개·값 없음] 개념형 판정", isPrincipleNamingAnalysis(runD), true],
  ["[실측 runD] 회로 archetype 아님", classifyCircuitType(runD, "circuit_theory")?.type, "unsupported"],
  ["[회귀] 법칙 2개+구하시오 → 개념형 아님", isPrincipleNamingAnalysis(calcTwoLaws), false],
  ["[신고 실행A] 개념형 판정", isPrincipleNamingAnalysis(runA), true],
  ["[신고 실행A] 회로 archetype 아님", classifyCircuitType(runA, "circuit_theory")?.type, "unsupported"],
  ["[재현 실행B: 문구·마커 전무] 개념형 판정", isPrincipleNamingAnalysis(runB), true],
  ["[재현 실행B] 회로 archetype 아님", classifyCircuitType(runB, "circuit_theory")?.type, "unsupported"],
  ["[실행C: 문구 있음] 개념형 판정", isPrincipleNamingAnalysis(runC), true],
  ["[실행C] 회로 archetype 아님", classifyCircuitType(runC, "circuit_theory")?.type, "unsupported"],
  ["개념 통합 판정(figure 면제)", isConceptNamingAnalysis(runB), true],
  ["[회귀] 중첩+전력 계산 → 개념형 아님", isPrincipleNamingAnalysis(calc), false],
  ["[회귀] 중첩+전력 계산 → 회로 경로 유지", classifyCircuitType(calc, "circuit_theory")?.type !== "unsupported", true],
  ["[회귀] 수치 없어도 '구하라' → 개념형 아님", isPrincipleNamingAnalysis(calcNoNum), false],
];
let pass = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${name} (실제=${got})`);
}
console.log(`${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
process.exit(pass === cases.length ? 0 : 1);
