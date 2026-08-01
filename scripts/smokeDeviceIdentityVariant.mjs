// 소자 종류 식별 개념형 — 변형유형이 "다른 종류의 소자"를 답으로 삼는지 확인
//   사용자 요청: "변형유형에는 다른 다이오드의 종류를 답으로 하는 문제도 만들어줘"
//   원본: ( ㅇ ) 다이오드 = 쇼트키(금속-반도체 접합, 고속 스위칭·초고주파 정류).
const analysis = {
  topic: "반도체 소자(다이오드)의 종류와 명칭",
  interpretation:
    "그림 (가)와 (나)는 어떤 다이오드의 구조와 기호이다. 설명을 읽고 괄호 안에 해당하는 소자의 명칭을 쓰는 문제. 설명: 초고주파 신호 정류와 고속 스위칭에 사용되며 n형 반도체와 금속을 접합해 만들고 소수 캐리어 축적 효과가 없어 빠르게 응답한다.",
  relatedConcepts: ["쇼트키 다이오드", "금속-반도체 접합", "고속 스위칭", "소수 캐리어", "반도체 소자"],
  fillInTheBlanks: [
    { sentence: "금속과 n형 반도체를 접합해 만든 다이오드의 명칭은 ____이다.", answer: "쇼트키 다이오드" },
  ],
  componentInventory: [{ type: "D", value: "" }],
  subjectKey: "electronics",
  circuitType: { type: "unsupported", params: {}, confidence: "low", reasoning: "개념형(소자 명칭)" },
};

import { readFileSync } from "node:fs";
const IMG = readFileSync("C:/Users/USER/.claude/image-cache/100be0a6-5a8f-4d21-923b-b5411f0a0c15/9.png").toString("base64");
const COUNT = 3;
const r = await fetch("http://localhost:3000/api/generate", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image: IMG, subject: "electronics", mode: "exam_variant", count: COUNT, topicKey: "diode", analysis }),
});
const d = await r.json();
console.log(`HTTP ${r.status} returned=${d.problems?.length ?? 0} issues=${d.summary?.totalIssues ?? "-"} err=${d.error ?? "-"}`);
const probs = d.problems ?? [];
(d.validations ?? []).forEach((v,i)=>{const all=[...(v.problem?.issues??[]),...(v.figures?.issues??[])];if(all.length)console.log(`    #${i} 검증이슈: ${all.map(x=>x.rule+": "+x.message).join(" | ")}`);});
const TYPES = ["쇼트키", "제너", "터널", "에사키", "바랙터", "버랙터", "pin", "발광", "led", "포토", "정류", "스텝", "건 다이오드", "gunn"];
const found = [];
for (const [i, p] of probs.entries()) {
  const ans = String(p.answer).replace(/\s+/g, " ");
  const hit = TYPES.filter((t) => ans.toLowerCase().includes(t));
  found.push(hit.join("+") || "(미확인)");
  console.log(`#${i} answer: ${ans.slice(0, 90)}`);
  console.log(`    종류=${hit.join(",") || "(미확인)"} | content: ${String(p.content).replace(/\s+/g, " ").slice(0, 80)}`);
}
const fails = [];
if (probs.length !== COUNT) fails.push(`문항 수 ${probs.length}≠${COUNT}`);
if (found.some((f) => f === "(미확인)")) fails.push("다이오드 종류를 식별할 수 없는 답 존재");
if (found.some((f) => f.includes("쇼트키"))) fails.push("원본과 같은 종류(쇼트키)를 답으로 재사용");
if (new Set(found).size !== found.length) fails.push(`종류 중복: ${found.join(" / ")}`);
console.log(fails.length === 0 ? "PASS — 서로 다른 종류의 다이오드가 답" : `FAIL — ${fails.join(" / ")}`);
process.exit(fails.length === 0 ? 0 : 1);
