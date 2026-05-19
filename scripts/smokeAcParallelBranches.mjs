// ac_parallel_branches smoke (임용 5번)
const r = await fetch("http://localhost:3000/api/generate", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    image: "dummy", subject: "circuit_theory", mode: "exam_similar", count: 1, topicKey: "nodal_analysis",
    analysis: {
      topic: "AC 다중 가지 (임용 5번)", interpretation: "교류 전원 + 다중 가지 병렬 phasor 해석",
      relatedConcepts: ["AC", "phasor", "KCL", "I_R1"],
      fillInTheBlanks: [], subjectKey: "circuit_theory",
      circuitType: { type: "ac_parallel_branches", params: {}, confidence: "high", reasoning: "smoke" },
    },
  }),
});
const d = await r.json();
const p = d.problems?.[0];
console.log(`figures: ${p?.figureVariants?.map((f) => `${f.role}/${f.diagramType}`).join(" | ")}`);
console.log(`question: ${(p?.question ?? "").slice(0, 320)}...`);
console.log(`answer:   ${(p?.answer ?? "").slice(0, 280)}...`);
console.log(`issues: total=${d.summary?.totalIssues} solWarn=${d.summary?.solutionWarnings}`);
const checks = [
  ["회로 figure", p?.figureVariants?.some((f) => f.role === "original_circuit")],
  ["[단계 1] V_C", /\[단계\s*1\]/.test(p?.question ?? "") && /V_C/.test(p?.question ?? "")],
  ["[단계 2] I_L2·I_S", /\[단계\s*2\]/.test(p?.question ?? "") && /I_L2/.test(p?.question ?? "") && /I_S/.test(p?.question ?? "")],
  ["[단계 3] i_R1(t)", /\[단계\s*3\]/.test(p?.question ?? "") && /i_R1|I_R1/.test(p?.question ?? "")],
  ["answer에 V_C·I_S·I_R1", /V_C/.test(p?.answer ?? "") && /I_S/.test(p?.answer ?? "") && /I_R1/.test(p?.answer ?? "")],
];
for (const [l, ok] of checks) console.log(`  ${ok ? "✓" : "✗"} ${l}`);
if (d.validations?.[0] && !d.validations[0].problem.ok) console.log("problem issues:", JSON.stringify(d.validations[0].problem.issues));
if (d.validations?.[0] && !d.validations[0].figures.ok) console.log("figure issues:", JSON.stringify(d.validations[0].figures.issues));
