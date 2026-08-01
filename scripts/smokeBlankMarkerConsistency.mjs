// 발문이 참조하는 빈칸 마커가 실제로 존재하는지 검증
//   신고("ㅁ이 없어"): 발문은 "괄호 안의 ㅇ, ㅁ에 해당하는 용어를 순서대로 쓰시오"인데
//   본문엔 ( ㅇ )만 있고 ㅁ가 어디에도 없어 답할 대상이 없는 문항이 생성됐다.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeBlankMarkerConsistency.mjs
import { validateProblem } from "../lib/validators/validateProblem.ts";

const ruleSet = { subject: "electronics", requiredFigureRoles: [], semantic: {} };
const base = (over) => ({
  problem: {
    id: "p1", topicKey: "diode",
    content: "다음은 반도체 소자에 대한 설명이다.",
    conditions: ["( ㅇ ) 다이오드는 초고주파 신호 정류에 사용된다."],
    question: "괄호 안의 ㅇ, ㅁ에 해당하는 용어를 순서대로 쓰시오.",
    answer: "쇼트키, 배리스터", solution: "",
    figureVariants: [],
    ...over,
  },
  expected: { subject: "electronics", topicKey: "diode", ruleSet },
});

const has = (res) => (res.issues ?? []).some((i) => i.rule === "blank_marker_missing");

const CASES = [
  { name: "[신고 재현] 발문의 ㅁ가 본문에 없음 → 잡혀야 함", args: base({}), expect: true },
  {
    name: "본문에 ㅇ·ㅁ 둘 다 있음 → 통과",
    args: base({ conditions: ["( ㅇ ) 다이오드는 …", "( ㅁ ) 다이오드는 …"] }),
    expect: false,
  },
  {
    name: "마커가 그림(표 셀) 안에 있음 → 통과 (dff_state_design 류)",
    args: base({
      conditions: [],
      question: "표 (나)의 ㉠~㉣에 해당하는 값을 구하시오.",
      figureVariants: [{
        id: "f1", label: "상태표", role: "state_table", diagramType: "truth_table",
        diagram: { headers: ["Q_A", "Q_B"], rows: [["㉠", "㉡"], ["㉢", "㉣"]] },
      }],
    }),
    expect: false,
  },
  {
    name: "도형 마커(○·□) — 발문의 □가 본문에 없음 → 잡혀야 함",
    args: base({
      conditions: ["( ○ ) 다이오드는 초고주파 정류에 사용된다."],
      question: "그림 (가)의 소자 기호를 보고 ○, □에 들어갈 용어를 쓰시오.",
    }),
    expect: true,
  },
  {
    name: "도형 마커(○·□) 둘 다 본문에 있음 → 통과",
    args: base({
      conditions: ["( ○ ) 다이오드는 …", "( □ )는 접합용량을 이용한다."],
      question: "그림 (가)의 소자 기호를 보고 ○, □에 들어갈 용어를 쓰시오.",
    }),
    expect: false,
  },
  {
    // 실측: 설명 항목은 ○ 하나뿐인데 답은 "PIN, 정류" 2개 — □는 지시문 문장에만 등장했다.
    name: "□가 지시문 문장에만 있고 설명엔 없음 → 잡혀야 함",
    args: base({
      content: "다음은 반도체 소자에 대한 설명이다. 괄호 안의 ○, □에 해당하는 용어를 순서대로 쓰시오.",
      conditions: ["○ 다이오드는 i층을 삽입해 고주파 스위칭에 유리하다."],
      question: "그림 (가)와 (나)의 소자 기호를 보고 ○, □에 들어갈 용어를 쓰시오.",
    }),
    expect: true,
  },
  {
    // 객관식 보기는 발문 안에서 마커가 선택지를 "정의"한다 — 본문에 없어도 정상.
    name: "객관식 보기(① 쇼트키 ② 제너 …) → 오탐 없이 통과",
    args: base({
      conditions: ["금속과 n형 반도체를 접합해 만든다."],
      question: "설명에 해당하는 소자로 옳은 것은? ① 쇼트키 다이오드 ② 제너 다이오드 ③ 터널 다이오드",
    }),
    expect: false,
  },
  {
    name: "참조형 ②(조사 뒤따름)가 본문에 없음 → 잡혀야 함",
    args: base({
      conditions: ["① 다이오드는 금속-반도체 접합을 이용한다."],
      question: "①과 ②에 들어갈 소자의 명칭을 각각 쓰시오.",
    }),
    expect: true,
  },
  {
    name: "마커 없는 일반 발문 → 통과",
    args: base({ conditions: [], question: "12Ω 저항에서 소비되는 전력 P를 구하시오." }),
    expect: false,
  },
];

let pass = 0;
for (const c of CASES) {
  const res = validateProblem(c.args);
  const got = has(res);
  const ok = got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}\n    blank_marker_missing=${got} (기대=${c.expect})`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
