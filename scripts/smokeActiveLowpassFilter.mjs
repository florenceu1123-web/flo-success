import { readFileSync, writeFileSync } from "node:fs";
const base = process.env.BASE ?? "http://localhost:3000";
const imgPath = "C:/Users/USER/.claude/image-cache/155d864e-be8b-4338-ab2c-e4d76c86f871/6.png";
const b64 = readFileSync(imgPath).toString("base64");

const analyzeRes = await fetch(`${base}/api/analyze`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ image: b64, subject: "electronics" }),
});
const analysis = await analyzeRes.json();
console.log("== ANALYZE ==");
console.log("topic:", analysis.topic);
console.log("circuitType:", analysis.circuitType?.type, "| topicKey:", analysis.topicKey);
console.log("reasoning:", analysis.circuitType?.reasoning);
console.log("inventory:", (analysis.componentInventory ?? []).map((c) => `${c.type}(${c.value ?? ""})`).join(", "));
const routed = analysis.circuitType?.type === "active_lowpass_filter";
console.log("ROUTED active_lowpass_filter?", routed);

const forced = {
  topic: "1차 능동 저역통과 필터 대역폭",
  interpretation: "연산증폭기 1차 저역통과 필터, 커패시터 C 변경 시 대역폭(차단주파수 f_c=1/(2πRC)) 변화",
  relatedConcepts: ["저역통과 필터", "대역폭", "차단주파수", "커패시터"],
  topicKey: "opamp",
  circuitType: { type: "active_lowpass_filter", params: {}, confidence: "high", reasoning: "forced" },
  componentInventory: [{ type: "OPAMP" }, { type: "R", value: "50kΩ" }, { type: "C", value: "8nF" }, { type: "R", value: "5kΩ" }],
};

async function gen(mode, useForced) {
  const res = await fetch(`${base}/api/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: b64, subject: "electronics", mode, count: 2, analysis: useForced ? forced : analysis }),
  });
  const j = await res.json();
  console.log(`\n== GENERATE ${mode} ${useForced ? "(forced)" : "(vision)"} (HTTP ${res.status}) ==`);
  if (!res.ok) { console.log("ERROR:", j.error); return { ok: false }; }
  console.log("summary:", JSON.stringify(j.summary));
  let diagram = null;
  for (const p of j.problems ?? []) {
    console.log("---");
    console.log("content :", (p.content ?? "").slice(0, 150));
    console.log("answer  :", (p.answer ?? "").replace(/\n/g, " | "));
    console.log("figures :", (p.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(", "));
    if (!diagram && p.figureVariants?.[0]) diagram = p.figureVariants[0].diagram;
  }
  const vv = j.validations?.[0];
  if (vv) {
    const iss = [...(vv.problem?.issues ?? []), ...(vv.figures?.issues ?? [])];
    if (iss.length) console.log("ISSUES:", JSON.stringify(iss));
  }
  return { ok: res.ok && j.summary?.totalIssues === 0, diagram };
}

const s = await gen("exam_similar", true);
const vv = await gen("exam_variant", true);
writeFileSync("scripts/_lpf_similar.json", JSON.stringify(s.diagram ?? {}, null, 2));
writeFileSync("scripts/_lpf_variant.json", JSON.stringify(vv.diagram ?? {}, null, 2));
console.log("\n==== RESULT:", (s.ok && vv.ok) ? "PASS(pipeline)" : "FAIL",
  `(routed=${routed}, similar=${s.ok}, variant=${vv.ok}) ====`);
