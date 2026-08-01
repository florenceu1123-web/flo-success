import { readFileSync } from "node:fs";
const img = readFileSync("C:/Users/USER/.claude/image-cache/100be0a6-5a8f-4d21-923b-b5411f0a0c15/44.png").toString("base64");
let ok = 0, total = 0;
for (let run = 1; run <= 2; run++) {
  const a = await (await fetch("http://localhost:3000/api/analyze", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: img, subject: "digital_logic" }),
  })).json();
  if (a.error) { console.log(`run${run} 분석 실패:`, a.error); continue; }
  console.log(`\n### run${run} topic="${a.topic}" 분류=${a.circuitType?.type}`);
  for (const mode of ["exam_similar", "exam_variant"]) {
    total++;
    const d = await (await fetch("http://localhost:3000/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: img, subject: "digital_logic", mode, count: 1, analysis: a }),
    })).json();
    const p = d.problems?.[0];
    const figs = (p?.figureVariants ?? []).map(f => f.diagramType);
    // FF 개수 — logic_network diagram의 FF 노드 수
    let ffCount = 0, ffKinds = [];
    for (const f of p?.figureVariants ?? []) {
      const g = f.diagram;
      for (const n of (g?.gates ?? g?.nodes ?? [])) {
        const k = String(n.kind ?? n.gate ?? n.type ?? "");
        if (/FF|FLIPFLOP|^T$|^JK$|^D$/i.test(k)) { ffCount++; ffKinds.push(k); }
      }
    }
    const good = Boolean(p) && ffCount >= 2 && (d.summary?.totalIssues ?? 0) === 0;
    if (good) ok++;
    console.log(`  ${good ? "✓" : "✗"} ${mode} FF=${ffCount}(${ffKinds.join(",")}) figs=[${figs.join(",")}] issues=${d.summary?.totalIssues ?? "-"}`);
    console.log(`      Q: ${String(p?.question).replace(/\s+/g," ").slice(0,120)}`);
  }
}
console.log(`\n=== 성공률 ${ok}/${total} (FF 2개 이상 + 이슈 0) ===`);
