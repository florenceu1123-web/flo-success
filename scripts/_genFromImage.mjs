/**
 * 원본 이미지 파일로 **앱과 같은 경로**(analyze → generate)를 그대로 태워 유사문제를 만든다.
 *
 * 실행: node scripts/_genFromImage.mjs <이미지경로> [subject] [mode] [count]
 *   예)  node scripts/_genFromImage.mjs ./orig.png circuit_theory exam_similar 1
 */
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const [, , imgPath, subject = "circuit_theory", mode = "exam_similar", countArg = "1"] = process.argv;
if (!imgPath) {
  console.error("이미지 경로가 필요합니다.");
  process.exit(1);
}

// ★ API는 **접두사 없는 순수 base64**를 받는다 (프론트도 data URL에서 "," 뒤만 떼어 보낸다).
//   `data:image/png;base64,...`를 그대로 보내면 OpenAI가 "Invalid base64 image_url"로 400을 낸다.
const image = readFileSync(imgPath).toString("base64");

console.log("① analyze …");
const aRes = await fetch(`${BASE}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image, subject }),
});
const aData = await aRes.json();
if (!aRes.ok || aData.error) {
  console.error(`analyze 실패 HTTP ${aRes.status} — ${aData.error}`);
  process.exit(1);
}
const analysis = aData.analysis ?? aData;
console.log(`  topic     : ${analysis.topic}`);
console.log(`  topicKey  : ${analysis.topicKey}`);
console.log(`  circuitType: ${analysis.circuitType?.type} (${analysis.circuitType?.confidence})`);
console.log(`  inventory : ${(analysis.componentInventory ?? []).map((c) => `${c.type}:${c.value ?? ""}`).join(", ")}`);
console.log(`  해석      : ${String(analysis.interpretation ?? "").slice(0, 240)}…`);

console.log(`\n② generate (${mode}) …`);
const gRes = await fetch(`${BASE}/api/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image, subject, mode, count: Number(countArg), analysis }),
});
const gData = await gRes.json();
if (!gRes.ok || gData.error) {
  console.error(`generate 실패 HTTP ${gRes.status} — ${gData.error}`);
  process.exit(1);
}
for (const [i, p] of (gData.problems ?? []).entries()) {
  console.log(`\n${"=".repeat(72)}\n[${mode}] 문제 ${i + 1}\n${"=".repeat(72)}`);
  console.log(`\n【본문】\n${p.content}`);
  if (p.conditions?.length) console.log(`\n【조건】\n- ${p.conditions.join("\n- ")}`);
  console.log(`\n【문항】\n${p.question}`);
  console.log(`\n【정답】\n${p.answer}`);
  console.log(`\n【풀이】\n${p.solution}`);
  console.log(`\n【figure】 ${(p.figureVariants ?? []).map((f) => `${f.role}:${f.diagramType}`).join(", ") || "없음"}`);
}
console.log(`\n--- 검증: issues=${gData.summary?.totalIssues ?? "?"} ---`);
