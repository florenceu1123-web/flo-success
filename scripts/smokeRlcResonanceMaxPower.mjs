// rlc_resonance_max_power smoke
const BASE = "http://localhost:3000/api/generate";

const BODY = {
  image: "dummy",
  subject: "circuit_theory",
  mode: "exam_similar",
  count: 4,
  topicKey: "rlc_response",
  analysis: {
    topic: "RLC 공진 + 최대 평균전력 (5R Wheatstone)",
    interpretation: "공진주파수에서 R_L에 전달되는 최대 평균전력을 구하는 회로. 점선 박스 내 5저항(4·18·12·8·6Ω) Wheatstone 등가저항 r_S 도출 후 R_L = r_S 조건 + P_max = V_rms²/(4·R_L) 도출.",
    relatedConcepts: ["공진주파수", "최대 평균전력", "R_L", "Wheatstone", "등가저항", "r_S", "X_L=X_C"],
    fillInTheBlanks: [],
    subjectKey: "circuit_theory",
    circuitType: { type: "rlc_resonance_max_power", params: {}, confidence: "high", reasoning: "smoke" },
  },
};

const start = Date.now();
const r = await fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY) });
console.log(`HTTP ${r.status}  (${Date.now() - start}ms)`);
if (!r.ok) { console.log(await r.text()); process.exit(1); }
const data = await r.json();
console.log(`problems: ${data.problems?.length}  issues: ${data.summary?.totalIssues}  solWarn: ${data.summary?.solutionWarnings}`);

for (const p of data.problems ?? []) {
  console.log("---");
  console.log("answer:", (p.answer ?? "").replace(/\n/g, " / "));
  console.log("figures:", p.figureVariants?.map(f => `${f.role}/${f.diagramType}`).join(" | "));
}

const checks = [
  ["4 problems", data.problems?.length === 4],
  ["totalIssues = 0", data.summary?.totalIssues === 0],
  ["distinct answers", new Set(data.problems?.map(p => p.answer)).size === data.problems?.length],
  ["[단계 1·2·3]", data.problems?.every(p => /\[단계\s*1\]/.test(p.question) && /\[단계\s*2\]/.test(p.question) && /\[단계\s*3\]/.test(p.question))],
  ["answer에 r_S·R_L·P_max", data.problems?.every(p => /r_S/.test(p.answer) && /R_L/.test(p.answer) && /P_max/.test(p.answer))],
  ["analog_netlist figure", data.problems?.every(p => p.figureVariants?.some(f => f.diagramType === "analog_netlist"))],
];
for (const [label, pass] of checks) console.log(`  ${pass ? "✓" : "✗"} ${label}`);
