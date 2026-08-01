// E2E: 임용 9번 전자회로 원본 이미지 → /api/analyze → /api/generate (양 모드).
//   검증: circuitType=opamp_finite_gain_offset, 전용 figure, 3단계 발문, totalIssues=0.
//   실행: node scripts/smokeOpampFiniteGainOffsetE2E.mjs   (dev 서버 필요)
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const IMG = "C:/Users/USER/.claude/image-cache/9cd82b7a-9b07-46fd-b933-e0f54ddc68b6/28.png";
const image = readFileSync(IMG).toString("base64");

let fail = 0;
const ok = (cond, label) => { console.log(`  ${cond ? "✅" : "❌"} ${label}`); if (!cond) fail++; };

const aRes = await fetch(`${BASE}/api/analyze`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ image, subject: "electronics" }),
});
const aJson = await aRes.json();
if (!aRes.ok) { console.error("analyze FAILED", aJson); process.exit(1); }
console.log(`\n[analyze] circuitType=${aJson?.circuitType?.type} topicKey=${aJson?.topicKey}`);
console.log(`  topic: ${aJson?.topic}`);
console.log(`  inventory: ${(aJson?.componentInventory ?? []).map((c) => `${c.type}${c.value ? `:${c.value}` : ""}`).join(", ")}`);
ok(aJson?.circuitType?.type === "opamp_finite_gain_offset", `분류 = opamp_finite_gain_offset`);

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
  ok(figs.includes("opamp_finite_gain_offset_circuit"), "전용 figure");
  ok(/단계 1/.test(p?.question ?? "") && /단계 3/.test(p?.question ?? ""), "3단계 발문");
  ok(/1 \+ A_0/.test(p?.answer ?? ""), "정답에 V_out=(A₀V_in−V_B)/(1+A₀β) 관계식");
  ok((gJson.summary?.totalIssues ?? -1) === 0, "totalIssues = 0");
}
console.log(fail === 0 ? "\n결과: E2E 통과" : `\n결과: ${fail} 실패`);
process.exit(fail === 0 ? 0 : 1);
