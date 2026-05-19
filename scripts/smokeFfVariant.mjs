// ff_with_waveform exam_variant smoke
async function test(mode) {
  const r = await fetch("http://localhost:3000/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: "dummy", subject: "digital_logic", mode, count: 1, topicKey: "flipflop_counter",
      analysis: {
        topic: "FF+파형 (임용 8번)", interpretation: "D-FF 응용", relatedConcepts: ["FF","XOR"],
        fillInTheBlanks: [], subjectKey: "digital_logic",
        circuitType: { type: "ff_with_waveform", params: {}, confidence: "high", reasoning: "smoke" },
      },
    }),
  });
  const d = await r.json();
  const p = d.problems?.[0];
  const impl = p?.figureVariants?.find((f) => f.role === "implementation_circuit");
  const gates = (impl?.diagram?.gates ?? []).map((g) => `${g.id}(${g.type})`).join(", ");
  console.log(`\n=== mode=${mode} ===`);
  console.log(`question: ${(p?.question ?? "").slice(0, 200)}...`);
  console.log(`answer:   ${(p?.answer ?? "").slice(0, 200)}...`);
  console.log(`gates: ${gates}`);
  const hasXOR = gates.includes("XOR");
  const hasTFF = gates.includes("TFF");
  const hasDFF = gates.includes("DFF");
  console.log(`  XOR 게이트: ${hasXOR ? "✓" : "✗"}`);
  console.log(`  TFF: ${hasTFF ? "✓" : "✗"} / DFF: ${hasDFF ? "✓" : "✗"}`);
  console.log(`  issues: ${d.summary?.totalIssues}`);
}
await test("exam_similar");
await test("exam_variant");
