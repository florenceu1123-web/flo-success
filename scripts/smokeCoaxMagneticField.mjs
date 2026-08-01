// 동축선로의 영역별 자계 + 두 반지름의 차 (임용 11번 전자기학) — 정적 검증 (API 없음)
//
//   사용자 신고(2026-07-31): "이 문제를 생성했는데, 유사문제가 안만들어져".
//   실측 로그: analyze는 정확(topic="동축 도체의 자기장 해석", topicKey=magnetostatics)한데
//              dispatch entryId=**curl_field_current_density**(∇×H → J) — 전혀 다른 유형으로 변질.
//              validation totalIssues=0 으로 조용히 통과(CLAUDE.md "조용한 오매치").
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeCoaxMagneticField.mjs
import {
  classifyElectromagnetics, detectCoaxLineMagneticField, detectCylinderConductorField,
  detectTwoPointCharges, detectSheetLineEfieldSuperposition, detectSheetRingEfield,
  detectCurlLineIntegral, detectFluxLoopInducedCurrent, detectCoaxTwoDielectric, detectDielectricBoundary,
} from "../lib/analysis/classifyElectromagnetics.ts";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";
import { renderEmFieldDiagram } from "../lib/renderers/emFieldRenderer.ts";

// route(runElectromagneticsPipeline)의 강제 체인과 같은 순서로 재현.
const dispatch = (a) =>
  detectCoaxLineMagneticField(a) ? "coax_line_magnetic_field"
  : detectDielectricBoundary(a) ? "dielectric_boundary_field"
  : detectCoaxTwoDielectric(a) ? "coax_two_dielectric_axial"
  : detectFluxLoopInducedCurrent(a) ? "flux_loop_induced_current"
  : detectCurlLineIntegral(a) ? "curl_from_line_integral"
  : detectSheetRingEfield(a) ? "sheet_ring_efield_ratio"
  : detectSheetLineEfieldSuperposition(a) ? "sheet_line_efield_superposition"
  : detectTwoPointCharges(a) ? "two_point_charges_field_potential"
  : detectCylinderConductorField(a) ? "cylinder_conductor_current_field"
  : classifyElectromagnetics(a);

const mk = (topic, interpretation, concepts = []) => ({ topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [] });
let pass = 0, fail = 0;
const expect = (name, a, want) => {
  const got = dispatch(a);
  if (got === want) { pass++; console.log(`  ✅ ${name} → ${got}`); }
  else { fail++; console.log(`  ❌ ${name} → ${got} (기대: ${want})`); }
};
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const T = "coax_line_magnetic_field";

// ─── [1] 이 원본 — 표현이 흔들려도 전용 항목으로 ─────────────────────────
console.log("\n[1] 원본 라우팅 (표현 변형 포함)");
expect("실측 topic 그대로 (동축 도체의 자기장 해석)", mk(
  "동축 도체의 자기장 해석",
  "원통 좌표계에서 z축 상에 무한히 긴 동축선로가 놓여 있고, 반지름 a인 내부 도체에 균일한 전류 I가 a_z 방향으로, 반지름 b인 외부 도체에 균일한 전류 I가 -a_z 방향으로 흐른다. 내부 도체 안쪽에서의 자계 H1, 두 도체 사이에서의 자계 H2, 외부 도체 바깥에서의 자계 H3를 구하고, 자계의 크기가 125/π A/m로 되는 두 반지름의 차 x를 구하는 문제이다.",
  ["앙페르 주회 법칙", "동축선로", "자계", "원통 좌표계", "쇄교 전류"],
), T);
expect("'동축' 낱말 없이 내부/외부 도체만", mk(
  "내부 도체와 외부 도체의 자기장",
  "무한히 긴 내부 도체에 전류가 +a_z 방향으로 흐르고 외부 도체에 같은 크기의 전류가 -a_z 방향으로 흐를 때, 각 영역에서의 자계를 앙페르 법칙으로 구한다.",
  ["자계", "앙페르 법칙"],
), T);
expect("영역 표기가 부등식으로만 남은 경우", mk(
  "동축선로의 자계",
  "0 < ρ ≤ a, a < ρ < b, ρ > b 각 구간에서의 자기장 H를 구한다.",
  ["자기장"],
), T);
expect("'반지름의 차'가 핵심으로 남은 경우", mk(
  "동축 도체 자계",
  "동축 도체에서 자계의 크기가 주어진 값이 되는 두 반지름의 차를 구한다.",
  ["자계"],
), T);

