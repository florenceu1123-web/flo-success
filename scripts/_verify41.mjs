import { readFileSync } from "node:fs";
const img = readFileSync("C:/Users/USER/.claude/image-cache/100be0a6-5a8f-4d21-923b-b5411f0a0c15/41.png").toString("base64");
const a = await (await fetch("http://localhost:3000/api/analyze", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image: img, subject: "circuit_theory" }),
})).json();
if (a.error) { console.log("ANALYZE 실패:", a.error); process.exit(1); }
console.log("topic:", a.topic, "| 분류:", a.circuitType?.type);
console.log("interp:", String(a.interpretation).replace(/\s+/g," ").slice(0,180));
for (const mode of ["exam_similar", "exam_variant"]) {
  const r = await fetch("http://localhost:3000/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: img, subject: "circuit_theory", mode, count: 1, analysis: a }),
  });
  const d = await r.json();
  console.log(`\n=== ${mode} http=${r.status} error=${d.error ?? "-"} issues=${d.summary?.totalIssues ?? "-"}`);
  const p = d.problems?.[0];
  if (p) {
    console.log("figs:", (p.figureVariants ?? []).map(f => f.diagramType).join(",") || "(없음)");
    console.log("Q:", String(p.question).replace(/\s+/g," ").slice(0,120));
  }
  for (const v of d.validations ?? []) for (const i of [...(v.problem?.issues ?? []), ...(v.figures?.issues ?? [])]) console.log("  이슈:", i.rule, i.message?.slice(0,100));
}
