// 사용자 실패 재현: stale/오분류 circuitType이 담긴 analysis로 generate → 안전망이 교정하는가?
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const base = process.env.BASE ?? "http://localhost:3000";

// JK 카운터 텍스트인데 circuitType은 옛 sequential_dff_generic (수정 전 분석 결과 모사)
const staleAnalysis = {
  topic: "JK 플립플롭 동기식 카운터",
  interpretation: "JK 플립플롭 3개를 이용한 동기식 카운터 회로의 동작을 타이밍 다이어그램으로 분석한다.",
  relatedConcepts: ["JK 플립플롭", "동기식 카운터", "타이밍 다이어그램", "클럭 펄스", "상태 변화"],
  topicKey: "flipflop_counter",
  circuitType: { type: "sequential_dff_generic", params: {}, confidence: "high", reasoning: "stale" },
  semantic: { hasStateTransition: true, hasEquivalentTransformation: false, hasWaveformEvolution: true, requiresMultiFigure: true },
  signals: { inputs: [], outputs: ["Q2", "Q1", "Q0"] },
  componentInventory: [],
};

// 케이스 A: 올바른 과목(digital_logic)인데 circuitType stale
// 케이스 B: 과목 오선택(mixed_signal)
for (const subject of ["digital_logic", "mixed_signal"]) {
  const res = await fetch(`${base}/api/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: PNG, subject, mode: "exam_similar", count: 1, analysis: staleAnalysis }),
  });
  const j = await res.json();
  console.log(`\n== subject=${subject} (HTTP ${res.status}) ==`);
  if (!res.ok) { console.log("ERR:", j.error); continue; }
  const p = j.problems?.[0];
  const figs = (p?.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(", ");
  const isJk = (p?.content ?? "").includes("JK 플립플롭") && (p?.content ?? "").includes("카운터");
  console.log("summary:", JSON.stringify(j.summary));
  console.log("content head:", (p?.content ?? "").slice(0, 70));
  console.log("figures:", figs);
  console.log("→ JK 카운터로 교정?", isJk ? "YES ✅" : "NO ✗");
}
