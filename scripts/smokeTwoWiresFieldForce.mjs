// 두 무한 직선 도선(전류 반대 방향) 합성 자계 → 위치 a → 단위 길이당 힘 (임용 11번) — API 없음
//
//   실측(2026-08-02): 이 원본이 **straight_wire_B**(단일 도선 B=μ₀I/2πr)로 dispatch돼
//   도선 1개짜리 단순 계산 문제가 생성됐다. 도선이 "2개"라는 사실은 텍스트 점수로 안 갈리므로
//   구조 감지기(detectTwoWiresFieldForce)로 강제한다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeTwoWiresFieldForce.mjs
import {
  classifyElectromagnetics, detectDielectricBoundary, detectCoaxTwoDielectric,
  detectDielectricPotentialMode, detectFluxLoopInducedCurrent, detectCurlLineIntegral,
  detectSheetRingEfield, detectSheetLineEfieldSuperposition, detectPointLineChargeForce,
  detectSheetCurrentsVectorPotential, detectTwoPointCharges, detectCylinderConductorField,
  detectCoaxLineMagneticField, detectTwoWiresFieldForce,
} from "../lib/analysis/classifyElectromagnetics.ts";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";
import { renderEmFieldDiagram } from "../lib/renderers/emFieldRenderer.ts";

// runElectromagneticsPipeline과 **동일한** 강제 체인 순서 (다르면 거짓 실패가 난다)
const dispatch = (a) =>
  detectTwoWiresFieldForce(a) ? "two_wires_field_force"
  : detectCoaxLineMagneticField(a) ? "coax_line_magnetic_field"
  : detectDielectricBoundary(a) ? "dielectric_boundary_field"
  : detectCoaxTwoDielectric(a) ? "coax_two_dielectric_axial"
  : detectDielectricPotentialMode(a) ? "dielectric_two_region_cap"
  : detectFluxLoopInducedCurrent(a) ? "flux_loop_induced_current"
  : detectCurlLineIntegral(a) ? "curl_from_line_integral"
  : detectSheetRingEfield(a) ? "sheet_ring_efield_ratio"
  : detectSheetCurrentsVectorPotential(a) ? "sheet_currents_vector_potential"
  : detectPointLineChargeForce(a) ? "point_line_charge_force"
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
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

const T = "two_wires_field_force";

console.log("\n[1] 이 원본 — 표현이 흔들려도 two_wires_field_force");
// ★ 실측 analyze 결과 그대로 (신고 재현: 이 텍스트가 straight_wire_B로 갔다)
expect("실측 analyze 요약", {
  topic: "무한 도선 전류의 합성 자기장",
  interpretation: "문제는 자유 공간에서 두 무한 도선 A와 B에 흐르는 전류에 의해 점 P에서의 합성 자기장을 구하는 것이다. 도선 A는 x=0, y=1[m]에 위치하고, 도선 B는 x=0, y=a[m]에 위치하며, 각각 반대 방향으로 전류가 흐른다. 단계별로 각 도선에 의한 자기장을 구하고, 그 크기의 비율을 통해 a를 결정한 후, B에 작용하는 단위 길이당 힘을 구한다.",
  relatedConcepts: ["무한 도선 자기장", "자기장 합성", "단위 길이당 힘", "비오-사바르 법칙", "앙페르 법칙"],
  fillInTheBlanks: [
    { sentence: "두 도선 사이의 힘은 ____에 비례한다.", answer: "전류의 곱" },
    { sentence: "합성 자기장은 각 도선의 자기장을 ____하여 구한다.", answer: "벡터 합성" },
  ],
  topicKey: "magnetostatics",
}, T);

expect("'합성 자계' 표현", mk(
  "두 무한 직선 도선에 의한 합성 자계",
  "z축과 나란한 두 무한 도선 A, B에 서로 반대 방향의 전류가 흐를 때 점 O와 점 P에서의 합성 자계를 구하고, 크기 비 조건으로 도선 B의 위치 a를 구한 뒤 도선 B에 작용하는 단위 길이당 힘을 구한다.",
  ["앙페르 법칙", "합성 자계", "평행 도선 사이의 힘"],
), T);

expect("'단위길이당' 붙여쓰기 + '자장'", mk(
  "무한 도선 2개의 자장",
  "무한 도선 A와 도선 B가 나란히 놓여 있을 때 두 점에서의 자장의 크기 비를 이용해 위치를 정하고 도선 B에 작용하는 단위길이당 힘을 구한다.",
  ["자장", "도선 A", "도선 B"],
), T);

expect("힘 언급 없이 '크기 비'만", mk(
  "평행한 두 도선의 자계",
  "평행한 두 도선에 흐르는 전류에 의한 원점과 점 P에서의 자계의 크기 비가 3:5가 되도록 하는 값을 구한다.",
  ["앙페르 법칙", "자계"],
), T);

