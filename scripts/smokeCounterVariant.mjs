// counter_dac_comparator exam_variant smoke
async function test(mode) {
  const r = await fetch("http://localhost:3000/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: "dummy", subject: "mixed_signal", mode, count: 1, topicKey: "counter_dac_comparator",
      analysis: {
        topic: "카운터+DAC+비교기", interpretation: "임용 8번 mixed_signal", relatedConcepts: ["카운터","DAC","비교기"],
        fillInTheBlanks: [], subjectKey: "mixed_signal",
        circuitType: { type: "counter_dac_comparator", params: {}, confidence: "high", reasoning: "smoke" },
      },
    }),
  });
  const d = await r.json();
  const p = d.problems?.[0];
  const mixed = p?.figureVariants?.find((f) => f.role === "main_circuit");
  const logic = mixed?.diagram?.logic;
  const analog = mixed?.diagram?.analog;
  const jkCount = (logic?.gates ?? []).filter((g) => g.type === "JKFF").length;
  const rCount = (analog?.components ?? []).filter((c) => c.type === "R").length;
  console.log(`\n=== mode=${mode} ===`);
  console.log(`question: ${(p?.question ?? "").slice(0, 220)}...`);
  console.log(`answer:   ${(p?.answer ?? "").slice(0, 200)}...`);
  console.log(`JK 플립플롭 개수: ${jkCount}`);
  console.log(`R 저항 개수 (R-2R 사다리): ${rCount}`);
  console.log(`bridgeNodes: ${Object.keys(mixed?.diagram?.bridgeNodes ?? {}).join(", ")}`);
  console.log(`waveform signals: ${(p?.figureVariants?.find((f) => f.role === "waveform")?.diagram?.signals ?? []).map((s) => s.name).join(", ")}`);
  console.log(`issues: ${d.summary?.totalIssues}`);
}
await test("exam_similar");
await test("exam_variant");
