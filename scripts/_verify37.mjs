import { readFileSync } from "node:fs";
import { isConceptNamingAnalysis, deviceIdentityTextOf } from "../lib/analysis/deviceIdentity.ts";
const img = readFileSync("C:/Users/USER/.claude/image-cache/100be0a6-5a8f-4d21-923b-b5411f0a0c15/37.png").toString("base64");
const N = Number(process.argv[2] ?? 3);
let ok = 0, total = 0;
for (let run = 1; run <= N; run++) {
  const a = await (await fetch("http://localhost:3000/api/analyze", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: img, subject: "circuit_theory" }),
  })).json();
  if (a.error) { console.log(`run${run} ANALYZE 실패: ${a.error}`); continue; }
  const concept = isConceptNamingAnalysis(a);
  console.log(`\n### run${run} 분류=${a.circuitType?.type} 개념형판정=${concept}`);
  if (!concept) {
    const t = deviceIdentityTextOf(a);
    console.log(`  topic: ${a.topic}`);
    console.log(`  interp: ${String(a.interpretation).replace(/\s+/g, " ").slice(0, 260)}`);
    console.log(`  원리문맥=${/원리|법칙|정리/.test(t)} 도출요구=${(t.match(/(전류|전압|전력|저항|정전용량|인덕턴스|주파수|이득|시정수)[^.]{0,12}(구하|계산|도출)|\[단계\s*\d/g) ?? []).join("|") || "없음"}`);
  }
  for (const mode of ["exam_similar", "exam_variant"]) {
    total++;
    const d = await (await fetch("http://localhost:3000/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: img, subject: "circuit_theory", mode, count: 1, analysis: a }),
    })).json();
    const p = d.problems?.[0];
    const figs = (p?.figureVariants ?? []).map(f => f.diagramType);
    const good = Boolean(p) && figs.length === 0 && (d.summary?.totalIssues ?? 0) === 0;
    if (good) ok++;
    console.log(`  ${good ? "✓" : "✗"} ${mode} figs=[${figs.join(",")}] issues=${d.summary?.totalIssues ?? "-"} | ${String(p?.question).replace(/\s+/g, " ").slice(0, 80)}`);
  }
}
console.log(`\n=== 성공률 ${ok}/${total} ===`);
