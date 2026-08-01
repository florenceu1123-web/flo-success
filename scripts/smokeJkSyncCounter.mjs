import { readFileSync } from "node:fs";
const base = process.env.BASE ?? "http://localhost:3000";
const imgPath = "C:/Users/USER/.claude/image-cache/89cb7014-4827-4cb6-98c5-b3b3204ce2c2/1.png";
const b64 = readFileSync(imgPath).toString("base64");

const analyzeRes = await fetch(`${base}/api/analyze`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ image: b64, subject: "digital_logic" }),
});
const analysis = await analyzeRes.json();
console.log("== ANALYZE ==");
console.log("topic:", analysis.topic);
console.log("circuitType:", analysis.circuitType?.type, "| topicKey:", analysis.topicKey);

async function gen(mode) {
  const res = await fetch(`${base}/api/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: b64, subject: "digital_logic", mode, count: 2, analysis }),
  });
  const j = await res.json();
  console.log(`\n== GENERATE ${mode} (HTTP ${res.status}) ==`);
  if (!res.ok) { console.log("ERROR:", j.error); return false; }
  console.log("summary:", JSON.stringify(j.summary));
  const p = j.problems?.[0];
  if (p) {
    console.log("content:", (p.content ?? "").slice(0, 130));
    console.log("question:", (p.question ?? "").replace(/\n/g, " ").slice(0, 130));
    console.log("answer:", (p.answer ?? "").slice(0, 140));
    console.log("figures:", (p.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(", "));
  }
  // 검증 이슈 상세
  const v = j.validations?.[0];
  if (v) {
    const iss = [...(v.problem?.issues ?? []), ...(v.figures?.issues ?? [])];
    if (iss.length) console.log("ISSUES:", JSON.stringify(iss));
  }
  return res.ok && j.summary?.totalIssues === 0;
}

const okS = await gen("exam_similar");
const okV = await gen("exam_variant");
const routed = analysis.circuitType?.type === "jk_sync_counter";
console.log("\n==== RESULT:", (routed && okS && okV) ? "PASS" : "FAIL",
  `(routed=${routed}, similar=${okS}, variant=${okV}) ====`);
