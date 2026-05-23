// bjt_characteristic_curve smoke — direct dispatch
const BASE = "http://localhost:3000/api/generate";

const BODY = {
  image: "dummy",
  subject: "electronics",
  mode: "exam_similar",
  count: 1,
  topicKey: "bjt_amplifier",
  analysis: {
    topic: "BJT 출력특성곡선 (I_C-V_CE) 영역 식별",
    interpretation: "여러 개의 I_B 값에 대한 V_CE 대 I_C 변화 곡선. ㉠ ㉡ 영역의 명칭과 스위칭 동작(ON/OFF)을 식별하는 개념·도식 해석형 문제.",
    relatedConcepts: ["BJT", "출력특성곡선", "포화 영역", "차단 영역", "활성 영역", "스위칭 동작"],
    fillInTheBlanks: [],
    subjectKey: "electronics",
    circuitType: {
      type: "bjt_characteristic_curve",
      params: {},
      confidence: "high",
      reasoning: "smoke",
    },
  },
};

const start = Date.now();
const r = await fetch(BASE, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(BODY),
});
const elapsed = Date.now() - start;
console.log(`HTTP ${r.status}  (${elapsed}ms)`);
if (!r.ok) {
  console.log(await r.text());
  process.exit(1);
}
const data = await r.json();
const p = data.problems?.[0];
if (!p) {
  console.log("no problem");
  process.exit(1);
}

console.log(`figures: ${p.figureVariants?.map((f) => `${f.role}/${f.diagramType}`).join(" | ")}`);
console.log(`content:  ${(p.content ?? "").slice(0, 220)}`);
console.log(`question: ${(p.question ?? "").slice(0, 280)}`);
console.log(`answer:   ${(p.answer ?? "").slice(0, 280)}`);
console.log(`solution: ${(p.solution ?? "").slice(0, 320)}`);
console.log(`issues: total=${data.summary?.totalIssues} solutionWarnings=${data.summary?.solutionWarnings}`);

const fig = p.figureVariants?.[0];
const diagram = fig?.diagram;
const checks = [
  ["figure 존재", Boolean(fig)],
  ["diagramType=characteristic_curve", fig?.diagramType === "characteristic_curve"],
  ["device 필드", diagram?.device === "bjt" || diagram?.device === "mosfet"],
  ["curves ≥ 5", Array.isArray(diagram?.curves) && diagram.curves.length >= 5],
  ["regions ≥ 2", Array.isArray(diagram?.regions) && diagram.regions.length >= 2],
  ["regions에 ㉠ ㉡", diagram?.regions?.some((r) => r.marker === "㉠") && diagram?.regions?.some((r) => r.marker === "㉡")],
  ["question에 영역", /영역/.test(p.question ?? "")],
  ["question에 ㉠ 또는 ㉡", /㉠|㉡/.test(p.question ?? "")],
  ["answer에 영역명 (포화|활성|차단|선형)", /(포화|활성|차단|선형)/.test(p.answer ?? "")],
  ["answer에 ON 또는 OFF", /(ON|OFF)/.test(p.answer ?? "")],
  ["totalIssues = 0", data.summary?.totalIssues === 0],
];
for (const [label, pass] of checks) console.log(`  ${pass ? "✓" : "✗"} ${label}`);
