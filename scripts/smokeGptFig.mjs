const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const base = process.env.BASE ?? "http://localhost:3000";
const analysis = {
  topic: "JK 플립플롭 동기식 카운터",
  interpretation: "JK 플립플롭 3개를 이용한 동기식 카운터의 동작을 클럭 펄스에 따른 타이밍 도표로 분석한다.",
  relatedConcepts: ["JK 플립플롭", "동기식 카운터", "타이밍 다이어그램", "상태 변화", "클럭 펄스"],
  topicKey: "flipflop_counter",
};
const res = await fetch(`${base}/api/generate`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ image: PNG, subject: "digital_logic", mode: "gpt_generated", count: 2, analysis }),
});
const j = await res.json();
console.log("HTTP", res.status, "| summary:", JSON.stringify(j.summary));
(j.problems ?? []).forEach((p, i) => {
  console.log(`\n--- Q${i + 1} ---`);
  console.log("content:", (p.content ?? "").slice(0, 100));
  console.log("question:", (p.question ?? "").replace(/\n/g, " ").slice(0, 100));
  console.log("figures:", (p.figureVariants ?? []).map((f) => f.diagramType).join(", ") || "(없음)");
  const wf = (p.figureVariants ?? []).find((f) => f.diagramType === "waveform");
  if (wf) console.log("  waveform signals:", wf.diagram.signals.map((s) => `${s.name}[${s.samples.length}]`).join(", "));
  const tt = (p.figureVariants ?? []).find((f) => f.diagramType === "truth_table");
  if (tt) console.log("  truth_table:", JSON.stringify(tt.diagram.variables), "rows", tt.diagram.rows.length);
});
