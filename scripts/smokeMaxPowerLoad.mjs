/**
 * 최대전력 R_L 부하 처리 smoke test (2026-06-03 수정 검증).
 *
 * 수정 내용:
 *  ① addLoadResistor — R_L을 기존 회로 R 오선택 대신 부하 단자에 별도 추가
 *  ② netlistToComplex — C 임피던스 표기("-j3Ω") 파싱 (이전엔 C가 솔버에서 통째로 누락)
 *  ③ buildFromTopology — phasor 전원 값("9∠90°V") 원본 보존 (이전엔 랜덤 값으로 대체)
 *  ④ maxAvgPower 솔버 — ternary 정밀화 + nice 값 snap
 *
 * 검증 (임용 11번 원본 회로 — 정답 R_L = |Z_th| = |4-j3| = 5Ω):
 *  [단위] addLoadResistor 단자 휴리스틱 → [n_right, GND]
 *  [단위] C 임피던스 파싱 → 1/(ω·3) F
 *  [단위] maxAvgPower → R_L = 5Ω (정확)
 *  [통합] recover-topology → generate → R_L·P_max 답 + figure에 R_L 표시
 *
 * 실행: npx tsx scripts/smokeMaxPowerLoad.mjs  (통합 부분은 dev 서버 필요)
 */
import { addLoadResistor } from "../lib/generation/topologyDriven/addLoadResistor.ts";
import { netlistToComplexStandalone } from "../lib/solver/netlistToComplex.ts";
import { solveAcQueries } from "../lib/solver/universalAc.ts";

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail !== undefined ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

const OMEGA = 10000;

// ─── 임용 11번 원본 회로 netlist (buildFromTopology 출력 형태) ────────────────
//   I(18∠90°A) ∥ [V(9∠90°V)+0.25Ω] — j3Ω — 2Ω — [-j3Ω ∥ (R_L 단자 a-b)]
function buildImyong11Netlist() {
  return {
    ground: "GND",
    components: [
      { id: "I_leg1_1", type: "I", value: "18∠90°A", pins: [{ id: "p1", node: "n_top", side: "top" }, { id: "p2", node: "GND", side: "bottom" }] },
      { id: "V_horiz1", type: "V", value: "9∠90°V", pins: [{ id: "p1", node: "n_top", side: "left" }, { id: "p2", node: "n_vmid", side: "right" }] },
      { id: "R_leg2_1", type: "R", value: "0.25Ω", pins: [{ id: "p1", node: "n_vmid", side: "top" }, { id: "p2", node: "GND", side: "bottom" }] },
      { id: "L_horiz2", type: "L", value: "j3Ω", pins: [{ id: "p1", node: "n_top", side: "left" }, { id: "p2", node: "n_mid", side: "right" }] },
      { id: "R_top3", type: "R", value: "2Ω", pins: [{ id: "p1", node: "n_mid", side: "left" }, { id: "p2", node: "n_right", side: "right" }] },
      { id: "C_leg3_1", type: "C", value: "-j3Ω", pins: [{ id: "p1", node: "n_right", side: "top" }, { id: "p2", node: "GND", side: "bottom" }] },
    ],
  };
}

// ─── [단위 1] addLoadResistor 단자 휴리스틱 ──────────────────────────────────
console.log("[단위 1] addLoadResistor — 부하 단자 휴리스틱");
const netlist = buildImyong11Netlist();
const loadInfo = addLoadResistor(netlist, { loadPlaceholders: [] });
check("R_L 추가됨", loadInfo !== null && loadInfo.id === "R_L", loadInfo?.id);
check(
  "단자 = [n_right, GND] (전원에서 가장 먼 노드)",
  loadInfo?.nodeA === "n_right" && loadInfo?.nodeB === "GND",
  `${loadInfo?.nodeA} ↔ ${loadInfo?.nodeB}`,
);
check(
  "기존 R(0.25Ω·2Ω)은 그대로 보존",
  netlist.components.filter((c) => c.type === "R" && c.id !== "R_L").every((c) => c.value !== "R" && c.value !== "R_L"),
);
check(
  "단자 a annotation 추가",
  (netlist.nodeAnnotations ?? []).some((ann) => ann.label === "a" && ann.node === "n_right"),
);

// ─── [단위 2] C 임피던스 표기 파싱 ───────────────────────────────────────────
console.log("\n[단위 2] netlistToComplex — C '-j3Ω' 임피던스 파싱");
const complexNet = netlistToComplexStandalone(netlist, OMEGA);
const cap = (complexNet.capacitors ?? []).find((c) => c.id === "C_leg3_1");
check("C가 솔버 네트워크에 포함됨 (이전엔 누락)", Boolean(cap));
const expectedC = 1 / (OMEGA * 3);
check(
  "C = 1/(ω·3) F",
  cap && Math.abs(cap.C - expectedC) / expectedC < 1e-9,
  cap ? `${cap.C} (기대 ${expectedC})` : "없음",
);
const ind = (complexNet.inductors ?? []).find((l) => l.id === "L_horiz2");
check("L = 3/ω H", ind && Math.abs(ind.L - 3 / OMEGA) / (3 / OMEGA) < 1e-9, ind?.L);
const vsrc = complexNet.vsources.find((v) => v.id === "V_horiz1");
check(
  "V phasor = 0+j9 (9∠90° 보존)",
  vsrc && Math.abs(vsrc.V.re) < 1e-9 && Math.abs(vsrc.V.im - 9) < 1e-9,
  vsrc ? `${vsrc.V.re}+j${vsrc.V.im}` : "없음",
);