// ─── [2] 형제 항목 회귀 — 뺏어오면 안 된다 ───────────────────────────────
console.log("\n[2] 형제 회귀 (양보해야 정상)");
expect("동축 케이블 정전용량", mk(
  "동축 케이블의 정전용량",
  "내부 도체 반지름 a, 외부 도체 반지름 b인 동축 케이블에 유전율 ε인 유전체가 채워져 있을 때 단위 길이당 정전용량 C를 구한다.",
  ["정전용량", "유전율"],
), "coax_capacitance");
expect("동축 두 도체 사이 저항 (도전율)", mk(
  "동축 원통 도체 사이의 저항",
  "내부 도체와 외부 도체 사이에 도전율 σ인 물질이 채워진 동축 원통에서 두 도체 사이의 저항 R을 전류밀도와 전계를 거쳐 구한다.",
  ["도전율", "저항"],
), "coax_resistance");
expect("단일 원통 도체(도전율) → 외부 자계", mk(
  "원통 도체의 전류와 자계",
  "반경 r, 도전율 σ인 무한히 긴 직선 원통형 도체에서 단면 A와 B 사이의 전위차와 길이가 주어질 때 도체 내부의 전계·전류 밀도·전류를 구하고 도체 외부에서의 자계의 크기를 ρ의 함수로 구한다.",
  ["도전율", "전류 밀도", "앙페르 법칙"],
), "cylinder_conductor_current_field");
expect("정사각형 폐경로 선적분 → ∇×H", mk(
  "자계의 회전",
  "자계 H가 주어진 정사각형 폐경로를 따라 선적분하고 면적으로 나눈 극한으로 ∇×H를 구하는 문제이다.",
  ["회전", "선적분", "정사각형 경로"],
), "curl_from_line_integral");

