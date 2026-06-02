/**
 * Topology Recovery v3 (pins 기반) smoke test — GPT Vision 호출 없이 결정론 검증.
 *
 * Case A: 임용 11번 실제 추출 inventory (dev.log 2026-06-02 10:11 실행에서 채록)
 *         → pins_graph_v3 채택 + 전원 dangling repair + GND 지정 + 5 branches
 * Case B: pins 누락 inventory → null (fallback)
 * Case C: 2조각 끊긴 그래프 → null (fallback)
 * Case D: (통합, dev 서버 필요) Case A 복원 topology로 /api/generate
 *         → 최대전력 답이 유한 + 비정상 아님
 *
 * 실행:  node scripts/smokePinsTopologyRecovery.mjs
 *        (Case D는 dev 서버 기동 시에만 — 아니면 skip)
 */
import { recoverTopologyFromPins } from "../lib/analysis/topologyRecovery.ts";

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ─── Case A: 임용 11번 실제 inventory ────────────────────────────────────────
console.log("[Case A] 임용 11번 — 2전원 RLC (V dangling 포함)");
const imyong11Inventory = [
  { id: "V1", type: "V", value: "9∠90°V",  pins: ["n1", "n3"] },  // n1 dangling
  { id: "I1", type: "I", value: "18∠90°A", pins: ["n3", "n2"] },
  { id: "L1", type: "L", value: "j3Ω",     pins: ["n3", "n4"] },
  { id: "C1", type: "C", value: "-j3Ω",    pins: ["n4", "n5"] },
  { id: "R1", type: "R", value: "2Ω",      pins: ["n5", "n2"] },
];
const resA = recoverTopologyFromPins(imyong11Inventory);
check("pins_graph_v3 채택", resA?.strategy === "pins_graph_v3", resA?.strategy);
check("confidence ≥ 0.9", (resA?.confidence ?? 0) >= 0.9, String(resA?.confidence));
check("branch 5개", resA?.branches.length === 5, String(resA?.branches.length));
const roles = (resA?.branches ?? []).map((b) => `${b.components[0].type}:${b.role}`);
console.log("    branches:", roles.join(", "));
check(
  "V는 voltage_source_leg (dangling repair 후 GND 접촉)",
  (resA?.branches ?? []).some((b) => b.components[0].type === "V" && b.role === "voltage_source_leg"),
);
check(
  "I는 current_source_leg",
  (resA?.branches ?? []).some((b) => b.components[0].type === "I" && b.role === "current_source_leg"),
);
// 모든 betweenNodes 존재 + GND가 최소 2개 branch에 등장 (전원 leg 닫힘)
const gndTouchCount = (resA?.branches ?? []).filter((b) => b.betweenNodes?.includes("GND")).length;
check("GND 접촉 branch ≥ 2", gndTouchCount >= 2, String(gndTouchCount));

// ─── Case B: pins 누락 → fallback ────────────────────────────────────────────
console.log("\n[Case B] pins 누락 inventory");
const noPinsInventory = [
  { id: "V1", type: "V", value: "10V" },
  { id: "R1", type: "R", value: "5Ω" },
  { id: "R2", type: "R", value: "10Ω" },
];
const resB = recoverTopologyFromPins(noPinsInventory);
check("null 반환 (pattern/ladder fallback 위임)", resB === null);

// ─── Case C: 2조각 끊긴 그래프 → fallback ────────────────────────────────────
console.log("\n[Case C] 끊긴 그래프 (2조각)");
const disconnectedInventory = [
  { id: "V1", type: "V", value: "10V", pins: ["a1", "a2"] },
  { id: "R1", type: "R", value: "5Ω",  pins: ["a1", "a2"] },
  { id: "R2", type: "R", value: "5Ω",  pins: ["b1", "b2"] },  // 분리된 조각
  { id: "R3", type: "R", value: "5Ω",  pins: ["b1", "b2"] },
];
const resC = recoverTopologyFromPins(disconnectedInventory);
check("null 반환 (연결성 검증 실패)", resC === null);