expect("영문 혼용 요약", mk(
  "Magnetic field of two infinite wires",
  "두 무한 도선에 흐르는 전류가 만드는 자기장을 중첩하여 구하고, 도선 B에 작용하는 단위 길이당 힘 F [N/m]를 계산한다.",
  ["Ampere's law", "자기장"],
), T);

console.log("\n[2] 형제 회귀 — 다른 EM 항목을 뺏지 않는다");
expect("단일 직선 도선(B=μ₀I/2πr)", mk(
  "무한 직선 도선의 자기장",
  "무한히 긴 직선 도선에 전류 I가 흐를 때 도선으로부터 거리 r인 점에서의 자속밀도 B를 앙페르 법칙으로 구한다.",
  ["앙페르 법칙", "자기장"],
), "straight_wire_B");

expect("면전류 + 선전류 합성 자계", mk(
  "면전류와 선전류에 의한 합성 자계",
  "무한 면전류 K a_x와 무한 선전류 I a_x가 함께 있을 때 점 P에서 두 자계의 합성 자계가 k a_z가 되는 h와 k를 구한다.",
  ["면전류", "선전류", "합성 자계"],
), "sheet_line_superposition");

expect("두 원형 루프 축상 자계", mk(
  "두 원형 전류 루프의 축상 자계 합성",
  "반지름이 서로 다른 두 원형 루프 C1, C2에 전류가 흐를 때 점 P에서의 합성 자계가 목표값이 되는 전류 I를 구한다.",
  ["원형 루프", "축상 자계", "합성 자계"],
), "circular_loop_axis_field");

expect("자기장 속 도선의 힘(F=BIL)", mk(
  "자기장 속 전류 도선에 작용하는 힘",
  "균일한 자속밀도 B 안에 놓인 길이 L인 도선에 전류 I가 흐를 때 도선에 작용하는 힘 F=BIL을 구한다.",
  ["자기력", "F=BIL"],
), "force_on_wire");

expect("동축선로 영역별 자계", mk(
  "동축선로의 자계",
  "무한히 긴 동축선로의 내부 도체에 +a_z 방향, 외부 도체에 −a_z 방향의 전류가 흐를 때 앙페르 법칙으로 영역별 자계를 구한다.",
  ["동축선로", "앙페르 법칙"],
), "coax_line_magnetic_field");

expect("시변 자속 유도 전류", mk(
  "시변 자속에 의한 유도 전류",
  "고정된 ㄷ자 완전 도체 루프에 시간에 따라 변하는 자속밀도가 관통할 때 쇄교 자속과 저항에 흐르는 유도 전류 i(t)를 구한다.",
  ["패러데이 법칙", "유도 전류", "쇄교 자속"],
), "flux_loop_induced_current");

expect("정사각형 폐경로 → ∇×H", mk(
  "폐경로 선적분과 자계의 회전",
  "자계 H가 좌표의 함수로 주어질 때 정사각형 폐경로를 따라 선적분하고 면적으로 나누어 자계의 회전을 구한다.",
  ["회전", "선적분", "암페어 법칙의 미분형"],
), "curl_from_line_integral");