// ─── [단위 3] maxAvgPower — 정답 R_L = |Z_th| = 5Ω ──────────────────────────
console.log("\n[단위 3] maxAvgPower 솔버 — R_L = |4-j3| = 5Ω");
// R_L은 비수치 값이라 complexNet에 없음 → 파이프라인과 동일하게 placeholder 1Ω 등록
complexNet.resistors.push({ id: "R_L", a: "n_right", b: "GND", R: 1 });
const results = solveAcQueries(complexNet, [
  { kind: "maxAvgPower", resistorId: "R_L", vsourceId: "V_horiz1", label: "R_L (P_max 전달)" },
]);
const rl = results[0];
console.log("  R_L =", rl.value, rl.unit, " / P_max =", rl.meta?.Pmax, "W");
check("R_L = 5Ω (정확)", Math.abs(rl.value - 5) < 0.01, String(rl.value));
check("P_max 유한·양수", Number.isFinite(rl.meta?.Pmax) && rl.meta.Pmax > 0, String(rl.meta?.Pmax));

// ─── [통합] recover-topology → generate (dev 서버 필요) ─────────────────────
console.log("\n[통합] /api/recover-topology → /api/generate");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
let serverUp = false;
try {
  serverUp = (await fetch(BASE_URL, { method: "HEAD" })).ok;
} catch { /* 서버 미기동 */ }

if (!serverUp) {
  console.log("  (skip) dev 서버 미기동 — 단위 검증만 수행");
} else {
  // 검수·편집 게이트에서 보정한 정확한 inventory (임용 11번 원본 값)
  const correctedInventory = [
    { id: "I1", type: "I", value: "18∠90°A", pins: ["n_top", "GND"] },
    { id: "V1", type: "V", value: "9∠90°V", pins: ["n_top", "n_vmid"] },
    { id: "R_s", type: "R", value: "0.25Ω", pins: ["n_vmid", "GND"] },
    { id: "L1", type: "L", value: "j3Ω", pins: ["n_top", "n_mid"] },
    { id: "R1", type: "R", value: "2Ω", pins: ["n_mid", "n_right"] },
    { id: "C1", type: "C", value: "-j3Ω", pins: ["n_right", "GND"] },
  ];
  const analysis = {
    topic: "RLC 회로의 최대 평균전력",
    interpretation:
      "두 개의 교류 전원이 포함된 RLC 회로. 테브난 등가 임피던스·등가 전압을 구하고 부하 R_L에 최대 평균전력이 전달되는 R_L과 그때의 전력을 구한다.",
    relatedConcepts: ["테브난 등가회로", "최대 전력 전달", "phasor", "평균전력"],
    fillInTheBlanks: [],
    subjectKey: "circuit_theory",
    topicKey: "rlc_response",
    semantic: { hasStateTransition: false, hasEquivalentTransformation: true, hasWaveformEvolution: false, requiresMultiFigure: false },
    componentInventory: correctedInventory,
    topologySignature: {
      subjectKey: "circuit_theory",
      family: "rlc_response",
      features: { hasGround: true, hasMesh: true, meshCount: 1 },
      branches: [],
    },
    nodeAnnotations: [],
    loadPlaceholders: [],
  };

  const recoverRes = await fetch(`${BASE_URL}/api/recover-topology`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inventory: correctedInventory, analysis, subject: "circuit_theory" }),
  });
  const recovered = await recoverRes.json();
  if (!recoverRes.ok) {
    check("recover-topology 성공", false, recovered.error);
  } else {
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
      const answerText = `${p?.answer ?? ""}`;
      console.log("  answer:", answerText.replace(/\n/g, " / "));
      check("answer에 NaN/Infinity 없음", !/NaN|Infinity/i.test(answerText));
      check("answer에 P_max 포함", /P_max/i.test(answerText));
      // R_L 답 추출 — 합리적 범위 (값 perturbation 때문에 정확히 5는 아닐 수 있음)
      const rlMatch = answerText.match(/R_L[^=]*=\s*([\d.]+)\s*Ω/);
      const rlVal = rlMatch ? parseFloat(rlMatch[1]) : NaN;
      check("R_L 답이 합리적 범위 [1, 20]Ω", rlVal >= 1 && rlVal <= 20, `${rlVal}Ω`);

      const figComponents = p?.figureVariants?.[0]?.diagram?.components ?? [];
      console.log("  figure:", figComponents.map((c) => `${c.id}${c.value ? `=${c.value}` : ""}`).join(", "));
      check("figure에 R_L 부하 표시", figComponents.some((c) => /^R_?L$/i.test(c.id)));
      check(
        "figure에 phasor 전원 보존 (∠ 표기)",
        figComponents.some((c) => typeof c.value === "string" && c.value.includes("∠")),
      );
      check("figure 소자 7개 (원본 6 + R_L)", figComponents.length === 7, String(figComponents.length));
    }
  }
}

// ─── 결과 ─────────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.log(`\n=== ${failures}개 검증 실패 ===`);
  process.exitCode = 1;
} else {
  console.log("\n=== PASS ===");
}
