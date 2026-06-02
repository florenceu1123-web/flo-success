/**
 * Vision 모델별 회로 소자 추출 정확도 비교 (임용 11번 기준).
 *
 * 원본 정답 (7개 소자, R_L placeholder 제외하면 6개):
 *   I(18∠90°A) · V(9∠90°V) · R(0.25Ω) · L(j3Ω) · R(2Ω) · C(-j3Ω)
 *   본문 식: v(t)=9cos(ωt+90°), i(t)=18cos(ωt+90°)
 *
 * 각 모델로 extractComponentInventory를 2회씩 실행해 정확도 채점:
 *   소자 수(6) + type 분포(V1·I1·L1·C1·R2) + 값 정확성(9·18·j3·-j3·2·0.25)
 *
 * 실행: npx tsx scripts/compareVisionModels.mjs [모델명들...]
 *       기본: gpt-4o gpt-5.4-mini gpt-5.5
 */
import { readFileSync } from "node:fs";

// .env.local 수동 로드 (tsx는 자동 로드 안함) — import보다 먼저 실행돼야 함
for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { extractComponentInventory } = await import("../lib/analysis/extractComponentInventory.ts");

const IMG_PATH = "test-images/imyong11_rlc_maxpower.png";
const imageB64 = readFileSync(IMG_PATH).toString("base64");

const MODELS = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ["gpt-4o", "gpt-5.4-mini", "gpt-5.5"];
const RUNS_PER_MODEL = 2;

/** 정답 기준 채점 — 100점 만점. */
function scoreInventory(inv) {
  if (!inv || inv.length === 0) return { total: 0, detail: "추출 실패" };
  const count = (t) => inv.filter((c) => c.type === t).length;
  const hasValue = (substr) => inv.some((c) => (c.value ?? "").replace(/\s/g, "").includes(substr));

  let typeScore = 0;   // 50점 — type 분포
  if (count("V") === 1) typeScore += 10;
  if (count("I") === 1) typeScore += 10;
  if (count("L") === 1) typeScore += 10;
  if (count("C") === 1) typeScore += 10;
  typeScore += Math.min(count("R"), 2) * 5;   // R 2개 = 10점

  let valueScore = 0;  // 50점 — 값 정확성
  if (hasValue("9∠90°") || hasValue("9cos")) valueScore += 10;    // V = 9
  if (hasValue("18∠90°") || hasValue("18cos")) valueScore += 10;  // I = 18
  if (hasValue("j3Ω") || hasValue("j3")) valueScore += 10;        // L
  if (hasValue("-j3")) valueScore += 10;                          // C
  if (hasValue("2Ω")) valueScore += 5;                            // R 2Ω
  if (hasValue("0.25")) valueScore += 5;                          // R 0.25Ω

  return {
    total: typeScore + valueScore,
    detail: `type ${typeScore}/50 + 값 ${valueScore}/50`,
  };
}

console.log(`이미지: ${IMG_PATH}`);
console.log(`모델: ${MODELS.join(", ")} (각 ${RUNS_PER_MODEL}회)\n`);

const summary = [];
for (const model of MODELS) {
  console.log(`━━━ ${model} ━━━`);
  const scores = [];
  for (let run = 1; run <= RUNS_PER_MODEL; run++) {
    const t0 = Date.now();
    try {
      const inv = await extractComponentInventory({ image: imageB64, model });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const { total, detail } = scoreInventory(inv);
      scores.push(total);
      console.log(`  [${run}회] ${total}점 (${detail}) — ${elapsed}s`);
      console.log(`        ${inv.map((c) => `${c.type}=${c.value ?? "?"}`).join(", ")}`);
    } catch (e) {
      scores.push(0);
      console.log(`  [${run}회] 오류: ${e.message.slice(0, 120)}`);
    }
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  summary.push({ model, avg, scores });
  console.log("");
}

console.log("━━━ 결과 요약 ━━━");
summary.sort((a, b) => b.avg - a.avg);
for (const s of summary) {
  console.log(`  ${s.model.padEnd(16)} 평균 ${s.avg.toFixed(0)}점  (${s.scores.join(", ")})`);
}
