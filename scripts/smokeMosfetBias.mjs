// mosfet_bias smoke — direct dispatch
const BASE = "http://localhost:3000/api/generate";

const BODY = {
  image: "dummy",
  subject: "electronics",
  mode: "exam_similar",
  count: 1,
  topicKey: "mosfet_bias",
  analysis: {
    topic: "NMOS 포화 영역 DC bias",
    interpretation: "단일 NMOS, 포화 영역, I_D = K(V_GS - V_TH)²",
    relatedConcepts: ["NMOS", "포화 영역", "V_GS", "V_DS"],
    fillInTheBlanks: [],
    subjectKey: "electronics",
    circuitType: { type: "mosfet_bias", params: {}, confidence: "high", reasoning: "smoke" },
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
if (!p) { console.log("no problem"); process.exit(1); }
console.log(`figures: ${p.figureVariants?.map((f) => `${f.role}/${f.diagramType}`).join(" | ")}`);
console.log(`content:  ${(p.content ?? "").slice(0, 220)}...`);
console.log(`question: ${(p.question ?? "").slice(0, 280)}...`);
console.log(`answer:   ${(p.answer ?? "").slice(0, 220)}...`);
console.log(`issues: total=${data.summary?.totalIssues} solutionWarnings=${data.summary?.solutionWarnings}`);

const checks = [
  ["회로 figure 존재", p.figureVariants?.some((f) => f.role === "original_circuit")],
  ["question에 [단계 1]", /\[단계\s*1\]/.test(p.question ?? "")],
  ["question에 [단계 2]", /\[단계\s*2\]/.test(p.question ?? "")],
  ["question에 [단계 3]", /\[단계\s*3\]/.test(p.question ?? "")],
  ["question에 V_GS", /V_GS|V_{GS}|VGS/.test(p.question ?? "")],
  ["question에 V_DS|V_D", /V_DS|V_D|V_{DS}/.test(p.question ?? "")],
  ["question에 포화", /포화|saturation/.test(p.question ?? "")],
  ["answer에 V_GS·I_D·V_D 수치", /\d+\s*V/.test(p.answer ?? "") && /\d+\s*mA/.test(p.answer ?? "")],
];
for (const [label, pass] of checks) console.log(`  ${pass ? "✓" : "✗"} ${label}`);
