// 시변 자속 유도 전류(flux_loop_induced_current) 라우팅 회귀 테스트 — API 호출 없음
//
//   사용자 신고(2026-07-28): "이 문제 생성했었는데 다시 하니까 안돼".
//   실측 로그: dispatch entryId=**curl_from_line_integral**(임용 11번 ∇×H) — 2026-07-23에 추가한
//   그 항목의 strong 키워드(bare "폐경로"·"선적분"·"회전")가 Vision의 패러데이 서술과 겹쳐
//   점수로 이겼다. 이 원본은 그 전부터 flux_loop_induced_current로 구현돼 있었다(= 회귀).
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeFluxLoopRouting.mjs
import {
  classifyElectromagnetics,
  detectDielectricBoundary,
  detectCoaxTwoDielectric,
  detectDielectricPotentialMode,
  detectFluxLoopInducedCurrent,
  detectCurlLineIntegral,
  detectSheetRingEfield,
} from "../lib/analysis/classifyElectromagnetics.ts";

// runElectromagneticsPipeline과 동일한 강제 체인 순서.
const dispatch = (a) =>
  detectDielectricBoundary(a) ? "dielectric_boundary_field"
  : detectCoaxTwoDielectric(a) ? "coax_two_dielectric_axial"
  : detectDielectricPotentialMode(a) ? "dielectric_two_region_cap"
  : detectFluxLoopInducedCurrent(a) ? "flux_loop_induced_current"
  : detectCurlLineIntegral(a) ? "curl_from_line_integral"
  : detectSheetRingEfield(a) ? "sheet_ring_efield_ratio"
  : classifyElectromagnetics(a);

const mk = (topic, interpretation, concepts = []) => ({ topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [] });
let pass = 0, fail = 0;
const expect = (name, a, want) => {
  const got = dispatch(a);
  if (got === want) { pass++; console.log(`  ✅ ${name} → ${got}`); }
  else { fail++; console.log(`  ❌ ${name} → ${got} (기대: ${want})`); }
};

console.log("\n[1] 이 원본(ㄷ자 도체 + 시변 자속) — Vision 표현이 흔들려도 flux_loop_induced_current");
expect("실측 analyze 결과 (오늘 재현)", mk(
  "시변 자속과 유도 전류 계산",
  "ㄷ자형 완전 도체 루프의 단자 a-b에 저항이 연결된 회로에서, 시간에 따라 변하는 자속 밀도 B=sin(t)a_x가 루프를 관통할 때, 회로에 쇄교하는 자속 Φ(t)와 저항에 흐르는 전류 i(t)를 구하는 문제이다. 자속은 Φ(t)=B(t)·A로 계산하고, 패러데이 법칙을 통해 유도 기전력 ε=−dΦ/dt를 구한 후, 저항에 흐르는 전류 i(t)=ε/R로 계산한다.",
  ["패러데이 법칙", "유도 기전력", "자속 밀도", "완전 도체 루프", "자속 쇄교", "저항 전류", "시변 자속", "운동 기전력 무시"],
), "flux_loop_induced_current");

expect("★ 신고 재현: '폐경로 선적분'으로 서술", mk(
  "자기장과 유도 전류",
  "정사각형 폐경로를 따라 자기장의 선적분을 계산하고 시간에 따라 변하는 자속에 의해 회로에 흐르는 유도 전류를 구한다.",
  ["폐경로", "선적분", "유도 전류", "패러데이 법칙"],
), "flux_loop_induced_current");

expect("★ 신고 재현: '회전(∇×E)'으로 서술", mk(
  "시변 자기장과 유도 전류",
  "시변 자기장의 회전과 유도 기전력의 관계(∇×E=−∂B/∂t)를 이용해 저항이 연결된 폐회로의 유도 전류를 구한다.",
  ["패러데이 법칙", "회전", "유도 기전력"],
), "flux_loop_induced_current");

expect("'미분형' 언급", mk(
  "시변 자속에 의한 유도 전류",
  "시간에 따라 변하는 자기장이 폐회로를 관통할 때 패러데이 법칙의 미분형을 이용해 유도 기전력을 구하고 저항에 흐르는 전류를 계산한다.",
  ["패러데이 법칙", "유도 기전력", "자속 쇄교"],
), "flux_loop_induced_current");

expect("'면적으로 나눈' 서술 (straight_wire_B 오탈취 방지)", mk(
  "자속과 유도 전류",
  "자기장이 관통하는 면적으로 나누어 단위 면적당 자속을 구하고 시변 자속에 의한 유도 전류를 계산한다.",
  ["자속밀도", "유도 전류", "패러데이"],
), "flux_loop_induced_current");

expect("'쇄교 자속' 중심 간결 요약", mk(
  "쇄교 자속과 유도 전류",
  "완전 도체 루프에 쇄교하는 자속 Φ(t)와 저항 100Ω에 흐르는 전류 i(t)를 순서대로 구한다.",
  ["쇄교 자속", "유도 전류"],
), "flux_loop_induced_current");

console.log("\n[2] 형제 회귀 — 정자계 ∇×H(임용 11번)는 그대로 curl_from_line_integral");
expect("임용11 실측 요약 #1 (경로 적분)", mk(
  "자계 합성 및 경로 적분",
  "자유 공간에서 자계 H = 20x²a_z가 주어질 때 한 변이 1인 정사각형 경로 a-b-c-d-a를 따라 ∮H·dl을 구하고, 이를 면적으로 나눈 값과 면의 단위 법선 벡터 a_n, 그리고 x₀=2에서의 ∇×H를 구하는 문제이다.",
  ["경로 적분", "자계의 회전", "암페어 법칙의 미분형"],
), "curl_from_line_integral");

expect("임용11 실측 요약 #2 (선적분·면적으로 나눔)", mk(
  "자계의 선적분",
  "자계 H=20x²a_z에 대해 폐경로를 따라 선적분한 값을 면적으로 나눈다. 정사각형 경로의 단위 법선 벡터와 회전을 구한다.",
  ["선적분", "회전"],
), "curl_from_line_integral");

console.log("\n[3] 형제 회귀 — 다른 EM 항목 무영향");
expect("직선 도선 B", mk(
  "직선 도선에 의한 자기장",
  "무한히 긴 직선 도선에 전류 I가 흐를 때 거리 r에서의 자속밀도 B=μ₀I/2πr를 구하는 문제이다.",
  ["앙페르 법칙", "자속밀도"],
), "straight_wire_B");

// ★ 형제 중 가장 가까운 유형 — 같은 em_induction이지만 "도체봉이 v로 이동"(운동 기전력)이 주체.
//   flux_loop 감지기가 이걸 뺏으면 안 된다(양보 가드 검증).
expect("운동 기전력(레일 위 도체봉)", mk(
  "자기장 속 운동 도체봉의 기전력",
  "균일한 자기장 내에서 레일 위를 도체봉이 속도 v로 이동할 때 발생하는 운동 기전력 e=BLv와 회로에 흐르는 유도 전류를 구하는 문제이다.",
  ["운동 기전력", "도체봉", "레일", "패러데이", "전자기 유도"],
), "moving_rod_emf");

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
