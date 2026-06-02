/**
 * 유사·변형유형 생성 다양화 smoke test (2026-06-03).
 *
 * [A] phasor·임피던스 perturbation (exam_similar) — 단위 테스트
 *     생성 예시가 원본과 값이 달라지는지: 9∠90°V → N∠90°V (N≠9 가능), j3Ω → jXΩ
 * [B] V↔I·L↔C 위치 교환 (exam_variant) — 단위 테스트
 *     전압원↔전류원 위치, 코일↔커패시터 위치가 서로 바뀌는지 (사용자 요구)
 * [C] 통합 (dev 서버) — exam_similar·exam_variant 각 1문제 생성
 *     similar: 원본 구조 유지 + 값 일부 변형 / variant: 위치 교환 + 답 유한
 *
 * 실행: npx tsx scripts/smokeVariantAndPerturbation.mjs
 */
import {
  perturbTopology,
  perturbPhasorValue,
  perturbImpedanceValue,
} from "../lib/generation/topologyDriven/perturbTopology.ts";
import { applySourceReactiveSwapVariant } from "../lib/analysis/topologyRecovery.ts";

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail !== undefined ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ─── 임용 11번 v3 복원 topology (pins 기반) ──────────────────────────────────
const imyong11Topology = {
  subjectKey: "circuit_theory",
  family: "rlc_response",
  features: { hasGround: true, hasMesh: true, meshCount: 1 },
  branches: [
    { role: "current_source_leg", components: [{ type: "I", value: "18∠90°A" }], betweenNodes: ["n_top", "GND"] },
    { role: "mesh_only_branch", components: [{ type: "V", value: "9∠90°V" }], betweenNodes: ["n_top", "n_mid"] },
    { role: "load_leg", components: [{ type: "R", value: "0.25Ω" }], betweenNodes: ["n_mid", "GND"] },
    { role: "top_rail_resistor", components: [{ type: "L", value: "j3Ω" }], betweenNodes: ["n_top", "n_right"] },
    { role: "top_rail_resistor", components: [{ type: "R", value: "2Ω" }], betweenNodes: ["n_right", "n_a"] },
    { role: "load_leg", components: [{ type: "C", value: "-j3Ω" }], betweenNodes: ["n_a", "GND"] },
  ],
};

// ─── [A] phasor·임피던스 perturbation ────────────────────────────────────────
console.log("[A] phasor·임피던스 perturbation (exam_similar)");

