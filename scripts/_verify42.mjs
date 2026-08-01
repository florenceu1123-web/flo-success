import { readFileSync } from "node:fs";
const img = readFileSync("C:/Users/USER/.claude/image-cache/100be0a6-5a8f-4d21-923b-b5411f0a0c15/42.png").toString("base64");
for (let run = 1; run <= 2; run++) {
  const a = await (await fetch("http://localhost:3000/api/analyze", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: img, subject: "circuit_theory" }),
  })).json();
  if (a.error) { console.log(`run${run} 분석 실패:`, a.error); continue; }
  console.log(`\n### run${run} topic="${a.topic}" 분류=${a.circuitType?.type}`);
  for (const mode of ["exam_similar", "exam_variant"]) {
    const d = await (await fetch("http://localhost:3000/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: img, subject: "circuit_theory", mode, count: 1, analysis: a }),
    })).json();
    const p = d.problems?.[0];
    const figs = (p?.figureVariants ?? []).map(f => f.diagramType);
    const isConcept = /이름을 순서대로|법칙의 이름/.test(String(p?.question));
    const ok = Boolean(p) && figs.length > 0 && !isConcept;
    console.log(`  ${ok ? "✓" : "✗"} ${mode} figs=[${figs.join(",")}] issues=${d.summary?.totalIssues ?? "-"}`);
    console.log(`      Q: ${String(p?.question).replace(/\s+/g," ").slice(0,110)}`);
    console.log(`      A: ${String(p?.answer).replace(/\s+/g," ").slice(0,90)}`);
  }
}
