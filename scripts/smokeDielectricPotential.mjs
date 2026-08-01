import { readFileSync } from "node:fs";
const base = process.env.BASE ?? "http://localhost:3000";
const imgPath = "C:/Users/USER/.claude/image-cache/93b8920f-2d14-4f3e-88c8-db13c934aa80/1.png";
const b64 = readFileSync(imgPath).toString("base64");

const analyzeRes = await fetch(`${base}/api/analyze`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ image: b64, subject: "electromagnetics" }),
});
const analysis = await analyzeRes.json();
console.log("== ANALYZE ==");
console.log("topic:", analysis.topic);
console.log("topicKey:", analysis.topicKey);
console.log("interpretation:", (analysis.interpretation ?? "").slice(0, 300));
console.log("relatedConcepts:", JSON.stringify(analysis.relatedConcepts));

async function gen(mode) {
  const res = await fetch(`${base}/api/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: b64, subject: "electromagnetics", mode, count: 1, analysis }),
  });
  const j = await res.json();
  console.log(`\n== GENERATE ${mode} (HTTP ${res.status}) ==`);
  if (!res.ok) { console.log("ERROR:", j.error); return; }
  const p = j.problems?.[0];
  if (p) {
    console.log("content:", (p.content ?? "").replace(/\n/g, " ").slice(0, 400));
    console.log("question:", (p.question ?? "").replace(/\n/g, " ").slice(0, 400));
    console.log("answer:", (p.answer ?? "").replace(/\n/g, " ").slice(0, 400));
  }
  console.log("totalIssues:", j.summary?.totalIssues);
}
await gen("exam_similar");
await gen("exam_variant");
