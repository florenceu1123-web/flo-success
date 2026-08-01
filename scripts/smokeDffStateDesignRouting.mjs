// D-FF 2개 상태도 순서회로 설계(임용 9번 정보과) 라우팅 판별 테스트
//
//   사용자 신고: 원본인데 "다른 문제가 생성돼"(이전엔 됐었다).
//   실측 원인: Vision이 relatedConcepts에 ★"Mealy 머신"★을 개념 태그로 붙이면
//   분류기의 Mealy 양보 가드(bare "mealy" 매칭)가 발화 → 주 분기·안전망 둘 다 포기 →
//   generic fsm이 가져가 ★있지도 않은 입력 X★가 있는 Mealy 문제로 변질(실측 3/3).
//   → 양보 근거를 "실제 외부 입출력(입력 X·출력 Z/y)"으로 좁혔다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeDffStateDesignRouting.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";

const mk = (topic, interpretation, concepts = [], blanks = []) => ({
  topic,
  interpretation,
  relatedConcepts: concepts,
  fillInTheBlanks: blanks.map((s) => ({ sentence: s, answer: "" })),
  componentInventory: [],
});

const CASES = [
  {
    name: "[신고 재현] 실측 Vision 출력 — relatedConcepts에 'Mealy 머신' 태그",
    expect: "dff_state_design",
    a: mk(
      "상태 전이도와 D 플립플롭",
      "이 문제는 상태 전이도를 기반으로 D 플립플롭을 사용하여 순차 회로를 설계하는 문제입니다. 주어진 상태 전이도와 상태표를 통해 플립플롭의 입력과 출력 상태를 결정하고, 이를 바탕으로 논리 회로를 구성해야 합니다.",
      ["상태 전이도", "D 플립플롭", "상태표", "순차 회로", "논리 게이트", "Mealy 머신", "논리 회로 설계"],
      ["상태표에서 ㉠, ㉡, ㉢, ㉣에 들어갈 다음 상태를 구하시오.", "논리 회로에서 ㉮, ㉯에 들어갈 게이트를 구하시오."],
    ),
  },
  {
    name: "Mealy 태그 없는 정상 요약",
    expect: "dff_state_design",
    a: mk(
      "D 플립플롭을 이용한 순서 논리 회로 설계",
      "상태도(가)와 상태표(나)를 이용해 D 플립플롭 2개와 논리 게이트로 순서 논리 회로를 설계하는 문제.",
      ["D 플립플롭", "상태도", "상태표", "논리 게이트"],
      ["표 (나)의 ㉠~㉣을 구하시오."],
    ),
  },
  {
    name: "'D 플립플롭' 단어 누락 (안전망 분기)",
    expect: "dff_state_design",
    a: mk(
      "상태 전이도와 상태표 분석",
      "주어진 상태 전이도를 상태표로 옮기고, 플립플롭의 입력을 구해 논리 게이트로 순서 논리 회로를 설계한다.",
      ["상태 전이도", "상태표", "플립플롭", "논리 게이트 설계"],
      ["상태표의 빈칸을 채우고 게이트를 구하시오."],
    ),
  },
  // ── 회귀 — 진짜 Mealy FSM은 계속 fsm이어야 한다.
  {
    name: "[회귀] 진짜 Mealy FSM (입력 X·출력 Z 명시)",
    expect: "fsm",
    a: mk(
      "Mealy 순차회로 상태도 설계",
      "입력 X와 출력 Z를 갖는 Mealy 순차회로의 상태도와 상태표가 주어졌을 때, 플립플롭 입력과 출력 논리식을 구하고 회로를 설계한다.",
      ["Mealy 머신", "상태도", "입력 X", "출력 Z", "D 플립플롭"],
      ["입력 X에 대한 출력 Z의 논리식을 구하시오."],
    ),
  },
  {
    name: "[회귀] JK 플립플롭 상태도 (dff_state_design 아님)",
    expectNot: "dff_state_design",
    a: mk(
      "JK 플립플롭 상태도 설계",
      "JK 플립플롭 2개를 사용하여 주어진 상태도의 순차 회로를 설계한다. 상태표와 여기표를 이용해 J·K 입력을 구한다.",
      ["JK 플립플롭", "상태도", "여기표", "논리 게이트"],
      [],
    ),
  },
  {
    name: "[회귀] SR-FF + 2×1 MUX (형제 archetype)",
    expectNot: "dff_state_design",
    a: mk(
      "SR 플립플롭과 멀티플렉서를 이용한 순서회로",
      "SR 플립플롭 2개와 2×1 멀티플렉서 4개로 상태 순환 순서회로를 설계한다. 선택선과 데이터 입력을 구한다.",
      ["SR 플립플롭", "멀티플렉서", "상태표", "순차 회로"],
      [],
    ),
  },
];

let pass = 0;
for (const c of CASES) {
  const got = classifyCircuitType(c.a, "digital_logic")?.type;
  const ok = c.expectNot ? got !== c.expectNot : got === c.expect;
  if (ok) pass++;
  console.log(
    `${ok ? "✓" : "✗"} ${c.name}\n    ${c.expectNot ? `기대≠${c.expectNot}` : `기대=${c.expect}`}  실제=${got}`,
  );
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
