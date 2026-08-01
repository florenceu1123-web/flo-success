import { readFileSync } from "node:fs";
const base = process.env.BASE ?? "http://localhost:3000";
const imgPath = "C:/Users/USER/.claude/image-cache/155d864e-be8b-4338-ab2c-e4d76c86f871/11.png";
const b64 = readFileSync(imgPath).toString("base64");

// Vision 분류 (원본 아날로그 시스템 설계 이미지)
const analysis = await (await fetch(`${base}/api/analyze`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ image: b64, subject: "electronics" }),
})).json();
console.log("circuitType:", analysis.circuitType?.type, "| routed:", analysis.circuitType?.type === "opamp_analog_summer");
console.log("topic:", analysis.topic);

async function gen(mode) {
  const r = await fetch(`${base}/api/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: b64, subject: "electronics", mode, count: 1, analysis }),
  });
  const j = await r.json();
  const p = j.problems?.[0];
  console.log(`\n== ${mode} (HTTP ${r.status}, issues=${j.summary?.totalIssues}) ==`);
  console.log("answer :", (p?.answer ?? "").replace(/\n/g, " | "));
  console.log("figs   :", (p?.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(", "),
    "| sol:", (p?.solutionFigures ?? []).map((f) => f.diagramType).join(","));
  return r.ok && j.summary?.totalIssues === 0;
}
const s = await gen("exam_similar");
const v = await gen("exam_variant");
const routed = analysis.circuitType?.type === "opamp_analog_summer";
console.log("\n==== RESULT:", (routed && s && v) ? "PASS" : "FAIL", `(routed=${routed}, similar=${s}, variant=${v}) ====`);
