import { readFileSync, writeFileSync } from "node:fs";
const base = process.env.BASE ?? "http://localhost:3000";
const imgPath = "C:/Users/USER/.claude/image-cache/155d864e-be8b-4338-ab2c-e4d76c86f871/1.png";
const b64 = readFileSync(imgPath).toString("base64");

// ── 1) Vision 분류 (실제 원본 이미지) — 라우팅 확인 ──
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
const routed = analysis.circuitType?.type === "opamp_series_regulator";
console.log("ROUTED opamp_series_regulator?", routed);

// ── 2) 결정론 생성+렌더 검증 (강제 analysis) — Vision 오라우팅과 무관하게 파이프라인 검증 ──
const forced = {
  topic: "OPAMP 직렬형 정전압 안정화 회로",
  interpretation: "제너 기준전압 + 연산증폭기 오차증폭기 + 직렬 패스 트랜지스터 + 피드백 분압으로 출력 안정화",
  relatedConcepts: ["정전압 안정화", "오차증폭기", "제너다이오드", "피드백 분압"],
  topicKey: "opamp",
  circuitType: { type: "opamp_series_regulator", params: {}, confidence: "high", reasoning: "forced" },
  componentInventory: [{ type: "OPAMP" }, { type: "D", value: "10V" }, { type: "Q" }, { type: "R" }, { type: "R" }, { type: "R" }],
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
  let svg = null;
  for (const p of j.problems ?? []) {
    console.log("---");
    console.log("content :", (p.content ?? "").slice(0, 150));
    console.log("cond    :", (p.conditions ?? []).join(" | "));
    console.log("question:", (p.question ?? "").replace(/\n/g, " | "));
    console.log("answer  :", (p.answer ?? "").replace(/\n/g, " | "));
    console.log("figures :", (p.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(", "));
    if (!svg && p.figureVariants?.[0]) svg = p.figureVariants[0];
  }
  const v = j.validations?.[0];
  if (v) {
    const iss = [...(v.problem?.issues ?? []), ...(v.figures?.issues ?? [])];
    if (iss.length) console.log("ISSUES:", JSON.stringify(iss));
  }
  return { ok: res.ok && j.summary?.totalIssues === 0, diagram: svg?.diagram };
}

const s = await gen("exam_similar", true);
const vv = await gen("exam_variant", true);
// diagram JSON 저장 (렌더 시각검증용)
writeFileSync("scripts/_opampReg_similar.json", JSON.stringify(s.diagram ?? {}, null, 2));
writeFileSync("scripts/_opampReg_variant.json", JSON.stringify(vv.diagram ?? {}, null, 2));

console.log("\n==== RESULT:", (s.ok && vv.ok) ? "PASS(pipeline)" : "FAIL",
  `(routed=${routed}, similar=${s.ok}, variant=${vv.ok}) ====`);