console.log("\n[3] 물리 재검산 — 생성물을 독립 공식으로 다시 푼다");
// 독립 구현: H(y) = ∓I/(2π(y−y₀)) a_x, 비 = (y_P−y_A)(a−y_P) : y_A·a, F = μ₀I_AI_B/(2π(a−y_A))
for (const mode of ["exam_similar", "exam_variant"]) {
  let checked = 0, bad = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const inst = generateElectromagnetics({ seed, mode, entryId: T });
    const gv = inst.givens.join("\n");
    // 문제(조건)에서 파라미터 회수 — 조건 줄은 "무한 도선 A — … y=1… 전류 4…" 형식
    const lineA = /무한 도선 A[^\n]*/.exec(gv)?.[0] ?? "";
    const lineB = /무한 도선 B[^\n]*/.exec(gv)?.[0] ?? "";
    const yA = Number(/y=(\d+)/.exec(lineA)?.[1]);
    const yP = Number(/P\}\(0,(\d+),0\)/.exec(gv)?.[1]);
    const ratio = /= (\d+) : (\d+) /.exec(gv);
    const m = Number(ratio?.[1]), n = Number(ratio?.[2]);
    const IA = Number(/전류 \\\( (\d+)/.exec(lineA)?.[1]);
    const g = yP - yA;
    let a, IB;
    if (mode === "exam_similar") {
      a = Number(/\[단계 2\] \\\( a = (\d+)/.exec(inst.answer)?.[1]);
      IB = IA; // 유사유형은 두 도선 전류 크기가 같다(원본 구조)
      // 독립 재계산: a = n·g·y_P /(n·g − m·y_A)
      const want = (n * g * yP) / (n * g - m * yA);
      if (!(Number.isFinite(a) && Math.abs(want - a) < 1e-9 && a > yP)) { bad++; console.log(`    ❌ seed${seed} a=${a} 기대 ${want} (yA=${yA},yP=${yP},${m}:${n})`); continue; }
    } else {
      a = Number(/y=(\d+)/.exec(lineB)?.[1]);
      IB = Number(/\[단계 2\] \\\( I = (\d+)/.exec(inst.answer)?.[1]);
      // 독립 재계산: 비 조건 n(I_A/y_A − I/a) = m(I_A/g + I/(a−y_P))
      const lhs = n * (IA / yA - IB / a), rhs = m * (IA / g + IB / (a - yP));
      if (!(Number.isFinite(IB) && Math.abs(lhs - rhs) < 1e-9 && IA / yA - IB / a > 0)) { bad++; console.log(`    ❌ seed${seed} I=${IB} 비 불일치 (${lhs} vs ${rhs})`); continue; }
    }
    // 힘: μ₀I_AI_B/(2π(a−y_A)) — 답의 분수 p/q와 일치해야 한다
    const f = /\\dfrac\{(\d*)\\mu_0\}\{(\d*)\\pi\}/.exec(inst.answer);
    const p = f ? Number(f[1] || 1) : NaN, q = f ? Number(f[2] || 1) : NaN;
    const want = (IA * IB) / (2 * (a - yA));
    if (!(Math.abs(p / q - want) < 1e-9)) { bad++; console.log(`    ❌ seed${seed} F=${p}/${q}μ₀/π 기대 ${want} (I_A=${IA},I_B=${IB},d=${a - yA})`); continue; }
    // 척력(+a_y)·3단계·figure 확인
    if (!inst.answer.includes("\\mathbf{a}_y") || !inst.answer.includes("[단계 3]")) { bad++; console.log(`    ❌ seed${seed} 방향/단계 누락`); continue; }
    if (inst.diagram?.geometry !== "two_wires_axes") { bad++; console.log(`    ❌ seed${seed} geometry=${inst.diagram?.geometry}`); continue; }
    checked++;
  }
  ok(`${mode} 12개 재검산 (통과 ${checked}, 실패 ${bad})`, bad === 0 && checked === 12);
}

console.log("\n[4] 원본 값 검증 — 공식이 원본 정답(a=5, F=μ₀/2π)을 재현하는가");
{
  const yA = 1, yP = 2, m = 3, n = 5, I = 2, g = yP - yA;
  const a = (n * g * yP) / (n * g - m * yA);
  const F = (I * I) / (2 * (a - yA)); // ×μ₀/π
  ok("원본: a = 5", a === 5, `→ ${a}`);
  ok("원본: F = μ₀/(2π) a_y", Math.abs(F - 0.5) < 1e-12, `→ ${F}μ₀/π`);
}
{
  // 원본 튜플은 생성 풀에서 제외돼야 한다 (참조 전용)
  let leaked = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const inst = generateElectromagnetics({ seed, mode: "exam_similar", entryId: T });
    const gv = inst.givens.join("\n");
    const yA = Number(/y=(\d+)/.exec(/무한 도선 A[^\n]*/.exec(gv)?.[0] ?? "")?.[1]);
    const yP = Number(/P\}\(0,(\d+),0\)/.exec(gv)?.[1]);
    const r = /= (\d+) : (\d+) /.exec(gv);
    if (yA === 1 && yP === 2 && r?.[1] === "3" && r?.[2] === "5") leaked++;
  }
  ok("원본 조합(y_A=1·y_P=2·3:5 → a=5) 미생성", leaked === 0, `→ ${leaked}건`);
}

console.log("\n[5] 렌더 구조 — 도선 2개·전류 화살표·O/P·좌표축");
{
  const inst = generateElectromagnetics({ seed: 3, mode: "exam_similar", entryId: T });
  const svg = renderEmFieldDiagram(inst.diagram);
  ok("SVG 생성 (에러 아님)", svg.startsWith("<svg") && !svg.includes("<pre>"));
  ok("도선 2개(수직선)", (svg.match(/stroke-width="2.2"/g) ?? []).length >= 2);
  ok("전류 화살표 2개", (svg.match(/marker-end="url\(#emArrowR\)"/g) ?? []).length >= 2);
  ok("좌표축 z·y·x", svg.includes("z[m]") && svg.includes("y[m]") && svg.includes("x[m]"));
  ok("O·P·도선 라벨", svg.includes(">O<") && svg.includes(">P<") && svg.includes("도선 A") && svg.includes("도선 B"));
}

console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail === 0 ? 0 : 1);
