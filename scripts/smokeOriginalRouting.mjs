// ★★ 통합 라우팅 회귀 — "원본 → 기대 archetype" 한 번에 검사 (API 없음)
//
//  왜 있는가 (2026-07-29, 사용자 요청 "다신 같은 실수가 일어나지 않게"):
//   이번 주 신고 대부분이 **전용 archetype은 있는데 넓은 분기·generic 경로가 가로챈** 사고였다.
//   개별 archetype 스모크는 자기 유형만 보므로, 나중에 추가된 분기가 **남의 유형을 잠식**해도
//   조용히 통과한다. 여기 실측 Vision 요약을 한 곳에 모아 두면, 분류기·감지기를 건드릴 때마다
//   전 유형 라우팅이 한 번에 검증된다.
//
//  ※ 새 archetype/분기를 추가하면 **여기에 원본 한 줄을 추가**할 것 (CLAUDE.md 규칙).
//
//  실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeOriginalRouting.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import {
  classifyElectromagnetics, detectDielectricBoundary, detectCoaxTwoDielectric,
  detectDielectricPotentialMode, detectFluxLoopInducedCurrent, detectCurlLineIntegral,
  detectSheetRingEfield, detectSheetLineEfieldSuperposition, detectTwoPointCharges,
  detectCylinderConductorField,
  detectCoaxLineMagneticField,
  detectPointLineChargeForce, detectSheetCurrentsVectorPotential,
} from "../lib/analysis/classifyElectromagnetics.ts";
import { detectSwitchedRlDepI } from "../lib/pipeline/runSwitchedRlDepIPipeline.ts";
import { detectJkExcitationSopPos } from "../lib/pipeline/runJkExcitationSopPosPipeline.ts";
import { detectAcSuperpositionSourceDesign } from "../lib/pipeline/runAcSuperpositionSourceDesignPipeline.ts";
import { detectDcWheatstoneBalance } from "../lib/pipeline/runDcWheatstoneBalancePipeline.ts";
import { detectTheveninDepVoltageProblem } from "../lib/pipeline/runTheveninDepVoltagePipeline.ts";
import { routePipeline } from "../lib/analysis/routePipeline.ts";

// ★ tags/objective까지 받는다 — route.ts는 분류기 뒤에 `routePipeline`을 한 번 더 태우는데,
//   그걸 모델링하지 않으면 **분류기는 맞는데 router가 덮어쓰는** 사고를 여기서 못 잡는다
//   (실측 2026-08-01: opamp_rc_t_oscillator가 tags.opamp+oscillator 때문에 generic opamp로 덮여
//    Wien Bridge가 반복 생성됐다. 스모크는 그때도 통과했다 — 이 구멍 때문).
const mk = (topic, interpretation, concepts = [], inventory = [], tags = [], objective = {}) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
  tags, learningObjective: objective,
});
const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split(":");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});

// EM은 파이프라인의 강제 체인과 동일 순서로 평가한다.
const emDispatch = (a) =>
  detectCoaxLineMagneticField(a) ? "coax_line_magnetic_field"
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

/**
 * 회로/디지털: 분류기 결과 + (필요 시) route 안전망까지 반영한 최종 판정.
 *   route는 generic일 때만 안전망을 적용하므로 여기서도 같은 규칙을 쓴다.
 */
const GENERIC = new Set([
  "unsupported", "topology_driven", "universal_dc", "universal_ac", "universal_digital",
  "dc_mesh", "dc_nodal", "rl_step", "rc_step", "rlc_step", "switched_rc", "switched_rl",
  "thevenin", "norton", "opamp", "opamp_generic", "fsm", "sequential_dff_generic", "combinational_gate",
]);
const circuitDispatch = (a, subject) => {
  // ※ 아래 본체가 분류기 + 안전망을 모델링하고, 마지막에 routePipeline을 태운다(route.ts 순서).
  // ★ route는 이 감지기를 **circuitType과 무관하게** dispatch 체인 앞에서 먼저 본다(route.ts:885).
  //   모델을 실제 순서와 다르게 두면 스모크가 거짓 실패를 낸다(실측).
  // route 순서: 종속 전압원 테브난 → 종속 전류원 RL → (그 뒤 일반 체인)
  if (subject === "circuit_theory" && detectTheveninDepVoltageProblem(a)) return "thevenin_dep_voltage";
  if (subject === "circuit_theory" && detectSwitchedRlDepI(a)) return "switched_rl_dep_i";
  let t = classifyCircuitType(a, subject).type;
  if (GENERIC.has(t)) {
    if (detectJkExcitationSopPos(a)) t = "jk_excitation_sop_pos";
    else if (detectAcSuperpositionSourceDesign(a)) t = "ac_superposition_source_design";
    else if (detectDcWheatstoneBalance(a)) t = "dc_wheatstone_balance";
  }
  // ★★ route.ts는 여기서 routePipeline을 한 번 더 태우고, 결과가 다르면 circuitType을 교체한다.
  //   이 단계를 빼먹으면 "분류기는 맞는데 router가 덮어쓰는" 사고를 스모크가 못 잡는다(실측).
  const routed = routePipeline({
    circuitType: t,
    tags: a.tags ?? [],
    objective: a.learningObjective ?? {},
    subjectKey: subject,
    hasTopologySignature: false,
  });
  return routed.circuitType ?? t;
};

