/**
 * End-to-end test: 임용 6번 원본 이미지 → analyze → classify → generate → render.
 *
 * 검증 항목:
 *  1. analyzeImage가 다이오드·SW·교류 키워드 감지
 *  2. classifyCircuitType이 universal_ac_pwl로 라우팅
 *  3. runUniversalAcPwlPipeline이 GeneratedProblem 반환 (텍스트 + figure)
 *  4. 결과 SVG에 모든 컴포넌트 포함
 */
import { readFileSync, writeFileSync } from "node:fs";

// .env.local 수동 로드 (tsx는 자동 로드 안함)
for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) {
    const v = m[2].replace(/^["']|["']$/g, "");
    process.env[m[1]] = v;
  }
}
import { analyzeImage } from "../lib/analysis/analyzeImage.ts";
import { extractComponentInventory } from "../lib/analysis/extractComponentInventory.ts";
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { runUniversalAcPwlPipeline } from "../lib/pipeline/runUniversalAcPwlPipeline.ts";
import { renderDiodePwlCircuit } from "../lib/renderers/diodePwlCircuitRenderer.ts";

// flo-success 루트 기준 상대 경로 — Claude Code 임시 캐시(cleanup 됨) 의존 제거.
// 이 위치에 임용 6번 원본 png 배치 필요 (없으면 ENOENT). git tracked.
const IMG_PATH = "test-images/imyong6.png";

const imageBytes = readFileSync(IMG_PATH);
const imageB64 = imageBytes.toString("base64");
console.log(`Image loaded: ${imageBytes.length} bytes, base64 length: ${imageB64.length}`);

// ─── Step 1: analyzeImage + extractComponentInventory (병렬) ────────────────────────────
console.log("\n[Step 1] analyzeImage + extractComponentInventory (병렬)...");
const [analysisRaw, inventory] = await Promise.all([
  analyzeImage({ image: imageB64, subject: "circuit_theory" }),
  extractComponentInventory({ image: imageB64 }),
]);
const analysis = { ...analysisRaw, componentInventory: inventory };
console.log("  topic:", analysis.topic);
console.log("  topicKey:", analysis.topicKey);
console.log("  componentInventory items:", inventory.map((c) => `${c.id}(${c.type})`).join(", "));
const diodeCount = inventory.filter((c) => c.type === "D").length;
const swCount = inventory.filter((c) => c.type === "SW").length;
const capCount = inventory.filter((c) => c.type === "C").length;
console.log(`  D count: ${diodeCount}, SW count: ${swCount}, C count: ${capCount}`);

// ─── Step 2: classify ────────────────────────────────
console.log("\n[Step 2] classifyCircuitType(circuit_theory)...");
const cls = classifyCircuitType(analysis, "circuit_theory");
console.log("  type:", cls.type);
console.log("  confidence:", cls.confidence);
console.log("  reasoning:", cls.reasoning);
console.log("  params:", JSON.stringify(cls.params ?? {}));

if (cls.type !== "universal_ac_pwl") {
  console.log(`\nFAIL — classifier가 universal_ac_pwl이 아닌 ${cls.type}로 라우팅 (예상 빗나감)`);
  console.log("재현 시도 — 다이오드/스위치 인벤토리·키워드 확인 필요");
  process.exit(1);
}
console.log("\n  PASS — classifier가 universal_ac_pwl로 정상 라우팅");

// classifier params를 analysis.circuitType에 주입 (pipeline이 사용)
const enrichedAnalysis = { ...analysis, circuitType: cls };

// ─── Step 3: pipeline (count=1, exam_similar) ────────
console.log("\n[Step 3] runUniversalAcPwlPipeline(count=1, exam_similar)...");
const problems = await runUniversalAcPwlPipeline({
  analysis: enrichedAnalysis,
  mode: "exam_similar",
  count: 1,
  topicKey: analysis.topicKey,
});
console.log(`  generated ${problems.length} problem`);
const p = problems[0];
console.log("  id:", p.id);
console.log("  content (first 100):", p.content?.slice(0, 100));
console.log("  answer:", p.answer);

// ─── Step 4: render figure ─────────────────────────
console.log("\n[Step 4] figureVariants 확인...");
console.log(`  figureVariants count: ${p.figureVariants?.length}`);
for (const f of p.figureVariants ?? []) {
  console.log(`    ${f.id} (${f.diagramType}, role=${f.role}): ${f.label}`);
}
const netlistFigure = p.figureVariants?.find((f) => f.diagramType === "analog_netlist");
const svg = netlistFigure ? renderDiodePwlCircuit(netlistFigure.diagram) : null;
console.log(`  netlist svg length: ${svg?.length ?? "null"}`);
const viWaveformFigure = p.figureVariants?.find((f) => f.role === "input_waveform");
const voWaveformFigure = p.figureVariants?.find((f) => f.role === "solution_waveform");
console.log(`  v_i waveform samples: ${viWaveformFigure?.diagram?.signals?.[0]?.samples?.length ?? 0}`);
console.log(`  v_o waveform samples: ${voWaveformFigure?.diagram?.signals?.[0]?.samples?.length ?? 0}`);
if (viWaveformFigure?.diagram?.signals?.[0]?.samples?.length) {
  const s = viWaveformFigure.diagram.signals[0].samples;
  console.log(`  v_i t range: ${s[0].t.toFixed(3)} - ${s[s.length-1].t.toFixed(3)} ms`);
  console.log(`  v_i v range: ${Math.min(...s.map(x => x.v)).toFixed(2)} - ${Math.max(...s.map(x => x.v)).toFixed(2)} V`);
}
if (voWaveformFigure?.diagram?.signals?.[0]?.samples?.length) {
  const s = voWaveformFigure.diagram.signals[0].samples;
  console.log(`  v_o t range: ${s[0].t.toFixed(3)} - ${s[s.length-1].t.toFixed(3)} ms`);
  console.log(`  v_o v range: ${Math.min(...s.map(x => x.v)).toFixed(2)} - ${Math.max(...s.map(x => x.v)).toFixed(2)} V`);
}

// ─── Step 5: HTML 저장 (시각 검증) ─────────────────
// 간단한 waveform SVG 생성 helper (polyline 직접 그리기 — sine 모양 확인용)
function renderWaveformSvg(samples, label, vMin, vMax) {
  const W = 720, H = 200;
  const padL = 50, padR = 20, padT = 20, padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const tMin = samples[0].t;
  const tMax = samples[samples.length - 1].t;
  const xOf = (t) => padL + ((t - tMin) / (tMax - tMin)) * plotW;
  const yOf = (v) => padT + plotH - ((v - vMin) / (vMax - vMin)) * plotH;
  const yZero = yOf(0);
  const points = samples.map(s => `${xOf(s.t).toFixed(1)},${yOf(s.v).toFixed(1)}`).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <line x1="${padL}" y1="${yZero}" x2="${padL + plotW}" y2="${yZero}" stroke="#aaa" stroke-width="1"/>
    <text x="${padL - 8}" y="${yOf(vMax) + 4}" text-anchor="end" font-size="11">${vMax}</text>
    <text x="${padL - 8}" y="${yZero + 4}" text-anchor="end" font-size="11">0</text>
    <text x="${padL - 8}" y="${yOf(vMin) + 4}" text-anchor="end" font-size="11">${vMin}</text>
    <polyline points="${points}" fill="none" stroke="#111" stroke-width="2"/>
    <text x="${padL}" y="14" font-size="13" font-weight="700" fill="#1e3a8a">${label} (${samples.length} samples, t=${tMin.toFixed(2)}~${tMax.toFixed(2)} ms)</text>
    <text x="${padL + plotW}" y="${H - 8}" text-anchor="end" font-size="11">t [ms]</text>
  </svg>`;
}

function vRange(samples) {
  const vs = samples.map(s => s.v);
  return { min: Math.min(...vs), max: Math.max(...vs) };
}
const viSvg = viWaveformFigure ? (() => {
  const ss = viWaveformFigure.diagram.signals[0].samples;
  const r = vRange(ss);
  return renderWaveformSvg(ss, "v_i(t)", Math.floor(r.min), Math.ceil(r.max));
})() : "(no vi)";
const voSvg = voWaveformFigure ? (() => {
  const ss = voWaveformFigure.diagram.signals[0].samples;
  const r = vRange(ss);
  return renderWaveformSvg(ss, "v_o(t)", Math.floor(r.min), Math.ceil(r.max));
})() : "(no vo)";

const html = `<!doctype html><meta charset="utf-8"><title>임용 6번 end-to-end</title>
<style>body{margin:20px;font:14px sans-serif;max-width:1100px}h1,h2{font-size:18px}h2{margin-top:24px;border-top:1px solid #ddd;padding-top:16px}pre{background:#f5f5f5;padding:8px;font-size:11px;white-space:pre-wrap}.q{background:#fff7e6;padding:12px;border-left:3px solid #f59e0b;margin:8px 0}</style>
<h1>임용 6번 end-to-end 테스트</h1>

<h2>1. analyze 결과</h2>
<pre>topic: ${analysis.topic}
topicKey: ${analysis.topicKey}
inventory: ${(analysis.componentInventory ?? []).map((c) => `${c.id}(${c.type})`).join(", ")}
interpretation: ${analysis.interpretation?.slice(0, 200)}...</pre>

<h2>2. classifier</h2>
<pre>type: ${cls.type}
confidence: ${cls.confidence}
reasoning: ${cls.reasoning}
params: ${JSON.stringify(cls.params, null, 2)}</pre>

<h2>3. 생성된 문제</h2>
<div class="q"><b>content:</b><br>${p.content}</div>
<div class="q"><b>conditions:</b><br>${p.conditions?.join("<br>")}</div>
<div class="q"><b>question:</b><br>${(p.question ?? "").replaceAll("\\n", "<br>")}</div>
<div class="q"><b>answer:</b><br>${(p.answer ?? "").replaceAll("\\n", "<br>")}</div>
<div class="q"><b>solution:</b><br>${(p.solution ?? "").replaceAll("\\n", "<br>")}</div>

<h2>4. 회로 figure</h2>
<div style="border:1px solid #ccc;display:inline-block">${svg ?? "(svg null)"}</div>

<h2>5. v_i(t) 입력 파형 (문제용)</h2>
<div style="border:1px solid #ccc;display:inline-block">${viSvg}</div>

<h2>6. v_o(t) 출력 파형 (풀이용)</h2>
<div style="border:1px solid #ccc;display:inline-block">${voSvg}</div>
`;
writeFileSync("scripts/smokeImyong6EndToEnd.html", html);
console.log("\nHTML saved -> scripts/smokeImyong6EndToEnd.html");
console.log("\n=== END-TO-END PASS ===");
