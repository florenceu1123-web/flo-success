// 개념 소문항(원리 명칭 쓰기) 감지 — 실제 Vision 출력 기반 판별 테스트
//
//   회귀 대상: 원본(임용 전기 A-3류)은 "(가)의 원리에 해당하는 명칭을 쓰고 … 12Ω 전력 P"인데
//   생성된 문제가 전력만 물었다(사용자 신고). 원인은 Vision이 "명칭"이라는 단어를 안 쓰고
//   "이 원리는 ____이다"로 의역해 감지기가 놓친 것.
//
//   ★ 케이스 1·2는 /api/analyze가 실제로 뱉은 텍스트 그대로다(로그·재현 실행에서 채취).
//   ★ 케이스 3·4는 오탐 방지 — 원리 설명이 없는 평범한 회로 문제.
import { inferDcConceptLead } from "../lib/generation/topologyDriven/inferDcQueries.ts";

const CASES = [
  {
    name: "실측 Vision 출력 (명칭 단어 없이 의역)",
    expect: "중첩의 원리",
    analysis: {
      topic: "회로 해석 원리와 전력 계산",
      interpretation:
        "이 문제는 회로 해석의 원리를 설명하고, 주어진 회로에서 특정 저항에서의 전력을 계산하는 문제입니다. (가)는 중첩의 원리를 설명하고 있으며, (나) 회로는 두 개의 독립 전원을 포함하고 있습니다. 중첩의 원리를 사용하여 12Ω 저항에서 소모되는 전력을 계산해야 합니다.",
      relatedConcepts: ["중첩의 원리", "독립 전원", "전력 계산", "저항", "전압원"],
      fillInTheBlanks: [
        {
          sentence:
            "여러 개의 독립 전원이 있는 회로에서 특정 소자에서의 전압이나 전류는 각 독립 전원이 단독으로 존재할 때 구한 값의 합과 같다. 이 원리는 ____이다.",
          answer: "중첩의 원리",
        },
        { sentence: "중첩의 원리를 사용하여 12Ω 저항에서 소모되는 전력을 ____로 계산한다.", answer: "P[W]" },
      ],
    },
  },
  {
    name: "원문 그대로 '명칭을 쓰고'가 보존된 경우",
    expect: "중첩의 원리",
    analysis: {
      topic: "중첩의 원리와 전력",
      interpretation: "(가)의 원리에 해당하는 명칭을 쓰고, (나) 회로의 12Ω에서 소모되는 전력 P를 구하는 문제.",
      relatedConcepts: ["중첩의 원리"],
      fillInTheBlanks: [],
    },
  },
  {
    name: "실측 Vision 출력 2 — 정답이 '중첩'뿐이고 종류어는 문장에 남은 형태",
    expect: "중첩의 원리",
    analysis: {
      topic: "회로 해석 원리와 전력 계산",
      interpretation:
        "(가)에서는 회로 해석의 원리를 설명하며, (나)에서는 두 개의 독립 전원을 가진 직류 회로가 주어집니다. 12Ω 저항에서 소모되는 전력을 계산해야 합니다.",
      relatedConcepts: ["독립 전원", "전력 계산"],
      fillInTheBlanks: [
        {
          sentence:
            "여러 개의 독립 전원이 있는 회로에서 특정 소자에서의 전압이나 전류는 각 독립 전원이 단독으로 존재할 때 구한 값의 합과 같다. 이 원리는 ____의 원리이다.",
          answer: "중첩",
        },
        { sentence: "12Ω 저항에서 소모되는 전력 P[W]를 ____로 구한다.", answer: "P[W]" },
      ],
    },
  },
  {
    name: "다른 원리(정리)도 이름 그대로 인식",
    expect: "테브난의 정리",
    analysis: {
      topic: "등가회로",
      interpretation: "(가)는 등가회로 변환 정리를 설명한다. (나) 회로의 단자 a-b 등가를 구하는 문제.",
      relatedConcepts: ["등가회로"],
      fillInTheBlanks: [{ sentence: "이 정리는 ____이다.", answer: "테브난의 정리" }],
    },
  },
  {
    name: "오탐 방지 — 학습용 빈칸에 법칙 이름만 있는 평범한 회로 문제",
    expect: null,
    analysis: {
      topic: "직류 회로 해석",
      interpretation: "저항 3개와 전압원으로 구성된 회로에서 V_1과 전체 전류를 구하는 문제.",
      relatedConcepts: ["직류", "저항"],
      fillInTheBlanks: [
        { sentence: "전압과 전류의 관계는 ____로 표현된다.", answer: "옴의 법칙" },
        { sentence: "폐회로의 전압 합은 0이다 — ____", answer: "키르히호프의 전압 법칙" },
      ],
    },
  },
  {
    name: "오탐 방지 — 원리 언급이 아예 없는 경우",
    expect: null,
    analysis: {
      topic: "전력 계산",
      interpretation: "12Ω 저항에서 소비되는 전력 P를 구하는 문제.",
      relatedConcepts: ["전력"],
      fillInTheBlanks: [],
    },
  },
];

let pass = 0;
for (const c of CASES) {
  const got = inferDcConceptLead(c.analysis)?.principleName ?? null;
  const ok = got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${c.name}\n    기대=${c.expect ?? "(none)"}  실제=${got ?? "(none)"}`);
}
console.log(`${pass}/${CASES.length} ${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
