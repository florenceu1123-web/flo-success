// rlc_resonance archetype 단독 smoke — generate 라우트의 직접 dispatch(series·parallel) 검증.
//
// ⚠️ classifier(analysis.circuitType 미지정 시 rlc_resonance로 분기하는지)는 여기서 검증하지 않는다.
//    generate 라우트는 분류를 수행하지 않고 analysis.circuitType.type만 읽어 dispatch한다
//    (분류는 api/analyze 단계의 책임). circuitType 미지정 + dummy image로 보내면 free GPT 경로로
//    빠져 OpenAI가 dummy를 거부(400)하므로, 분류 검증은 `smokeClassifyRlcResonance.mjs`가 전담한다.
//
// 사용: node scripts/smokeRlcResonance.mjs

const BASE = "http://localhost:3000/api/generate";

// 직접 dispatch — rlc_resonance · series · parallel
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