// ─────────────────────────────────────────────────────────────────────
// 원본 목록 — 실측 Vision 요약 기반. [이름, analysis, 과목, 기대 라우팅, 도메인]
// ─────────────────────────────────────────────────────────────────────
const CASES = [
  ["DC 휘트스톤 브리지 평형 (임용 3번)", mk(
    "휘트스톤 브리지 회로 해석",
    "휘트스톤 브리지 회로에서 평형 조건을 만족시키는 저항 R_x의 값을 구하고, 이때의 출력 전압 V_o를 계산하는 문제입니다.",
    ["휘트스톤 브리지", "평형 조건", "저항 분압"],
    inv("V:22V", "R:4Ω", "R:4Ω", "R:15Ω", "R:5Ω", "R:12Ω", "R:6Ω", "R:6Ω"),
  ), "circuit_theory", "dc_wheatstone_balance"],

  ["2전원 페이저 중첩 → 전원 크기 (임용 5번)", mk(
    "RLC 회로의 페이저 해석",
    "교류 전원을 포함한 RLC 회로에서 커패시터 양단의 페이저 전압을 주어진 조건에 맞추기 위해 전압원과 전류원의 크기를 구하는 문제입니다.",
    ["페이저", "커패시터 전압", "전원 크기"],
    inv("V:V_s∠0°V", "I:I_s∠-90°A", "R:1Ω", "R:2Ω", "R:2Ω", "L:j11Ω", "C:-j10Ω"),
  ), "circuit_theory", "ac_superposition_source_design"],

  // ★ 실측 재신고(2026-08-01): Vision이 "어드미턴스"를 흘린 회차에서 generic RLC 직렬 공진으로 샜다.
  //   요구의 구조(실수부·허수부 분해 + 공진)로도 잡히는지 여기서 회귀 감시한다.
  ["어드미턴스 공진 — '어드미턴스' 누락 회차 (임용 7번)", mk(
    "RLC 회로의 공진 주파수와 전류 최댓값",
    "교류 전원이 포함된 RLC 회로에서 점선 내부 회로에 대한 등가 회로의 실수부 a와 허수부 b를 각각 ω가 포함된 식으로 구하고, 이를 이용하여 회로의 공진 주파수 ω₀[rad/s]와 전류 i(t)의 최댓값 I_M[A]을 구한다.",
    ["공진 주파수", "전류의 최댓값", "실수부", "허수부"],
    inv("V:10cos(ωt)V", "C:0.05F", "R:1Ω", "L:0.1H"),
  ), "circuit_theory", "ac_admittance_resonance"],

  ["AC 평균전력 (RL + 병렬 R 2개, 임용 8번)", mk(
    "교류 전원이 포함된 RL 응용 회로의 평균전력",
    "그림은 교류 전원이 포함된 RL 응용 회로이다. 전원이 공급하는 전력과 인덕터 및 저항에서 소비되는 전력을 각각 구하려고 한다. V는 v(t)=Vcosωt의 페이저 전압이다.",
    ["교류 전원", "평균전력", "인덕터", "페이저"],
    inv("V:8∠0°V", "L:j2/3Ω", "R:1Ω", "R:2Ω"),
  ), "circuit_theory", "ac_rl_average_power"],

  ["사다리 테브난 복소 최대전력 (임용 7번)", mk(
    "RLC 회로의 최대 전력 전달",
    "교류 전원이 포함된 RLC 회로에서 테브난 등가 회로를 구하고, 부하에 최대 전력을 전달하기 위한 복소 임피던스를 찾는다.",
    ["테브난 등가 회로", "최대 전력 전달 정리", "복소 임피던스"],
    inv("V:4∠0°V", "L:j2Ω", "C:-j1Ω", "R:2Ω"),
  ), "circuit_theory", "ac_thevenin_ladder"],

  ["스위치 2전원 RC + 테브난 (임용 9번)", mk(
    "RC 회로의 과도 응답 분석",
    "스위치가 단자1에 연결된 정상상태에서 커패시터 전압을 구하고, 점선 부분의 테브난 등가전압과 등가저항을 구한 뒤, t=0에 스위치가 단자2로 이동했을 때 v_o(t)를 구한다.",
    ["테브난 등가", "RC 과도응답", "스위치"],
    inv("V:10V", "V:20V", "R:1Ω", "R:2Ω", "R:4Ω", "R:2Ω", "C:0.1F", "SW"),
  ), "circuit_theory", "thevenin_switched_rc"],

  ["스위치 RL + 종속 전류원 (임용 5번)", mk(
    "RL 회로의 과도응답 분석",
    "RL 회로에서 스위치가 개방될 때의 과도응답을 분석한다. 인덕터 초기 전류와 저항 전류의 최종값, 시정수를 구한다.",
    ["과도응답", "시정수", "종속 전류원"],
    inv("SW", "R:20Ω", "I:i_a", "I:10i_a", "L:5H", "R:4Ω", "V:12V"),
  ), "circuit_theory", "switched_rl_dep_i"],

  ["종속 전압원 + 테브난 (임용 6번)", mk(
    "테브난 등가 회로와 종속 전압원",
    "독립 전압원과 종속 전압원(4v_x)이 포함된 회로에서 점선 영역을 테브난 등가 회로로 변환하고, 시험 전류원 1A를 인가해 R_TH를 구한 뒤 부하 저항 R_L의 전압 V_L과 전류 I_L을 구한다.",
    ["테브난 등가", "종속 전압원", "시험 전원법", "부하 저항"],
    inv("V:50V", "R:5Ω", "VCVS:4v_x", "R:4Ω", "R:3.2Ω"),
  ), "circuit_theory", "thevenin_dep_voltage"],

  ["JK 여기표 + 불함수 (2025 전기 A-8)", mk(
    "순서 논리 회로 분석",
    "주어진 순서 논리 회로의 상태 여기를 통해 플립플롭 입력을 구하고, 이를 바탕으로 논리 회로를 완성한다.",
    ["순서 논리 회로", "플립플롭", "상태 전이표", "J-K 플립플롭"],
  ), "digital_logic", "jk_excitation_sop_pos"],

  ["조합논리 ↔ 4×1 MUX 등가 (임용 5번)", mk(
    "조합논리회로와 멀티플렉서",
    "입력 변수 A, B, C를 갖는 조합논리회로의 불 함수를 최대항의 곱으로 표현하고 최소항의 합으로 변환한 뒤, 4×1 멀티플렉서 등가회로의 입력신호를 구한다.",
    ["조합논리회로", "멀티플렉서", "최대항의 곱", "등가회로"],
  ), "digital_logic", "mux_implementation"],

  ["디멀티플렉서 + 출력 파형 (임용 8번)", mk(
    "조합논리회로의 출력 파형",
    "NAND 게이트로 구성된 조합논리회로에서 입력신호와 선택선 S1, S0가 인가될 때 F0~F3의 출력 파형을 도시하는 문제이다. 선택선 조합에 따라 하나의 출력만 활성화된다.",
    ["조합논리회로", "디멀티플렉서", "선택선", "출력 파형", "NAND 게이트"],
  ), "digital_logic", "demux_waveform"],

  ["2진수 음수 표현 방식 판별 (임용 4번)", mk(
    "2진수 음수 표현 방식",
    "4비트의 2진수로 10진수의 양수와 음수를 표현한 두 그림에서 사용된 음수 표현 방식을 각각 구하는 문제이다. 2의 보수와 1의 보수 표현의 차이를 비교한다.",
    ["2진수", "음수 표현", "2의 보수", "1의 보수", "부호 비트"],
  ), "digital_logic", "number_representation"],

  ["mod-N 카운터 + 리셋 게이트 (임용 9번)", mk(
    "mod-7 동기식 카운터 설계",
    "T 플립플롭과 D 플립플롭을 사용하여 mod-7 동기식 카운터를 설계한다. 상태도에 따라 사용되지 않는 상태를 구하고, 초기 상태로 리셋하기 위한 논리 회로를 완성한다.",
    ["T 플립플롭", "D 플립플롭", "동기식 카운터", "상태도", "리셋 회로", "모듈러 카운터"],
  ), "digital_logic", "mod_n_counter_reset"],

  ["T-FF 3개 자율 카운터 + T_B 최소 SOP → NAND 2개 (임용 11번)", mk(
    "T 플립플롭 3개를 이용한 동기식 카운터",
    "T 플립플롭 3개로 구성된 카운터의 상태도가 주어질 때 상태표의 빈칸 ㉠과 ㉡을 구하고, T_B를 최소화된 곱의 합으로 간략화한 뒤 이를 2입력 NAND 게이트 2개로 구현하여 회로의 ㉢을 도시하는 문제이다. 상태는 C, B, A의 순서로 표기하며 순환하지 않는 상태도 존재한다.",
    ["T 플립플롭", "동기식 카운터", "상태도", "여기표", "곱의 합", "NAND 게이트"],
  ), "digital_logic", "tff3_autonomous_counter"],

  ["임용7 T-FF 2개 + 외부 입력 C (형제 회귀)", mk(
    "T 플립플롭 순서논리회로의 상태표",
    "T 플립플롭 2개(T_A, T_B)와 외부 입력 C로 구성된 순서논리회로에서 상태표의 빈칸 ㉠~㉧을 채우고 Q_A(t+1)·Q_B(t+1)의 카르노도를 작성하여 최소 SOP를 구한다.",
    ["T 플립플롭", "상태표", "카르노도"],
  ), "digital_logic", "tff_state_table_blank"],

  ["시퀀스 검출기 '110' (임용 8번)", mk(
    "시퀀스 검출기 설계",
    "입력 신호가 '110' 순서로 입력될 때 출력이 1이 되는 시퀀스 검출기를 설계하는 문제입니다. 상태 전이도와 상태표를 통해 상태 변화를 분석하고 D 플립플롭을 사용한다.",
    ["시퀀스 검출기", "D 플립플롭", "상태 전이도", "상태표"],
  ), "digital_logic", "sequence_detector"],

  ["JFET 전압 바이어스 (임용 2번 전자)", mk(
    "JFET 전압 바이어스 회로",
    "JFET 전압 바이어스 회로에서 JFET의 드레인 전압 V_D = 13[V]이고 게이트-소스 전압 V_GS = −4[V]일 때, 게이트 전압 V_G[V]와 드레인 저항 R_D[Ω]를 구하는 문제이다. JFET는 이상적으로 동작하고 게이트 전류는 무시한다.",
    ["JFET", "전압 바이어스", "분압", "드레인 저항"],
    inv("V:+15V", "R:180kΩ", "R:120kΩ", "R:1kΩ", "JFET"),
  ), "electronics", "jfet_voltage_bias"],

  ["OPAMP T형 RC망 + 사인파 발진기 (임용 9번 전자)", mk(
    "연산증폭기 응용 회로와 사인파 발진기",
    "그림 (가)는 연산증폭기 응용 회로이며, 그림 (나)는 (가)의 회로에서 출력단자와 입력단자를 연결하여 구성한 사인파 발진기이다. (가)의 전달특성 V_out(s)/V_in(s)와 (나)에서 V_out의 주파수를 구한다. 전류 I_1(s)와 I_2(s)를 각각 구하고 특성방정식의 근에서 주파수를 구한다.",
    ["연산증폭기", "사인파 발진기", "전달특성", "특성방정식", "복소주파수"],
    inv("OPAMP", "R", "R", "C", "C", "C:2C", "R:R/2"),
    // ★ 실측 tags — 이 조합이 routePipeline의 OPAMP override를 발화시켜 generic opamp로
    //   덮어썼고, Wien Bridge가 반복 생성됐다(사용자 신고 3회). 여기서 회귀 감시한다.
    ["opamp", "oscillator", "transfer_function"],
  ), "electronics", "opamp_rc_t_oscillator"],

  ["Wien Bridge 발진기 (임용 11번 전자)", mk(
    "OPAMP 발진기 회로 분석",
    "OPAMP를 이용한 발진기 회로에서 발진 조건을 구한다. RC 회로망과 OPAMP를 사용하며 β(s)와 1-Kβ(s)=0 조건을 활용한다.",
    ["발진기", "RC 회로망", "특성방정식"],
    inv("R", "R", "R", "OPAMP", "R", "R"),
    ["opamp", "oscillator"],   // 진짜 Wien은 여전히 OPAMP path로 가야 한다
  ), "electronics", "opamp"],   // ※ opamp 경로 안에서 detectOpampArchetype이 WIEN으로 분기

  ["유한 이득 OPAMP + 출력 오프셋 V_B (임용 9번 전자)", mk(
    "OPAMP 회로 해석",
    "개루프 이득이 A_0인 연산증폭기 회로에서 되먹임 저항 R_1, R_2로 결정되는 β를 구하고, 출력단에 직렬로 연결된 전압원 V_B를 고려하여 V_out = V_D - V_B 관계로부터 출력전압을 구한다.",
    ["개루프 이득", "되먹임", "출력 전압원", "가상 단락 불성립"],
    inv("OPAMP", "R:99kΩ", "R:1kΩ", "V:10sin(2000πt)V", "V:1V"),
  ), "electronics", "opamp_finite_gain_offset"],

  ["유한 이득 OPAMP + 오프셋 — V_B 미언급 실행 (임용 9번 전자)", mk(
    "OPAMP 회로 해석",
    "개방 루프 이득 A_0를 갖는 연산증폭기 회로에서 반전 단자의 전압과 출력전압의 관계를 단계별로 구하는 문제이다.",
    ["연산증폭기", "개루프 이득", "되먹임"],
    inv("OPAMP", "R:99kΩ", "R:1kΩ", "V:10sin(2000πt)V", "V:1V"),
  ), "electronics", "opamp_finite_gain_offset"],

  ["OPAMP 루프이득 + 좌반평면 안정도 (임용 12번 전자)", mk(
    "연산 증폭기 응용 회로의 안정도 해석",
    "복소주파수 s의 함수인 루프이득 L(s)=V_r/V_t를 구하기 위해 입력 V_s를 제거한 후 귀환 루프를 끊고 V_t를 인가하여 V_r을 얻는 회로에서, 특성방정식 0=1-L(s)의 근이 좌반평면에 위치하는 조건으로 저항 R_S와 R의 관계를 부등식으로 구한다.",
    ["루프이득", "특성방정식", "좌반평면", "안정적인 선형증폭기"],
    inv("OPAMP", "R", "R", "R", "R:R_S", "V:V_s"),
  ), "electronics", "opamp_loop_gain_stability"],

  ["형제 회귀 — 유한 이득 + 블록도 (임용 11번 전자)", mk(
    "OPAMP 유한 개방루프 이득과 블록도",
    "개방 루프 이득이 A(s)=A_0ω_0/(s+ω_0)인 연산증폭기 반전증폭기 회로와 등가 블록도가 주어질 때, 중첩의 원리로 α와 β를 구하고 반전 입력 단자의 전압 V^-를 mV 단위로 구한다.",
    ["개방 루프 이득", "블록도", "중첩의 원리"],
    inv("OPAMP", "R:1kΩ", "R:99kΩ", "V:0.1V"),
  ), "electronics", "opamp_finite_gain_block"],

  // ── 전자기학 (EM 강제 체인) ──────────────────────────────────────
  ["두 점전하 합성 전계·전위 (임용 4번)", mk(
    "두 점전하의 전계와 전위",
    "자유 공간에서 Q_A의 점전하가 점 A(0,3,0)에 있고 Q_B의 점전하가 점 B(0,0,3)에 놓여 있을 때, 점 P(0,3,3)에서 두 점전하에 의한 전계의 크기와 전위를 구한다.",
    ["점전하", "전계", "전위", "중첩"],
  ), "em", "two_point_charges_field_potential"],

  ["동축선로 영역별 자계·반지름 차 (임용 11번)", mk(
    "동축 도체의 자기장 해석",
    "원통 좌표계 z축 상에 무한히 긴 동축선로가 놓여 있고, 반지름 a인 내부 도체에 전류 I가 a_z 방향, 반지름 b인 외부 도체에 전류 I가 -a_z 방향으로 흐를 때, 내부 도체 안쪽·두 도체 사이·외부 도체 바깥에서의 자계를 각각 구하고, 자계의 크기가 125/π A/m로 되는 두 반지름의 차를 구한다.",
    ["앙페르 주회 법칙", "동축선로", "자계", "쇄교 전류"],
  ), "em", "coax_line_magnetic_field"],

  ["원통 도체 전류·외부 자계 (임용 12번)", mk(
    "원통 도체의 전류와 자계",
    "반경 r, 도전율 σ인 무한히 긴 직선 원통형 도체에서 단면 A와 B 사이의 전위차와 길이가 주어질 때, 전류 밀도와 전류를 구하고 도체 외부에서의 자계의 크기를 구한다.",
    ["도전율", "전류 밀도", "앙페르 법칙"],
  ), "em", "cylinder_conductor_current_field"],

  ["두 무한 면전류 + 자위 + 자속 (임용 10번)", mk(
    "두 무한 면전류에 의한 자속밀도와 자위",
    "자유공간상에서 두 개의 무한 면전류는 각각 밀도가 K₁=−20a_z[A/m], K₂=20a_z[A/m]이고 y=−3인 면과 y=3인 면에 있다. −3<y<3에서 벡터 자위가 주어질 때 두 면전류 사이의 공간에서 스칼라 자위 V_m과 자속의 양 Φ[Wb]을 구한다. x=0인 면의 사각형을 통과하는 자속을 구한다.",
    ["면전류", "벡터 자위", "스칼라 자위", "자속밀도", "자속"],
  ), "em", "sheet_currents_vector_potential"],

  ["점전하+선전하 크기 비 → 힘 (2023 전기 A-10)", mk(
    "점전하와 무한 선전하에 의한 전계",
    "자유 공간에서 −3[nC]의 점전하가 점 P(2, −1, 2)에 있고, k[nC/m]의 균일한 선전하가 점 (−1, 1, 0)을 지나고 z축과 평행하게 놓여 있다. 점 P의 점전하에 의한 원점 O에서의 전계는 E₁이고 무한 선전하에 의한 원점 O에서의 전계는 E₂이다. 전계의 크기 비 |E₁|:|E₂| = 1:√2 가 되는 k 값과, 2[C]의 전하가 원점 O에 있을 때 합성 전계에 의해 전하에 작용하는 힘 F를 구한다.",
    ["점전하", "무한 선전하", "합성 전계", "전계의 크기 비", "전하에 작용하는 힘"],
  ), "em", "point_line_charge_force"],

  ["면전하+선전하 합성 전계 (임용 11번)", mk(
    "무한 면전하와 선전하의 합성 전계",
    "무한 면전하와 무한 선전하가 주어졌을 때 점 P에서 합성 전계가 0이 되는 선전하 밀도를 구하고, 점 Q에서의 합성 전계를 계산한다.",
    ["무한 면전하", "무한 선전하", "합성 전계", "가우스 법칙"],
  ), "em", "sheet_line_efield_superposition"],

  ["시변 자속 유도 전류 (임용 4번)", mk(
    "시변 자속과 유도 전류 계산",
    "ㄷ자형 완전 도체 루프의 단자 a-b에 저항이 연결된 회로에서 시간에 따라 변하는 자속 밀도가 루프를 관통할 때 쇄교 자속과 저항에 흐르는 전류를 구한다.",
    ["패러데이 법칙", "유도 기전력", "자속 쇄교", "운동 기전력 무시"],
  ), "em", "flux_loop_induced_current"],

  ["정사각형 폐경로 선적분 → ∇×H (임용 11번)", mk(
    "자계 합성 및 경로 적분",
    "자유 공간에서 자계 H = 20x²a_z가 주어질 때 한 변이 1인 정사각형 경로를 따라 ∮H·dl을 구하고, 면적으로 나눈 값과 x₀=2에서의 ∇×H를 구한다.",
    ["경로 적분", "자계의 회전", "암페어 법칙의 미분형"],
  ), "em", "curl_from_line_integral"],

  ["동축 원통 저항 (임용 12번)", mk(
    "동축 원통의 저항",
    "내부 도체 반경 a와 외부 도체 내경 b 사이에 도전율 σ인 물질이 채워진 동축 원통에서 두 도체 사이의 저항 R을 구한다.",
    ["도전율", "동축", "저항", "전류 밀도"],
  ), "em", "coax_resistance"],
];

let pass = 0, fail = 0;
for (const [name, a, subject, want] of CASES) {
  const got = subject === "em" ? emDispatch(a) : circuitDispatch(a, subject);
  if (got === want) { pass++; console.log(`  ✅ ${name} → ${got}`); }
  else { fail++; console.log(`  ❌ ${name} → ${got} (기대: ${want})`); }
}

console.log(`\n결과: ${pass} pass / ${fail} fail  (원본 ${CASES.length}종)`);
if (fail > 0) {
  console.log("\n※ 실패는 대개 **나중에 추가된 넓은 분기가 기존 유형을 잠식**한 것이다.");
  console.log("  분류기 0-PRE 순서와 strong 키워드 겹침(bare 일반어)을 먼저 확인할 것.");
}
process.exit(fail === 0 ? 0 : 1);