// ─── [3] 생성물 물리 재검산 ──────────────────────────────────────────────
console.log("\n[3] 생성물 재검산 (독립 계산과 대조)");
const num = (s) => Number(s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

let simOk = 0, varOk = 0, checked = 0;
for (let seed = 1; seed <= 24; seed++) {
  for (const mode of ["exam_similar", "exam_variant"]) {
    const inst = generateElectromagnetics({ seed, mode, entryId: T });
    checked++;
    if (inst.entryId !== T) { fail++; console.log(`  ❌ seed${seed}/${mode} entryId=${inst.entryId}`); continue; }

    const a = num(inst.content.match(/a = ([\d.]+)\\,\[\\mathrm\{m\}\]/)?.[1]);
    const b = num(inst.content.match(/b = ([\d.]+)\\,\[\\mathrm\{m\}\]/)?.[1]);
    const k = num(inst.content.match(/\\dfrac\{(\d+)\}\{\\pi\}\\,\[\\mathrm\{A\/m\}\]/)?.[1]);

    if (mode === "exam_similar") {
      const I = num(inst.content.match(/I = (\d+)\\,\[\\mathrm\{A\}\]/)?.[1]);
      const x = num(inst.answer.match(/x = ([\d.]+)\\,\[\\mathrm\{m\}\]/)?.[1]);
      const c1 = num(inst.answer.match(/\\dfrac\{(\d+)\\rho\}\{\\pi\}/)?.[1]);
      const c2 = num(inst.answer.match(/\\dfrac\{([\d.]+)\}\{\\pi\\rho\}/)?.[1]);
      // 독립 계산: H₁ = Iρ/(2πa²) → c1 = I/(2a²), H₂ = I/(2πρ) → c2 = I/2
      const wc1 = I / (2 * a * a), wc2 = I / 2;
      const r1 = k / wc1, r2 = wc2 / k, wx = r2 - r1;
      const good =
        near(c1, wc1) && near(c2, wc2) && near(x, wx, 1e-9) &&
        r1 > 0 && r1 <= a + 1e-9 && r2 > a - 1e-9 && r2 < b &&
        inst.answer.includes("\\mathbf{H}_3 = 0");
      if (good) simOk++;
      else { fail++; console.log(`  ❌ 유사 seed${seed}: a=${a} b=${b} I=${I} k=${k} → c1=${c1}(기대${wc1}) c2=${c2}(기대${wc2}) x=${x}(기대${wx}) r1=${r1} r2=${r2}`); }
    } else {
      const rhoC = num(inst.content.match(/\\rho = ([\d.]+)\\,\[\\mathrm\{m\}\]/)?.[1]);
      const hC = num(inst.content.match(/\\dfrac\{([\d.]+)\}\{\\pi\}\\,\[\\mathrm\{A\/m\}\]/)?.[1]);
      const I = num(inst.answer.match(/I = (\d+)\\,\[\\mathrm\{A\}\]/)?.[1]);
      const r1 = num(inst.answer.match(/\\rho_1 = ([\d.]+)\\,\[\\mathrm\{m\}\]/)?.[1]);
      // 독립 계산: |H₂(ρ_c)| = I/(2πρ_c) = hC/π → I = 2ρ_c·hC,  ρ₁ = k/(I/(2a²))
      const wI = 2 * rhoC * hC;
      const wr1 = k / (I / (2 * a * a));
      const good =
        near(I, wI, 1e-6) && near(r1, wr1, 1e-9) &&
        rhoC > a && rhoC < b && r1 > 0 && r1 <= a + 1e-9 &&
        inst.answer.includes("\\mathbf{H}_3 = 0");
      if (good) varOk++;
      else { fail++; console.log(`  ❌ 변형 seed${seed}: a=${a} b=${b} ρc=${rhoC} hC=${hC} I=${I}(기대${wI}) ρ1=${r1}(기대${wr1})`); }
    }
  }
}
ok(`유사 ${simOk}건 재검산 일치`, simOk === 24, `${simOk}/24`);
ok(`변형 ${varOk}건 재검산 일치`, varOk === 24, `${varOk}/24`);

// ─── [4] 원본 튜플이 나오지 않는지 ───────────────────────────────────────
console.log("\n[4] 원본과 동일한 문제가 나오지 않아야 함");
let sameAsOriginal = 0;
for (let seed = 1; seed <= 40; seed++) {
  const inst = generateElectromagnetics({ seed, mode: "exam_similar", entryId: T });
  if (inst.content.includes("a = 0.02") && inst.content.includes("b = 0.06") &&
      inst.content.includes("I = 10") && inst.content.includes("\\dfrac{125}{\\pi}")) sameAsOriginal++;
}
ok("원본 튜플(a=0.02·b=0.06·I=10·k=125) 미생성", sameAsOriginal === 0, `${sameAsOriginal}건`);

// ─── [5] 유사·변형이 서로 다른 문제 ─────────────────────────────────────
console.log("\n[5] 모드 분리");
const sim = generateElectromagnetics({ seed: 7, mode: "exam_similar", entryId: T });
const vari = generateElectromagnetics({ seed: 7, mode: "exam_variant", entryId: T });
ok("유사 ≠ 변형 (발문이 다름)", sim.content !== vari.content);
ok("유사는 두 반지름의 차를 요구", /두 반지름의 차/.test(sim.question));
ok("변형은 전류 I를 역산", /전류 \\\( I/.test(vari.question) || /전류 I/.test(vari.question.replace(/\\[()]/g, "")));

// ─── [6] figure 렌더 ────────────────────────────────────────────────────
console.log("\n[6] figure 렌더링");
const svg = renderEmFieldDiagram(sim.diagram);
ok("SVG 생성됨", svg.startsWith("<svg") && svg.length > 800, `${svg.length}자`);
ok("geometry = coax_current", sim.diagram.geometry === "coax_current");
ok("내부·외부 도체 라벨 포함", svg.includes("내부 도체") && svg.includes("외부 도체"));
ok("반지름 a·b 라벨 포함", /a = [\d.]+/.test(svg) && /b = [\d.]+/.test(svg));
ok("좌표축 z·ρ·φ 표기", svg.includes(">z<") && svg.includes("ρ") && svg.includes("φ"));

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
