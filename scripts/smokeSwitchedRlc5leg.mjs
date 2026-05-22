// switched_rlc_5leg smoke (임용 9번 원본 정확 재현)
const BASE = "http://localhost:3000/api/generate";

const BODY = {
  image: "dummy",
  subject: "circuit_theory",
  mode: "exam_similar",
  count: 1,
  topicKey: "rlc_response",
  analysis: {
    topic: "Switched RLC 5-leg (임용 9번)",
    interpretation: "t=0에 SW가 A→B 전환되는 6-leg RLC 회로",
    relatedConcepts: ["RLC", "SPDT", "초기조건", "2차 미분방정식"],
    fillInTheBlanks: [],
    subjectKey: "circuit_theory",
    circuitType: { type: "switched_rlc_5leg", params: {}, confidence: "high", reasoning: "smoke" },
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
console.log(`question: ${(p.question ?? "").slice(0, 300)}...`);
console.log(`answer:   ${(p.answer ?? "").slice(0, 280)}...`);
console.log(`issues: total=${data.summary?.totalIssues} solWarn=${data.summary?.solutionWarnings}`);

const checks = [
  ["회로 figure", p.figureVariants?.some((f) => f.role === "original_circuit")],
  ["state_before·state_after figure", p.figureVariants?.some((f) => f.role === "state_before") && p.figureVariants?.some((f) => f.role === "state_after")],
  // v_C(t) waveform은 단계 3의 학생 도출 정답이므로 figure로 노출하지 않는 것이 사양(학습 의도 보존).
  // → waveform figure가 "없어야" 통과. (step v1과 달리 5leg는 state_before/after로 대체)
  ["v_C(t) waveform 의도적 부재", !p.figureVariants?.some((f) => f.diagramType === "waveform" || f.role === "output_waveform")],
  ["[단계 1]", /\[단계\s*1\]/.test(p.question ?? "")],
  ["[단계 2]", /\[단계\s*2\]/.test(p.question ?? "")],
  ["[단계 3]", /\[단계\s*3\]/.test(p.question ?? "")],
  ["question에 v_C(0⁻)·i_L(0⁻)", /v_C\(0|vc\(0/i.test(p.question ?? "") && /i_L\(0|il\(0/i.test(p.question ?? "")],
  ["question에 dv_C/dt", /dv_?[Cc]/.test(p.question ?? "")],
  ["question에 2차 미분 + v_C(t)", /2차\s*미분|미분\s*방정식/.test(p.question ?? "") && /v_?C\(t/i.test(p.question ?? "")],
];
for (const [label, pass] of checks) console.log(`  ${pass ? "✓" : "✗"} ${label}`);
if (data.validations?.[0] && !data.validations[0].figures.ok) {
  console.log("\nfigure issues:", JSON.stringify(data.validations[0].figures.issues));
}
