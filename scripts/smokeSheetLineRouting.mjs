// 무한 면전하 + 직선 선전하 합성 전계(임용 11번) 라우팅 회귀 — API 없음
//
//   사용자 신고: "이 문제가 생성돼. 완전 다른 문제야" → 실측 dispatch entryId=**potential_to_charge_density**
//   (전위 함수 V(x,y,z)→ρ_v). 이 항목의 strong 키워드가 "합성 전계" 하나뿐이라 Vision이 "전위·전계"를
//   많이 쓰는 실행에서 점수로 밀린다 → 구조 시그니처 감지기로 강제한다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSheetLineRouting.mjs
import {
  classifyElectromagnetics, detectDielectricBoundary, detectCoaxTwoDielectric,
  detectDielectricPotentialMode, detectFluxLoopInducedCurrent, detectCurlLineIntegral,
  detectSheetRingEfield, detectSheetLineEfieldSuperposition, detectPointLineChargeForce,
} from "../lib/analysis/classifyElectromagnetics.ts";

// runElectromagneticsPipeline과 동일한 강제 체인 순서
const dispatch = (a) =>
  detectDielectricBoundary(a) ? "dielectric_boundary_field"
  : detectCoaxTwoDielectric(a) ? "coax_two_dielectric_axial"
  : detectDielectricPotentialMode(a) ? "dielectric_two_region_cap"
  : detectFluxLoopInducedCurrent(a) ? "flux_loop_induced_current"
  : detectCurlLineIntegral(a) ? "curl_from_line_integral"
  : detectSheetRingEfield(a) ? "sheet_ring_efield_ratio"
  : detectPointLineChargeForce(a) ? "point_line_charge_force"
  : detectSheetLineEfieldSuperposition(a) ? "sheet_line_efield_superposition"
  : classifyElectromagnetics(a);

const mk = (topic, interpretation, concepts = []) => ({ topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [] });
let pass = 0, fail = 0;
const expect = (name, a, want) => {
  const got = dispatch(a);
  if (got === want) { pass++; console.log(`  ✅ ${name} → ${got}`); }
  else { fail++; console.log(`  ❌ ${name} → ${got} (기대: ${want})`); }
};

const T = "sheet_line_efield_superposition";
console.log("\n[1] 이 원본 — 표현이 흔들려도 sheet_line_efield_superposition");
expect("실측 analyze 요약", mk(
  "무한 면전하와 선전하의 합성 전계",
  "자유 공간 내 직각 좌표계에서 무한 면전하와 무한 선전하가 주어졌을 때 점 P에서의 합성 전계가 0이 되는 선전하 밀도를 구하고, 점 Q에서의 합성 전계를 계산한다.",
  ["무한 면전하", "무한 선전하", "합성 전계", "전계의 중첩 원리", "가우스 법칙"],
), T);

expect("★ 신고 재현: '전위'를 많이 쓰는 요약", mk(
  "전계와 전위 계산",
  "무한 면전하와 무한 선전하가 만드는 전계를 구하고, 전위와 전계의 관계를 이용해 특정 점에서 전계가 0이 되는 조건을 구한다.",
  ["전계", "전위", "면전하", "선전하", "가우스 법칙"],
), T);

expect("'합성' 없이 '전체 전계'", mk(
  "전기장 문제",
  "무한 평면에 분포한 면전하와 직선에 분포한 선전하에 의한 전체 전계를 구하고 상쇄되는 조건을 찾는다.",
  ["면전하", "선전하", "전계"],
), T);

expect("ρ_l 기호만 등장", mk(
  "자유 공간의 전계",
  "면전하 밀도 ρ_s와 ρ_l이 주어질 때 점 P에서 전계가 0이 되도록 하는 값을 구한다.",
  ["면전하", "ρ_l", "전계"],
), T);

console.log("\n[2] 형제 회귀 — 다른 EM 항목을 뺏지 않는다");
expect("전위 함수 V(x,y,z) → ρ_v (경쟁 항목)", mk(
  "전위 함수로부터 체적 전하 밀도",
  "자유 공간에서 전위가 V(x,y,z)=2x²yz로 주어질 때 점 P에서의 체적 전하 밀도를 구한다. 전계는 −∇V이고 ρ_v = −ε₀∇²V이다.",
  ["전위 함수", "라플라시안", "체적 전하 밀도", "전계"],
), "potential_to_charge_density");

expect("면전하 + 원형 링 선전하 (형제)", mk(
  "면전하와 원형 링의 합성 전계",
  "무한 면전하와 반지름 R인 원형 링에 분포한 선전하가 축상 점에서 만드는 전계의 비를 이용해 선전하 밀도를 구한다.",
  ["면전하", "원형 루프", "합성 전계", "선전하"],
), "sheet_ring_efield_ratio");

expect("면전류 + 선전류 (자계)", mk(
  "면전류와 선전류의 합성 자계",
  "무한 면전류와 무한 선전류가 만드는 자계를 합성해 특정 점에서의 자계를 구한다.",
  ["면전류", "선전류", "합성 자계", "앙페르 법칙"],
), "sheet_line_superposition");

expect("단일 무한 선전하", mk(
  "무한 선전하에 의한 전계",
  "무한히 긴 직선 선전하로부터 거리 r에서의 전계 E=λ/(2πε₀r)를 구하는 문제이다.",
  ["선전하", "전계", "가우스 법칙"],
), "line_charge_field");

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
