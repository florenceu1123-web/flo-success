// mux_implementation smoke — count=3 라운드로빈 확인
const BASE = "http://localhost:3000/api/generate";

const BODY = {
  image: "dummy",
  subject: "digital_logic",
  mode: "exam_similar",
  count: 3,
  topicKey: "combinational_gate",
  analysis: {
    topic: "조합논리회로 ↔ 4×1 MUX 등가구현",
    interpretation: "(가) 3 NOT + 3 OR(2-input) + 1 AND으로 F(A,B,C) 산출, (나) 4×1 MUX 선택선 S_1=A, S_0=B, I_0=㉠ 및 I_1=㉡ 학생 도출",
    relatedConcepts: ["MUX", "멀티플렉서", "POS", "SOP", "선택선", "S_1", "S_0", "I_0", "I_1", "조합논리회로"],
    fillInTheBlanks: [],
    subjectKey: "digital_logic",
    circuitType: { type: "mux_implementation", params: {}, confidence: "high", reasoning: "smoke" },
  },
};

const start = Date.now();
const r = await fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY) });
const elapsed = Date.now() - start;
console.log(`HTTP ${r.status}  (${elapsed}ms)`);
if (!r.ok) { console.log(await r.text()); process.exit(1); }
const data = await r.json();
console.log(`problems: ${data.problems?.length}  issues: ${data.summary?.totalIssues}  solutionWarnings: ${data.summary?.solutionWarnings}`);

for (const p of data.problems ?? []) {
  const gar = p.figureVariants?.find(f => f.diagramType === "logic_network");
  const na = p.figureVariants?.find(f => f.diagramType === "mux_diagram");
  const muxIns = na?.diagram?.inputs?.map(inp => `${inp.pinLabel}=${inp.blank ? inp.blankMarker : inp.value}`).join(", ");
  console.log("---");
  console.log(`(가) gates: ${gar?.diagram?.gates?.map(g => `${g.id}:${g.type}`).join(", ")}`);
  console.log(`(나) ${na?.diagram?.caption}, selectors: ${na?.diagram?.selectors?.high?.pinLabel}=${na?.diagram?.selectors?.high?.signal}, ${na?.diagram?.selectors?.low?.pinLabel}=${na?.diagram?.selectors?.low?.signal}`);
  console.log(`(나) inputs: ${muxIns}`);
  console.log(`answer: ${(p.answer ?? "").replace(/\n/g, " / ")}`);
}

const checks = [
  ["3 problems returned", data.problems?.length === 3],
  ["totalIssues = 0", data.summary?.totalIssues === 0],
  ["each problem has 2 figures", data.problems?.every(p => p.figureVariants?.length === 2)],
  ["each has logic_network + mux_diagram", data.problems?.every(p => {
    const types = p.figureVariants?.map(f => f.diagramType);
    return types?.includes("logic_network") && types?.includes("mux_diagram");
  })],
  ["distinct answers (no dup)", new Set(data.problems?.map(p => p.answer)).size === data.problems?.length],
  ["question has [단계 1·2·3]", data.problems?.every(p => /\[단계\s*1\]/.test(p.question) && /\[단계\s*2\]/.test(p.question) && /\[단계\s*3\]/.test(p.question))],
  ["answer mentions ㉠, ㉡", data.problems?.every(p => /㉠/.test(p.answer) && /㉡/.test(p.answer))],
];
for (const [label, pass] of checks) console.log(`  ${pass ? "✓" : "✗"} ${label}`);
