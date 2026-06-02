/**
 * 검수·편집 게이트 smoke test — /api/recover-topology (GPT 호출 없음, 결정론).
 *
 * 시나리오: Vision이 임용 11번을 부정확하게 추출 (V 크기 18, R 8Ω, 0.25Ω 누락)
 *          → 사용자가 검수·편집 게이트에서 정확한 값으로 보정
 *          → /api/recover-topology 재계산
 *          → 보정된 analysis로 /api/generate
 *
 * 검증:
 *  1. 보정된 inventory가 그대로 반영 (V 9∠90°V, R 2Ω·0.25Ω 등)
 *  2. topology 재복원 — pins_graph_v3 채택 + graphValidation ok
 *  3. circuitType = universal_ac 유지
 *  4. 보정된 analysis로 생성 → answer 유한 + 비정상 과대값 없음
 *
 * 실행: dev 서버 기동 상태에서  node scripts/smokeRecoverTopologyGate.mjs
 */
import { writeFileSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ─── 기존 분석 결과 (Vision이 부정확하게 추출했다고 가정) ────────────────────
const visionAnalysis = {
  topic: "RLC 회로의 최대 평균전력",
  interpretation:
    "두 개의 교류 전원이 포함된 RLC 회로. 테브난 등가 임피던스·등가 전압을 구하고 부하 R_L에 최대 평균전력이 전달되는 R_L과 그때의 전력을 구한다.",
  relatedConcepts: ["테브난 등가회로", "최대 전력 전달", "phasor", "평균전력"],
  fillInTheBlanks: [],
  subjectKey: "circuit_theory",
  topicKey: "rlc_response",
  semantic: {
    hasStateTransition: false,
    hasEquivalentTransformation: true,
    hasWaveformEvolution: false,
    requiresMultiFigure: false,
  },
  // Vision 오독 inventory: V 크기 18(잘못), R 8Ω 1개만(잘못), 0.25Ω 누락
  componentInventory: [
    { id: "V1", type: "V", value: "18∠90°V", pins: ["n1", "n3"] },
    { id: "I1", type: "I", value: "18∠90°A", pins: ["n3", "n2"] },
    { id: "L1", type: "L", value: "j3Ω", pins: ["n3", "n4"] },
    { id: "C1", type: "C", value: "-j3Ω", pins: ["n4", "n5"] },
    { id: "R1", type: "R", value: "8Ω", pins: ["n5", "n2"] },
  ],
  topologySignature: {
    subjectKey: "circuit_theory",
    family: "rlc_response",
    features: { hasGround: true, hasMesh: true, meshCount: 1 },
    branches: [],
  },
  nodeAnnotations: [],
  loadPlaceholders: [],
};

// ─── 사용자가 검수·편집 게이트에서 보정한 inventory (원본 그림 기준 정확한 값) ──
//   원본: I(18∠90°A) ∥ [V(9∠90°V)+0.25Ω] — j3Ω — 2Ω — [-j3Ω ∥ R_L(a-b)]
const correctedInventory = [
  { id: "I1", type: "I", value: "18∠90°A", pins: ["n_top", "GND"] },
  { id: "V1", type: "V", value: "9∠90°V", pins: ["n_top", "n_vmid"] },
  { id: "R_s", type: "R", value: "0.25Ω", pins: ["n_vmid", "GND"] },
  { id: "L1", type: "L", value: "j3Ω", pins: ["n_top", "n_mid"] },
  { id: "R1", type: "R", value: "2Ω", pins: ["n_mid", "n_right"] },
  { id: "C1", type: "C", value: "-j3Ω", pins: ["n_right", "GND"] },
];

// ─── Step 1: /api/recover-topology ───────────────────────────────────────────
console.log(`[Step 1] POST ${BASE_URL}/api/recover-topology (보정 inventory 6개) ...`);
const recoverRes = await fetch(`${BASE_URL}/api/recover-topology`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    inventory: correctedInventory,
    analysis: visionAnalysis,
    subject: "circuit_theory",
  }),
});
const recovered = await recoverRes.json();
if (!recoverRes.ok) {
  console.log(`FAIL — HTTP ${recoverRes.status}: ${recovered.error}`);
  process.exitCode = 1;
} else {
  console.log("  strategy:", recovered.topologyRecovery?.strategy);
  console.log("  graph confidence:", recovered.graphValidation?.confidence);
  console.log(
    "  inventory:",
    (recovered.componentInventory ?? [])
      .map((c) => `${c.id}(${c.type}${c.value ? `=${c.value}` : ""})`)
      .join(", "),
  );
  console.log(
    "  branches:",
    (recovered.topologySignature?.branches ?? [])
      .map((b) => `${b.components[0]?.type}:${b.role}`)
      .join(", "),
  );

  console.log("\n[검증 1] 보정 inventory 반영");
  const inv = recovered.componentInventory ?? [];
  check("소자 6개", inv.length === 6, String(inv.length));
  check("V 값 = 9∠90°V (보정값)", inv.some((c) => c.type === "V" && c.value === "9∠90°V"));
  check("R 2개 (2Ω + 0.25Ω)", inv.filter((c) => c.type === "R").length === 2);

  console.log("\n[검증 2] topology 재복원");
  check(
    "pins_graph_v3 채택",
    recovered.topologyRecovery?.strategy === "pins_graph_v3",
    recovered.topologyRecovery?.strategy,
  );
  check("graphValidation ok", recovered.graphValidation?.ok === true);
  check(
    "branch 6개",
    (recovered.topologySignature?.branches ?? []).length === 6,
    String((recovered.topologySignature?.branches ?? []).length),
  );

  console.log("\n[검증 3] 분류 유지");
  check(
    "circuitType = universal_ac",
    recovered.circuitType?.type === "universal_ac",
    recovered.circuitType?.type,
  );

  // ─── Step 2: 보정된 analysis로 /api/generate ──────────────────────────────
  console.log(`\n[Step 2] POST ${BASE_URL}/api/generate (보정된 analysis, exam_similar) ...`);
  const genRes = await fetch(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: "dummy",
      subject: "circuit_theory",
      mode: "exam_similar",
      count: 1,
      topicKey: "rlc_response",
      analysis: recovered,
    }),
  });
  const genData = await genRes.json();
  if (!genRes.ok) {
    check("생성 성공", false, `HTTP ${genRes.status}: ${genData.error}`);
  } else {
    const p = genData.problems?.[0];
    const answerText = `${p?.answer ?? ""} ${p?.solution ?? ""}`;
    console.log("  answer:", (p?.answer ?? "").replace(/\n/g, " / "));

    console.log("\n[검증 4] 생성 결과");
    check("answer에 NaN/Infinity 없음", !/NaN|Infinity/i.test(answerText));
    const hugeNumbers = answerText.match(/\d{7,}/g) ?? [];
    check("answer에 과대값(10^6+) 없음", hugeNumbers.length === 0, hugeNumbers.slice(0, 3).join(", "));
    const figComponents = p?.figureVariants?.[0]?.diagram?.components ?? [];
    console.log(
      "  figure:",
      figComponents.map((c) => `${c.id}${c.value ? `=${c.value}` : ""}`).join(", "),
    );
    check("figure 소자 ≥ 6", figComponents.length >= 6, String(figComponents.length));

    // 리포트 저장
    const html = `<!doctype html><meta charset="utf-8"><title>검수·편집 게이트 end-to-end</title>
<style>body{margin:20px;font:14px sans-serif;max-width:1100px}h2{margin-top:24px;border-top:1px solid #ddd;padding-top:16px;font-size:18px}pre{background:#f5f5f5;padding:8px;font-size:11px;white-space:pre-wrap}.q{background:#fff7e6;padding:12px;border-left:3px solid #f59e0b;margin:8px 0}</style>
<h1>검수·편집 게이트 (임용 11번 보정 시나리오)</h1>
<h2>1. 보정 전 (Vision 오독)</h2>
<pre>${visionAnalysis.componentInventory.map((c) => `${c.id}  ${c.type}  ${c.value}  pins=${JSON.stringify(c.pins)}`).join("\n")}</pre>
<h2>2. 보정 후 inventory</h2>
<pre>${correctedInventory.map((c) => `${c.id}  ${c.type}  ${c.value}  pins=${JSON.stringify(c.pins)}`).join("\n")}</pre>
<h2>3. 재복원 결과</h2>
<pre>strategy: ${recovered.topologyRecovery?.strategy}
graphValidation: ${JSON.stringify(recovered.graphValidation, null, 2)}
branches: ${JSON.stringify(recovered.topologySignature?.branches, null, 2)}</pre>
<h2>4. 생성 문제</h2>
<div class="q"><b>content:</b><br>${p?.content ?? "-"}</div>
<div class="q"><b>question:</b><br>${p?.question ?? "-"}</div>
<div class="q"><b>answer:</b><br>${p?.answer ?? "-"}</div>
<div class="q"><b>solution:</b><br>${(p?.solution ?? "-").replaceAll("\n", "<br>")}</div>
<h2>5. figure netlist</h2>
<pre>${JSON.stringify(p?.figureVariants?.[0]?.diagram ?? null, null, 2)}</pre>
`;
    writeFileSync("scripts/smokeRecoverTopologyGate.html", html);
    console.log("\nHTML saved -> scripts/smokeRecoverTopologyGate.html");
  }
}

if (failures > 0) {
  console.log(`\n=== ${failures}개 검증 실패 ===`);
  process.exitCode = 1;
} else {
  console.log("\n=== PASS ===");
}
