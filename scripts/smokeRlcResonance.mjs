// rlc_resonance archetype 단독 smoke — classifier 경로와 직접 dispatch 두 가지 모두 검증.
//
// 사용: node scripts/smokeRlcResonance.mjs

const BASE = "http://localhost:3000/api/generate";

// (A) classifier가 ac_superposition 대신 rlc_resonance로 분기하는지.
//    원본 임용 9번에 가까운 analysis payload — 단일 V, C+L, cos(ωt), 공진 키워드.
const CLASSIFIED = {
  image: "dummy",
  subject: "circuit_theory",
  mode: "exam_similar",
  count: 1,
  topicKey: "rlc_response",
  analysis: {
    topic: "RLC 직렬 공진",
    interpretation:
      "그림 (가)는 RLC 직렬 회로이고 그림 (나)는 v(t)의 주파수에 따른 전류 i(t)의 진폭 I[A] 곡선이다. " +
      "공진 주파수에서 최대 전류 Imax가 발생한다. v(t) = 10√2 cos(ωt)[V].",
    relatedConcepts: ["RLC 공진", "주파수응답", "f_0", "최대 전류"],
    fillInTheBlanks: [],
    subjectKey: "circuit_theory",
    topicKey: "rlc_response",
    semantic: { hasWaveformEvolution: false },
    componentInventory: [
      { id: "V1", type: "V", value: "10√2cos(ωt)V" },
      { id: "R1", type: "R", value: "1kΩ" },
      { id: "L1", type: "L", value: "2H" },
      { id: "C1", type: "C", value: "0.5μF" },
    ],
    // classifier가 직접 분류하도록 circuitType은 비움
    circuitType: undefined,
  },
};

// (B) 직접 dispatch — rlc_resonance · series · parallel
const DIRECT_SERIES = {
  image: "dummy",
  subject: "circuit_theory",
  mode: "exam_similar",
  count: 1,
  topicKey: "rlc_response",
  analysis: {
    topic: "RLC 직렬 공진 (direct)",
    interpretation: "direct dispatch test",
    relatedConcepts: [],
    fillInTheBlanks: [],
    subjectKey: "circuit_theory",
    circuitType: { type: "rlc_resonance", params: { rlcTopology: "series" }, confidence: "high", reasoning: "smoke" },
  },
};
const DIRECT_PARALLEL = {
  ...DIRECT_SERIES,
  analysis: {
    ...DIRECT_SERIES.analysis,
    topic: "RLC 병렬 공진 (direct)",
    circuitType: { type: "rlc_resonance", params: { rlcTopology: "parallel" }, confidence: "high", reasoning: "smoke" },
  },
};

const TESTS = [
  { name: "classifier→rlc_resonance (원본 임용 9번 시나리오)", body: CLASSIFIED },
  { name: "direct dispatch series",   body: DIRECT_SERIES },
  { name: "direct dispatch parallel", body: DIRECT_PARALLEL },
];

for (const t of TESTS) {
  console.log(`\n=== ${t.name} ===`);
  const start = Date.now();
  try {
    const r = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t.body),
    });
    const elapsed = Date.now() - start;
    console.log(`HTTP ${r.status}  (${elapsed}ms)`);
    if (!r.ok) {
      console.log(await r.text());
      continue;
    }
    const data = await r.json();
    const p = data.problems?.[0];
    if (!p) { console.log("no problem"); continue; }
    console.log(`figures: ${p.figureVariants?.map((f) => `${f.role}/${f.diagramType}`).join(" | ")}`);
    console.log(`content:  ${(p.content ?? "").slice(0, 200)}...`);
    console.log(`question: ${(p.question ?? "").slice(0, 280)}...`);
    console.log(`answer:   ${(p.answer ?? "").slice(0, 200)}...`);
    console.log(`issues: total=${data.summary?.totalIssues} solutionWarnings=${data.summary?.solutionWarnings}`);

    // 자체 점검 — 원본 패턴 핵심 어구
    const ok = [
      ["회로 figure 존재", p.figureVariants?.some((f) => f.role === "original_circuit")],
      ["공진곡선 figure 존재", p.figureVariants?.some((f) => f.role === "frequency_response_curve")],
      ["question에 [단계 1]", /\[단계\s*1\]/.test(p.question ?? "")],
      ["question에 [단계 2]", /\[단계\s*2\]/.test(p.question ?? "")],
      ["question에 정전용량", /정전용량|capacitance/.test(p.question ?? "")],
      ["question에 최대 전류|I_max|Imax", /최대\s*전류|I_max|Imax/.test(p.question ?? "")],
    ];
    for (const [label, pass] of ok) {
      console.log(`  ${pass ? "✓" : "✗"} ${label}`);
    }
  } catch (e) {
    console.log("ERROR:", e.message);
  }
}
