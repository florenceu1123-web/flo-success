/**
 * End-to-end test: 임용 11번 (2전원 RLC 최대 평균전력) 원본 이미지 → /api/analyze → /api/generate.
 *
 * 배경 (2026-06-02): inventory 추출이 7개 소자 중 3개만 — 그것도 I→V 오인, -j3Ω→L 오인 —
 * 추출해서 R 없는 V+L+L 회로가 되고 최대전력 해석이 전부 NaN으로 깨진 버그의 회귀 테스트.
 *
 * 검증 항목:
 *  1. inventory 완전성 — 전류원 I≥1 (V로 오인 금지), 전압원 V≥1, C≥1 (-jXΩ이 L로 오인 금지), R≥2
 *  2. classifier가 universal_ac로 라우팅
 *  3. 생성된 문제의 answer에 NaN/Inf 없음 (NaN 게이트)
 *  4. figure netlist에 inventory 소자가 모두 반영
 *
 * 실행: dev 서버 기동 상태에서  node scripts/smokeImyong11EndToEnd.mjs
 *       (포트가 3000이 아니면  BASE_URL=http://localhost:3001 node scripts/...)
 */
import { readFileSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const IMG_PATH = "test-images/imyong11_rlc_maxpower.png";
const SUBJECT = "circuit_theory";

const imageBytes = readFileSync(IMG_PATH);
const imageB64 = imageBytes.toString("base64");
console.log(`Image loaded: ${imageBytes.length} bytes, base64 length: ${imageB64.length}`);

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ─── Step 1: /api/analyze ────────────────────────────────────────────────
console.log(`\n[Step 1] POST ${BASE_URL}/api/analyze ...`);
const analyzeRes = await fetch(`${BASE_URL}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image: imageB64, subject: SUBJECT }),
});
if (!analyzeRes.ok) {
  console.log(`FAIL — /api/analyze HTTP ${analyzeRes.status}: ${await analyzeRes.text()}`);
  process.exit(1);
}
const analysis = await analyzeRes.json();
console.log("  topic:", analysis.topic);
console.log("  topicKey:", analysis.topicKey);

const inventory = analysis.componentInventory ?? [];
console.log("  inventory:", inventory.map((c) => `${c.id}(${c.type}${c.value ? `=${c.value}` : ""})`).join(", "));

const countOf = (t) => inventory.filter((c) => c.type.toUpperCase() === t).length;

console.log("\n[검증 1] inventory 완전성");
check("전류원 I ≥ 1 (18∠90°A — V로 오인 금지)", countOf("I") >= 1, `I=${countOf("I")}`);
check("전압원 V ≥ 1 (9∠90°V)", countOf("V") >= 1, `V=${countOf("V")}`);
check("커패시터 C ≥ 1 (-j3Ω — L로 오인 금지)", countOf("C") >= 1, `C=${countOf("C")}`);
check("인덕터 L ≥ 1 (j3Ω)", countOf("L") >= 1, `L=${countOf("L")}`);
check("저항 R ≥ 2 (2Ω·0.25Ω)", countOf("R") >= 2, `R=${countOf("R")}`);
check("총 소자 ≥ 6", inventory.length >= 6, `${inventory.length}개`);

console.log("\n[검증 2] classifier 라우팅");
check("circuitType = universal_ac", analysis.circuitType?.type === "universal_ac", analysis.circuitType?.type);

// ─── Step 2: /api/generate (exam_similar, count=1) ───────────────────────
console.log(`\n[Step 2] POST ${BASE_URL}/api/generate (exam_similar) ...`);
const generateRes = await fetch(`${BASE_URL}/api/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    image: imageB64,
    subject: SUBJECT,
    mode: "exam_similar",
    count: 1,
    analysis,
  }),
});
const generateBody = await generateRes.json();
if (!generateRes.ok) {
  // inventory가 여전히 불완전해서 NaN 게이트에 걸린 경우 — 게이트 자체는 동작한 것.
  console.log(`  /api/generate HTTP ${generateRes.status}: ${generateBody.error}`);
  const isNanGate = String(generateBody.error ?? "").includes("유한하지 않습니다");
  check("NaN 답 노출 차단 (게이트 동작)", isNanGate, generateBody.error);
  check("생성 성공 (inventory 완전 추출 시 도달)", false, "NaN 게이트로 중단됨");
  finish();
} else {
  runPostGenerateChecks();
  finish();
}

