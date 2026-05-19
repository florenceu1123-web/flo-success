// switched_rlc_step smoke
const BASE = "http://localhost:3000/api/generate";

const BODY = {
  image: "dummy",
  subject: "circuit_theory",
  mode: "exam_similar",
  count: 1,
  topicKey: "rlc_response",
  analysis: {
    topic: "Switched RLC step response (임용 9번)",
    interpretation: "t=0에 SW가 A에서 B로 전환되는 RLC 회로. t<0 직류 정상상태, t≥0 자연+강제응답.",
    relatedConcepts: ["RLC", "스위치", "초기조건", "2차 미분방정식", "v_C(t)"],
    fillInTheBlanks: [],
    subjectKey: "circuit_theory",
    circuitType: { type: "switched_rlc_step", params: {}, confidence: "high", reasoning: "smoke" },
  },
};

const start = Date.now();
const r = await fetch(BASE, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY),
});
const elapsed = Date.now() - start;
console.log(`HTTP ${r.status}  (${elapsed}ms)`);
if (!r.ok) { console.log(await r.text()); process.exit(1); }
const data = await r.json();
const p = data.problems?.[0];
if (!p) { console.log("no problem"); process.exit(1); }
console.log(`figures: ${p.figureVariants?.map((f) => `${f.role}/${f.diagramType}`).join(" | ")}`);
console.log(`content:  ${(p.content ?? "").slice(0, 220)}...`);
console.log(`question: ${(p.question ?? "").slice(0, 320)}...`);
console.log(`answer:   ${(p.answer ?? "").slice(0, 260)}...`);
console.log(`issues: total=${data.summary?.totalIssues} solWarn=${data.summary?.solutionWarnings}`);

const checks = [
  ["회로 figure", p.figureVariants?.some((f) => f.role === "original_circuit")],
  ["v_C(t) waveform figure", p.figureVariants?.some((f) => f.role === "output_waveform" && f.diagramType === "waveform")],
  ["[단계 1]", /\[단계\s*1\]/.test(p.question ?? "")],
  ["[단계 2]", /\[단계\s*2\]/.test(p.question ?? "")],
  ["[단계 3]", /\[단계\s*3\]/.test(p.question ?? "")],
  ["question에 v_C(0⁻)·i_L(0⁻)", /v_C\(0|vc\(0/i.test(p.question ?? "") && /i_L\(0|il\(0/i.test(p.question ?? "")],
  ["question에 dv_C", /dv_?[Cc]/.test(p.question ?? "")],
  ["question에 2차 미분방정식 + v_C(t)", /2차\s*미분|미분\s*방정식/.test(p.question ?? "") && /v_?C\(t/i.test(p.question ?? "")],
];
for (const [label, pass] of checks) console.log(`  ${pass ? "✓" : "✗"} ${label}`);
if (data.validations?.[0] && !data.validations[0].problem.ok) {
  console.log("\nproblem issues:", JSON.stringify(data.validations[0].problem.issues));
}
if (data.validations?.[0] && !data.validations[0].figures.ok) {
  console.log("\nfigure issues:", JSON.stringify(data.validations[0].figures.issues));
}
