// E2E: 임용 12번 전자회로(루프이득 + 좌반평면 안정도) 원본 이미지 → analyze → generate (양 모드).
//   실행: node scripts/smokeOpampLoopGainStabilityE2E.mjs   (dev 서버 필요)
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const IMG = "C:/Users/USER/.claude/image-cache/9cd82b7a-9b07-46fd-b933-e0f54ddc68b6/29.png";
const image = readFileSync(IMG).toString("base64");

let fail = 0;
const ok = (c, l) => { console.log(`  ${c ? "✅" : "❌"} ${l}`); if (!c) fail++; };

const aRes = await fetch(`${BASE}/api/analyze`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ image, subject: "electronics" }),
});
const aJson = await aRes.json();
if (!aRes.ok) { console.error("analyze FAILED", aJson); process.exit(1); }
console.log(`\n[analyze] circuitType=${aJson?.circuitType?.type} topicKey=${aJson?.topicKey}`);
console.log(`  topic: ${aJson?.topic}`);
console.log(`  interp: ${String(aJson?.interpretation ?? "").slice(0, 180)}`);
ok(aJson?.circuitType?.type === "opamp_loop_gain_stability", "분류 = opamp_loop_gain_stability");

for (const mode of ["exam_similar", "exam_variant"]) {
  const gRes = await fetch(`${BASE}/api/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ image, subject: "electronics", mode, count: 1, analysis: aJson }),
  });
  const gJson = await gRes.json();
  if (!gRes.ok) { console.error("generate FAILED", gJson); process.exit(1); }
  const p = (gJson.problems ?? [])[0];
  const figs = (p?.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(", ");
  console.log(`\n[${mode}] totalIssues=${gJson.summary?.totalIssues} figs=[${figs}]`);
  console.log(`  answer: ${String(p?.answer ?? "").replace(/\n/g, " | ")}`);
  ok((figs.match(/opamp_loop_gain_circuit/g) ?? []).length === 2, "(가)·(나) 전용 figure 2개");
  ok(/단계 1/.test(p?.question ?? "") && /단계 3/.test(p?.question ?? ""), "3단계 발문");
  ok(/L\(s\)/.test(p?.answer ?? "") && /R_S\s*[<>]/.test(p?.answer ?? ""), "루프이득 + R_S 부등식 정답");
  ok((gJson.summary?.totalIssues ?? -1) === 0, "totalIssues = 0");
}
console.log(fail === 0 ? "\n결과: E2E 통과" : `\n결과: ${fail} 실패`);
process.exit(fail === 0 ? 0 : 1);