function runPostGenerateChecks() {
const problem = generateBody.problems?.[0];
console.log("  content (첫 120자):", problem?.content?.slice(0, 120));
console.log("  answer:", problem?.answer);

console.log("\n[검증 3] 해석 결과 유한성");
const answerText = `${problem?.answer ?? ""} ${problem?.solution ?? ""}`;
check("answer/solution에 NaN 없음", !/NaN|Infinity/i.test(answerText));

console.log("\n[검증 4] figure 소자 반영");
const netlistFig = (problem?.figureVariants ?? []).find((f) => f.diagramType === "analog_netlist");
const figComponents = netlistFig?.diagram?.components ?? [];
console.log("  figure components:", figComponents.map((c) => `${c.id}(${c.type}${c.value ? `=${c.value}` : ""})`).join(", "));
check("figure 존재", Boolean(netlistFig));
// 가변 R(R_L placeholder)은 inventory에 없으므로 ±1 허용
check(
  `figure 소자 수 ≥ inventory 수 - 1`,
  figComponents.length >= inventory.length - 1,
  `figure=${figComponents.length}, inventory=${inventory.length}`,
);

// ─── 리포트 저장 ──────────────────────────────────────────────────────────
const html = `<!doctype html><meta charset="utf-8"><title>임용 11번 end-to-end</title>
<style>body{margin:20px;font:14px sans-serif;max-width:1100px}h2{margin-top:24px;border-top:1px solid #ddd;padding-top:16px;font-size:18px}pre{background:#f5f5f5;padding:8px;font-size:11px;white-space:pre-wrap}.q{background:#fff7e6;padding:12px;border-left:3px solid #f59e0b;margin:8px 0}</style>
<h1>임용 11번 (2전원 RLC 최대전력) end-to-end</h1>
<h2>1. inventory</h2>
<pre>${inventory.map((c) => `${c.id}  type=${c.type}  value=${c.value ?? "-"}  pins=${JSON.stringify(c.pins ?? null)}`).join("\n")}</pre>
<h2>2. classifier</h2>
<pre>${JSON.stringify(analysis.circuitType, null, 2)}</pre>
<h2>3. graph validation</h2>
<pre>${JSON.stringify(analysis.graphValidation, null, 2)}</pre>
<h2>4. 생성 문제</h2>
<div class="q"><b>content:</b><br>${problem?.content ?? "-"}</div>
<div class="q"><b>question:</b><br>${problem?.question ?? "-"}</div>
<div class="q"><b>answer:</b><br>${problem?.answer ?? "-"}</div>
<div class="q"><b>solution:</b><br>${(problem?.solution ?? "-").replaceAll("\n", "<br>")}</div>
<h2>5. figure netlist</h2>
<pre>${JSON.stringify(netlistFig?.diagram ?? null, null, 2)}</pre>
`;
writeFileSync("scripts/smokeImyong11EndToEnd.html", html);
console.log("\nHTML saved -> scripts/smokeImyong11EndToEnd.html");
}

function finish() {
  // process.exit()는 Windows에서 열린 fetch 핸들과 충돌(libuv assertion) → exitCode로 종료
  if (failures > 0) {
    console.log(`\n=== ${failures}개 검증 실패 ===`);
    process.exitCode = 1;
  } else {
    console.log("\n=== END-TO-END PASS ===");
  }
}
