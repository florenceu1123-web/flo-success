import { readFileSync } from "node:fs";
const base = process.env.BASE ?? "http://localhost:3000";
const imgPath = "C:/Users/USER/.claude/image-cache/83b60f42-616a-4056-851c-6472a76c4d31/1.png";
const b64 = readFileSync(imgPath).toString("base64");

const analyzeRes = await fetch(`${base}/api/analyze`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ image: b64, subject: "circuit_theory" }),
});
const analysis = await analyzeRes.json();
console.log("== ANALYZE ==");
console.log("topic:", analysis.topic);
console.log("circuitType:", analysis.circuitType?.type, "| topicKey:", analysis.topicKey);
console.log("reasoning:", analysis.circuitType?.reasoning);
console.log("inventory:", (analysis.componentInventory ?? []).map((c) => `${c.type}(${c.value})`).join(", "));

async function gen(mode) {
  const res = await fetch(`${base}/api/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: b64, subject: "circuit_theory", mode, count: 2, analysis }),
  });
  const j = await res.json();
  console.log(`\n== GENERATE ${mode} (HTTP ${res.status}) ==`);
  if (!res.ok) { console.log("ERROR:", j.error); return false; }
  console.log("summary:", JSON.stringify(j.summary));
  for (const p of j.problems ?? []) {
    console.log("---");
    console.log("content :", (p.content ?? "").slice(0, 160));
    console.log("answer  :", (p.answer ?? "").replace(/\n/g, " | "));
    console.log("figures :", (p.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(", "));
    console.log("diagram :", JSON.stringify(p.figureVariants?.[0]?.diagram));
  }
  const v = j.validations?.[0];
  if (v) {
    const iss = [...(v.problem?.issues ?? []), ...(v.figures?.issues ?? [])];
    if (iss.length) console.log("ISSUES:", JSON.stringify(iss));
  }
  return res.ok && j.summary?.totalIssues === 0;
}

const okS = await gen("exam_similar");
const okV = await gen("exam_variant");
const routed = analysis.circuitType?.type === "ac_vccs_phasor";
console.log("\n==== RESULT:", (routed && okS && okV) ? "PASS" : "FAIL",
  `(routed=${routed}, similar=${okS}, variant=${okV}) ====`);