// ─── Case E: GPT 노드 이름 불일치 — dangling 전원을 다른 전원 hot 노드에 재연결 ──
//   (2026-06-03 17:59 실제 버그: V의 top을 "n_top", I·L의 같은 물리 노드를 "n_left"로
//    다르게 명명 → V dangling → 이전 규칙은 GND에 붙여 V+R 고립 루프를 만들었음)
console.log("\n[Case E] 노드 이름 불일치 — dangling 전원 재연결");
const inconsistentNaming = [
  { id: "I1", type: "I", value: "18∠90°A", pins: ["n_left", "GND"] },
  { id: "V1", type: "V", value: "9∠90°V", pins: ["n_top", "n_mid"] },  // n_top = 물리적으로 n_left와 같은 노드
  { id: "R1", type: "R", value: "0.25Ω", pins: ["n_mid", "GND"] },
  { id: "L1", type: "L", value: "j3Ω", pins: ["n_left", "n_right"] },
  { id: "R2", type: "R", value: "2Ω", pins: ["n_right", "n_a"] },
  { id: "C1", type: "C", value: "-j3Ω", pins: ["n_a", "GND"] },
];
const resE = recoverTopologyFromPins(inconsistentNaming);
check("pins_graph_v3 채택", resE?.strategy === "pins_graph_v3", resE?.strategy);
const vBranchE = (resE?.branches ?? []).find((b) => b.components[0].type === "V");
check(
  "V의 dangling 끝이 다른 전원 hot 노드(n_left)에 연결 (GND 고립 루프 금지)",
  vBranchE?.betweenNodes?.includes("n_left") === true,
  JSON.stringify(vBranchE?.betweenNodes),
);
check(
  "V는 horizontal (mesh_only_branch) — n_left↔n_mid",
  vBranchE?.role === "mesh_only_branch",
  vBranchE?.role,
);
// 전체 그래프가 한 덩어리 (고립 루프 없음): 모든 branch가 V·I·L·R·C 6개
check("branch 6개 전부 보존", (resE?.branches ?? []).length === 6, String((resE?.branches ?? []).length));

// ─── Case D: 통합 — /api/generate (dev 서버 필요) ────────────────────────────
console.log("\n[Case D] /api/generate 통합 (최대 평균전력)");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
let serverUp = false;
try {
  serverUp = (await fetch(BASE_URL, { method: "HEAD" })).ok;
} catch { /* 서버 미기동 */ }

if (!serverUp) {
  console.log("  (skip) dev 서버 미기동 — Case A~C만 검증");
} else {
  const body = {
    image: "dummy",
    subject: "circuit_theory",
    mode: "exam_similar",
    count: 1,
    topicKey: "rlc_response",
    analysis: {
      topic: "RLC 회로의 최대 평균전력",
      interpretation: "두 개의 교류 전원이 포함된 RLC 회로. 테브난 등가 임피던스·등가 전압을 구하고 부하 R_L에 최대 평균전력이 전달되는 R_L과 그때의 전력을 구한다.",
      relatedConcepts: ["테브난 등가회로", "최대 전력 전달", "phasor", "평균전력"],
      fillInTheBlanks: [],
      subjectKey: "circuit_theory",
      semantic: { hasStateTransition: false, hasEquivalentTransformation: true, hasWaveformEvolution: false, requiresMultiFigure: false },
      circuitType: { type: "universal_ac", params: {}, confidence: "high", reasoning: "smoke" },
      componentInventory: imyong11Inventory,
      topologySignature: {
        subjectKey: "circuit_theory",
        family: "rlc_response",
        features: { hasGround: true, hasMesh: true, meshCount: 1 },
        branches: resA.branches,
      },
      nodeAnnotations: [],
      loadPlaceholders: [],
    },
  };
  const r = await fetch(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) {
    check("생성 성공", false, `HTTP ${r.status}: ${data.error}`);
  } else {
    const p = data.problems?.[0];
    const answerText = `${p?.answer ?? ""} ${p?.solution ?? ""}`;
    console.log("  answer:", (p?.answer ?? "").replace(/\n/g, " / "));
    check("answer에 NaN/Infinity 없음", !/NaN|Infinity/i.test(answerText));
    // 비정상 과대값 검사 — 10^6 이상의 숫자가 답에 등장하면 topology 복원 실패 신호
    const hugeNumbers = (answerText.match(/\d{7,}/g) ?? []);
    check("answer에 과대값(10^6+) 없음", hugeNumbers.length === 0, hugeNumbers.slice(0, 3).join(", "));
    const figComponents = p?.figureVariants?.[0]?.diagram?.components ?? [];
    console.log("  figure:", figComponents.map((c) => `${c.id}${c.value ? `=${c.value}` : ""}`).join(", "));
    check("figure 소자 ≥ 5", figComponents.length >= 5, String(figComponents.length));
  }
}

// ─── 결과 ─────────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.log(`\n=== ${failures}개 검증 실패 ===`);
  process.exitCode = 1;
} else {
  console.log("\n=== PASS ===");
}
