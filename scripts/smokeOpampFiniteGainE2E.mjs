// E2E: 원본 임용 11번 이미지 → /api/analyze → /api/generate (양 모드).
// 검증: circuitType=opamp_finite_gain_block, totalIssues=0, figure (가)+(나), 답 존재.
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const IMG = "C:/Users/USER/.claude/image-cache/6862d728-ff39-40e4-997d-f1a34567af9a/1.png";
const image = readFileSync(IMG).toString("base64"); // raw base64 (prefix 없음)

async function main() {
  console.log("→ /api/analyze ...");
  const aRes = await fetch(`${BASE}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image, subject: "electronics" }),
  });
  const aJson = await aRes.json();
  if (!aRes.ok) { console.error("analyze FAILED", aJson); process.exit(1); }
  const ct = aJson?.circuitType?.type;
  console.log("  circuitType =", ct, "| topicKey =", aJson?.topicKey);
  console.log("  topic =", aJson?.topic);

  for (const mode of ["exam_similar", "exam_variant"]) {
    console.log(`\n→ /api/generate (${mode}, count=2) ...`);
    const gRes = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image, subject: "electronics", mode, count: 2, analysis: aJson }),
    });
    const gJson = await gRes.json();
    if (!gRes.ok) { console.error("generate FAILED", gJson); process.exit(1); }
    const probs = gJson.problems ?? [];
    console.log("  problems =", probs.length, "| totalIssues =", gJson.summary?.totalIssues, "| solutionWarnings =", gJson.summary?.solutionWarnings);
    (gJson.validations ?? []).forEach((v, i) => {
      const pIssues = (v.problem?.issues ?? []).map((x) => x.rule);
      const fIssues = (v.figures?.issues ?? []).map((x) => x.rule);
      if (pIssues.length || fIssues.length) console.log(`  [${i}] ISSUES problem=[${pIssues}] figures=[${fIssues}]`);
    });
    probs.forEach((p, i) => {
      const figs = (p.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(", ");
      console.log(`  [${i}] figs = [${figs}]`);
      console.log(`      answer = ${String(p.answer ?? "").replace(/\n/g, " | ")}`);
    });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
