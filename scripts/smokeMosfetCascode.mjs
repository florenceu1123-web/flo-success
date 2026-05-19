// mosfet_cascode_mirror smoke
const BASE = "http://localhost:3000/api/generate";

const BODY = {
  image: "dummy",
  subject: "electronics",
  mode: "exam_similar",
  count: 1,
  topicKey: "mosfet_bias",
  analysis: {
    topic: "NMOS cascode current mirror (임용 10번)",
    interpretation: "M1 reference, M2 mirror, M3 cascode + R 학생 도출",
    relatedConcepts: ["cascode", "current mirror", "M1", "M2", "M3"],
    fillInTheBlanks: [],
    subjectKey: "electronics",
    circuitType: { type: "mosfet_cascode_mirror", params: {}, confidence: "high", reasoning: "smoke" },
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
if (!r.ok) { console.log(await r.text()); process.exit(1); }
const data = await r.json();
const p = data.problems?.[0];
if (!p) { console.log("no problem"); process.exit(1); }
console.log(`figures: ${p.figureVariants?.map((f) => `${f.role}/${f.diagramType}`).join(" | ")}`);
console.log(`content:  ${(p.content ?? "").slice(0, 280)}...`);
console.log(`question: ${(p.question ?? "").slice(0, 320)}...`);
console.log(`answer:   ${(p.answer ?? "").slice(0, 240)}...`);
console.log(`solution: ${(p.solution ?? "").slice(0, 400)}...`);
console.log(`issues: total=${data.summary?.totalIssues}, solWarn=${data.summary?.solutionWarnings}`);

const checks = [
  ["회로 figure", p.figureVariants?.some((f) => f.role === "original_circuit")],
  ["[단계 1]", /\[단계\s*1\]/.test(p.question ?? "")],
  ["[단계 2]", /\[단계\s*2\]/.test(p.question ?? "")],
  ["[단계 3]", /\[단계\s*3\]/.test(p.question ?? "")],
  ["question에 V_GS1·R", /V_GS1|VGS1/.test(p.question ?? "") && /R\[/.test(p.question ?? "")],
  ["question에 V_D2", /V_D2|VD2/.test(p.question ?? "")],
  ["question에 V_GS3 + V_S3", /V_GS3|VGS3/.test(p.question ?? "") && /V_S3|VS3/.test(p.question ?? "")],
  ["answer에 mA + kΩ + V 수치", /mA|kΩ/.test(p.answer ?? "") && /\dV/.test(p.answer ?? "")],
];
for (const [label, pass] of checks) console.log(`  ${pass ? "✓" : "✗"} ${label}`);
console.log("\nvalidations:", JSON.stringify(data.validations?.[0], null, 2));
