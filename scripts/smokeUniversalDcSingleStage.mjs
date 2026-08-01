// universal_dc — 단일 단계(특정 저항 소비전력만) 문제의 단계 번호 검증
//
//   회귀 대상: query가 resistorPower 하나뿐일 때 예전에는 "[단계 2]"부터 시작해
//   1단계가 없는 문제가 생성됐다(사용자 신고 "1단계가 없어").
//   → 실제로 존재하는 단계만 세어 1부터 번호를 매겨야 한다.
//
//   기대: answer·question 모두 "[단계 1]"로 시작, "[단계 2]" 없음.
const BODY = {
  image: "dummy",
  subject: "circuit_theory",
  mode: "exam_similar",
  count: 1,
  topicKey: "dc_resistive",
  analysis: {
    topic: "두 독립 전원 DC 회로의 특정 저항 소비전력",
    interpretation:
      "직류 전압원과 전류원이 함께 있는 저항 회로. 12Ω 저항에서 소비되는 전력 P를 구하는 문제.",
    relatedConcepts: ["DC", "전력", "노드해석"],
    fillInTheBlanks: [{ sentence: "12Ω 저항에서 소비되는 전력 P [W]를 구한다", answer: "" }],
    subjectKey: "circuit_theory",
    circuitType: { type: "universal_dc", params: {}, confidence: "high", reasoning: "smoke" },
    topologySignature: {
      subjectKey: "circuit_theory",
      family: "dc_resistive",
      features: { hasGround: true, hasMesh: true, meshCount: 2 },
      branches: [
        { role: "top_rail_resistor", components: [{ type: "R", value: "12Ω" }] },
        { role: "load_leg", components: [{ type: "R", value: "3Ω" }] },
        { role: "current_source_leg", components: [{ type: "I", value: "5A" }] },
        { role: "load_leg", components: [{ type: "R", value: "6Ω" }] },
        { role: "voltage_source_leg", components: [{ type: "V", value: "36V" }] },
      ],
    },
    nodeAnnotations: [],
  },
};

const r = await fetch("http://localhost:3000/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(BODY),
});
const data = await r.json();
console.log(`HTTP ${r.status}  issues: ${data.summary?.totalIssues}`);
const p = data.problems?.[0];
if (!p) {
  console.log("no problem generated:", JSON.stringify(data).slice(0, 400));
  process.exit(1);
}
console.log("question:", String(p.question).replace(/\n/g, " / "));
console.log("answer  :", String(p.answer).replace(/\n/g, " / "));
console.log("solution:", String(p.solution).replace(/\n/g, " / ").slice(0, 300));

const all = `${p.question}\n${p.answer}\n${p.solution}`;
const fail = [];
if (!/\[단계 1\]/.test(p.answer)) fail.push("answer에 [단계 1] 없음");
if (!/\[단계 1\]/.test(p.question)) fail.push("question에 [단계 1] 없음");
if (/\[단계 2\]/.test(all)) fail.push("존재하지 않는 [단계 2]가 등장");
console.log(fail.length === 0 ? "PASS — 단계 번호 1부터 연속" : `FAIL — ${fail.join(" / ")}`);
process.exit(fail.length === 0 ? 0 : 1);
