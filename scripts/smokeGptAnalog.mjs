const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const base = process.env.BASE ?? "http://localhost:3000";
const analysis = {
  topic: "2 교류전원 RLC 회로 페이저 해석 (중첩)",
  interpretation: "2개의 교류 전원(전압원·전류원)이 포함된 R·L·C 회로를 주파수 영역(페이저)에서 중첩의 원리로 해석한다.",
  relatedConcepts: ["페이저", "중첩의 원리", "임피던스", "RLC 회로", "교류 전원"],
  topicKey: "rlc_response",
};
const res = await fetch(`${base}/api/generate`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ image: PNG, subject: "circuit_theory", mode: "gpt_generated", count: 3, analysis }),
});
const j = await res.json();
console.log("HTTP", res.status, "| summary:", JSON.stringify(j.summary));
(j.problems ?? []).forEach((p, i) => {
  console.log(`\n--- Q${i + 1} ---`);
  console.log("content:", (p.content ?? "").slice(0, 90));
  console.log("figures:", (p.figureVariants ?? []).map((f) => f.diagramType).join(", ") || "(없음)");
  const c = (p.figureVariants ?? []).find((f) => f.diagramType === "analog_netlist");
  if (c) console.log("  components:", c.diagram.components.map((x) => `${x.id}:${x.type}[${x.pins.map((pp) => pp.node).join("-")}]`).join(", "), "| ground:", c.diagram.ground);
});