// A-1: 단일 함수 동작
const rand = (() => { let s = 42; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
const pv = perturbPhasorValue("9∠90°V", "exam_similar", rand);
check("페이저 V perturb — 형식 유지 (N∠90°V)", /^\d+∠90°V$/.test(pv ?? ""), pv);
const pi = perturbPhasorValue("18∠90°A", "exam_similar", rand);
check("페이저 I perturb — 형식 유지 (N∠90°A)", /^\d+∠90°A$/.test(pi ?? ""), pi);
const pl = perturbImpedanceValue("j3Ω", "exam_similar", rand);
check("인덕터 임피던스 perturb — 양수 j 유지", /^j\d+Ω$/.test(pl ?? ""), pl);
const pc = perturbImpedanceValue("-j3Ω", "exam_similar", rand);
check("커패시터 임피던스 perturb — 음수 -j 유지", /^-j\d+Ω$/.test(pc ?? ""), pc);
check("비대상 표기는 null", perturbPhasorValue("10V", "exam_similar", rand) === null && perturbImpedanceValue("5Ω", "exam_similar", rand) === null);

// A-2: 여러 seed에서 값이 실제로 달라지는지 (전부 원본과 같으면 perturbation 무의미)
const seeds = [1, 7, 13, 42, 99, 1234];
let changedCount = 0;
for (const seed of seeds) {
  const perturbed = perturbTopology(imyong11Topology, "exam_similar", seed);
  const values = perturbed.branches.map((b) => b.components[0].value);
  const original = imyong11Topology.branches.map((b) => b.components[0].value);
  if (JSON.stringify(values) !== JSON.stringify(original)) changedCount++;
}
check(
  `6개 seed 중 대부분(≥4)에서 값이 원본과 달라짐`,
  changedCount >= 4,
  `${changedCount}/6 seed에서 변화`,
);
// A-3: 위상·부호는 절대 안 바뀜
const perturbedSample = perturbTopology(imyong11Topology, "exam_similar", 42);
const vValue = perturbedSample.branches.find((b) => b.components[0].type === "V")?.components[0].value;
const cValue = perturbedSample.branches.find((b) => b.components[0].type === "C")?.components[0].value;
check("V 위상 90° 유지", /∠90°V$/.test(vValue ?? ""), vValue);
check("C 음수 부호 유지", /^-j/.test(cValue ?? ""), cValue);

// ─── [B] V↔I·L↔C 위치 교환 (exam_variant) ────────────────────────────────────
console.log("\n[B] V↔I·L↔C 위치 교환 (exam_variant — 사용자 요구)");
const swapped = applySourceReactiveSwapVariant(imyong11Topology);
check("교환 적용됨 (null 아님)", swapped !== null);

if (swapped) {
  const findBranch = (type) =>
    swapped.branches.find((b) => (b.components[0]?.type ?? "").toUpperCase() === type);
  const vB = findBranch("V");
  const iB = findBranch("I");
  const lB = findBranch("L");
  const cB = findBranch("C");

  // 원본: I=[n_top,GND] leg, V=[n_top,n_mid] horizontal
  // 교환 후: V=[n_top,GND] leg, I=[n_top,n_mid] horizontal
  check(
    "V가 I의 원래 위치로 이동 ([n_top, GND] leg)",
    JSON.stringify(vB?.betweenNodes) === JSON.stringify(["n_top", "GND"]) && vB?.role === "voltage_source_leg",
    `${JSON.stringify(vB?.betweenNodes)} role=${vB?.role}`,
  );
  check(
    "I가 V의 원래 위치로 이동 ([n_top, n_mid] horizontal)",
    JSON.stringify(iB?.betweenNodes) === JSON.stringify(["n_top", "n_mid"]) && iB?.role === "mesh_only_branch",
    `${JSON.stringify(iB?.betweenNodes)} role=${iB?.role}`,
  );
  // 원본: L=[n_top,n_right] horizontal, C=[n_a,GND] leg
  // 교환 후: C=[n_top,n_right] horizontal, L=[n_a,GND] leg
  check(
    "C가 L의 원래 위치로 이동 ([n_top, n_right] horizontal)",
    JSON.stringify(cB?.betweenNodes) === JSON.stringify(["n_top", "n_right"]) && cB?.role === "top_rail_resistor",
    `${JSON.stringify(cB?.betweenNodes)} role=${cB?.role}`,
  );
  check(
    "L이 C의 원래 위치로 이동 ([n_a, GND] leg)",
    JSON.stringify(lB?.betweenNodes) === JSON.stringify(["n_a", "GND"]) && lB?.role === "load_leg",
    `${JSON.stringify(lB?.betweenNodes)} role=${lB?.role}`,
  );
  // 값은 소자를 따라감
  check("V 값 유지 (9∠90°V)", vB?.components[0].value === "9∠90°V", vB?.components[0].value);
  check("C 값 유지 (-j3Ω)", cB?.components[0].value === "-j3Ω", cB?.components[0].value);
  // R들은 원래 자리 유지
  const rBranches = swapped.branches.filter((b) => (b.components[0]?.type ?? "") === "R");
  check("R 2개는 위치 그대로", rBranches.length === 2);
  // 원본은 불변 (깊은 복사 확인)
  check(
    "원본 topology 불변",
    imyong11Topology.branches[0].components[0].type === "I" &&
      JSON.stringify(imyong11Topology.branches[0].betweenNodes) === JSON.stringify(["n_top", "GND"]),
  );
}

// V만 있고 I 없는 회로 → L↔C만 교환
const vOnlyTopology = {
  ...imyong11Topology,
  branches: imyong11Topology.branches.filter((b) => b.components[0].type !== "I"),
};
const swappedVOnly = applySourceReactiveSwapVariant(vOnlyTopology);
check(
  "\n  I 없는 회로 — L↔C만 교환 적용",
  swappedVOnly !== null &&
    swappedVOnly.branches.find((b) => b.components[0].type === "C")?.betweenNodes?.[1] === "n_right",
);

// L·C 없고 V·I도 한 종류뿐 → null
const rOnlyTopology = {
  ...imyong11Topology,
  branches: imyong11Topology.branches.filter((b) => ["R", "V"].includes(b.components[0].type)),
};
check("교환 쌍이 없으면 null (변형 미적용)", applySourceReactiveSwapVariant(rOnlyTopology) === null);

// ─── [C] 통합 — exam_similar·exam_variant 생성 (dev 서버 필요) ────────────────
console.log("\n[C] 통합 생성 (exam_similar + exam_variant)");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
let serverUp = false;
try {
  serverUp = (await fetch(BASE_URL, { method: "HEAD" })).ok;
} catch { /* 서버 미기동 */ }

if (!serverUp) {
  console.log("  (skip) dev 서버 미기동 — 단위 검증만 수행");
} else {
  const analysis = {
    topic: "RLC 회로의 최대 평균전력",
    interpretation: "두 개의 교류 전원이 포함된 RLC 회로. 테브난 등가로 부하 R_L의 최대 평균전력을 구한다.",
    relatedConcepts: ["테브난 등가회로", "최대 전력 전달", "phasor"],
    fillInTheBlanks: [],
    subjectKey: "circuit_theory",
    topicKey: "rlc_response",
    semantic: { hasStateTransition: false, hasEquivalentTransformation: true, hasWaveformEvolution: false, requiresMultiFigure: false },
    circuitType: { type: "universal_ac", params: {}, confidence: "high", reasoning: "smoke" },
    componentInventory: [
      { id: "I1", type: "I", value: "18∠90°A", pins: ["n_top", "GND"] },
      { id: "V1", type: "V", value: "9∠90°V", pins: ["n_top", "n_mid"] },
      { id: "R1", type: "R", value: "0.25Ω", pins: ["n_mid", "GND"] },
      { id: "L1", type: "L", value: "j3Ω", pins: ["n_top", "n_right"] },
      { id: "R2", type: "R", value: "2Ω", pins: ["n_right", "n_a"] },
      { id: "C1", type: "C", value: "-j3Ω", pins: ["n_a", "GND"] },
    ],
    topologySignature: imyong11Topology,
    nodeAnnotations: [],
    loadPlaceholders: [],
  };

  for (const mode of ["exam_similar", "exam_variant"]) {
    const res = await fetch(`${BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "dummy", subject: "circuit_theory", mode, count: 1, topicKey: "rlc_response", analysis }),
    });
    const data = await res.json();
    if (!res.ok) {
      check(`[${mode}] 생성 성공`, false, data.error);
      continue;
    }
    const p = data.problems?.[0];
    const figComponents = p?.figureVariants?.[0]?.diagram?.components ?? [];
    const figStr = figComponents.map((c) => `${c.type}=${c.value}`).join(", ");
    console.log(`  [${mode}] figure: ${figStr}`);
    console.log(`  [${mode}] answer: ${(p?.answer ?? "").replace(/\n/g, " / ")}`);

    check(`[${mode}] answer 유한 (NaN 없음)`, !/NaN|Infinity/i.test(p?.answer ?? ""));
    check(`[${mode}] figure에 V·I·L·C·R_L 모두 존재`,
      ["V", "I", "L", "C"].every((t) => figComponents.some((c) => c.type === t)) &&
      figComponents.some((c) => /^R_?L$/i.test(c.id)));

    if (mode === "exam_variant") {
      // 변형유형: V는 leg(원래 I 자리), C는 horizontal(원래 L 자리)에 있어야 함
      const vComp = figComponents.find((c) => c.type === "V");
      const cComp = figComponents.find((c) => c.type === "C");
      check(
        `[${mode}] V가 leg 위치 (id에 leg 포함 — I 자리로 교환됨)`,
        /leg/i.test(vComp?.id ?? ""),
        vComp?.id,
      );
      check(
        `[${mode}] C가 horizontal 위치 (id에 horiz/top 포함 — L 자리로 교환됨)`,
        /horiz|top/i.test(cComp?.id ?? ""),
        cComp?.id,
      );
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
