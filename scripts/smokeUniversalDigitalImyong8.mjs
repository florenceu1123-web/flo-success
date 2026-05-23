// universal_digital smoke — 임용 8번 (4-변수 4-함수 OR 결합) 시뮬레이션.
const BODY = {
  image: "dummy", subject: "digital_logic", mode: "exam_similar", count: 1, topicKey: "combinational_gate",
  analysis: {
    topic: "4-변수 boolean 함수 OR 결합",
    interpretation: "ABCD 4-변수 입력에 대해 f_1, f_2, f_3, f_4의 4개 boolean 함수를 K-map으로 표현하고, 이를 OR 결합하여 최종 출력 Z를 만든다. 각 함수의 최소 SOP를 구하고 Σm(...) 표기를 이용한다.",
    relatedConcepts: ["K-map", "최소 SOP", "Σm", "OR 결합", "최소합", "boolean 함수", "Karnaugh", "f_1", "f_2", "f_3", "f_4"],
    fillInTheBlanks: [
      { sentence: "[단계 1] f_1, f_2, f_3, f_4 각각의 최소 SOP를 구한다", answer: "" },
      { sentence: "[단계 2] Z = f_1 + f_2 + f_3 + f_4 (OR 결합)을 도출한다", answer: "" },
    ],
    subjectKey: "digital_logic",
    circuitType: { type: "universal_digital", params: {}, confidence: "high", reasoning: "smoke" },
    signals: { inputs: ["A", "B", "C", "D"], outputs: ["Z"] },
    semantic: { hasStateTransition: false, hasEquivalentTransformation: false, hasWaveformEvolution: false, requiresMultiFigure: true },
  },
};

const r = await fetch("http://localhost:3000/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(BODY),
});
console.log(`HTTP ${r.status}`);
if (!r.ok) { console.log(await r.text()); process.exit(1); }
const data = await r.json();
const p = data.problems?.[0];
console.log("answer:", (p?.answer ?? "").replace(/\n/g, " / "));
const figs = p?.figureVariants ?? [];
console.log(`figures: ${figs.length}`);
for (const f of figs) console.log(`  - ${f.role} (${f.diagramType}): ${f.label}`);

const checks = [
  ["problem returned", Boolean(p)],
  ["totalIssues = 0", data.summary?.totalIssues === 0],
  ["≥2 kmap figures", figs.filter(f => f.diagramType === "kmap").length >= 2],
  ["logic_network figure", figs.some(f => f.diagramType === "logic_network")],
  ["answer has [단계 1]", p?.answer?.includes("[단계 1]")],
];
for (const [label, ok] of checks) console.log(`  ${ok ? "✓" : "✗"} ${label}`);
