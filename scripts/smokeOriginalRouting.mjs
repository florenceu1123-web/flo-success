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
  detectTwoWiresFieldForce,
  detectBentSemiInfiniteWires,
  detectCylinderInternalInductance,
  detectSheetLineEfieldVector,
  detectPointLineNullField,
} from "../lib/analysis/classifyElectromagnetics.ts";
import { detectAcTheveninDependent } from "../lib/pipeline/runAcTheveninDependentPipeline.ts";
import { detectAcTheveninTwoBox } from "../lib/pipeline/runAcTheveninTwoBoxPipeline.ts";
import { detectAcTheveninDesignAb } from "../lib/pipeline/runAcTheveninDesignAbPipeline.ts";
import { detectAcDeltaWyeBridge } from "../lib/pipeline/runAcDeltaWyeBridgePipeline.ts";
import { detectOscilloscopePhaseL } from "../lib/pipeline/runOscilloscopePhaseLPipeline.ts";
import { detectAcTwoSourceMeshPower } from "../lib/pipeline/runAcTwoSourceMeshPowerPipeline.ts";
import { detectAcSuperpositionNullSource } from "../lib/pipeline/runAcSuperpositionNullSourcePipeline.ts";
import { detectTheveninDepGraph } from "../lib/pipeline/runTheveninDepGraphMaxPowerPipeline.ts";
import { detectOpampAvgSuperposition } from "../lib/pipeline/runOpampAvgSuperpositionPipeline.ts";
import { detectZenerShuntRegulator } from "../lib/pipeline/runZenerShuntRegulatorPipeline.ts";
import { detectSwitchedRlcSourceFree } from "../lib/pipeline/runSwitchedRlcSourceFreePipeline.ts";
import { detectRlcStateEquation } from "../lib/pipeline/runRlcStateEquationPipeline.ts";
import { detectSwitchedCapShortRl } from "../lib/pipeline/runSwitchedCapShortRlPipeline.ts";
import { detectPeriodicSignalDcRms } from "../lib/pipeline/runPeriodicSignalDcRmsPipeline.ts";
import { detectSwitchedRlcDualSwitch } from "../lib/pipeline/runSwitchedRlcDualSwitchPipeline.ts";
import { detectOpampTwoStageRx } from "../lib/pipeline/runOpampTwoStageRxPipeline.ts";
import { detectOpampSummerTFeedback } from "../lib/pipeline/runOpampSummerTFeedbackPipeline.ts";
import { detectBjtSwitchLogicGate } from "../lib/pipeline/runBjtSwitchLogicGatePipeline.ts";
import { detectComparatorDiodeOr } from "../lib/pipeline/runComparatorDiodeOrPipeline.ts";
import { detectBjtTheveninBias } from "../lib/pipeline/runBjtTheveninBiasPipeline.ts";
import { detectJkMealyStateDesign } from "../lib/pipeline/runJkMealyStateDesignPipeline.ts";
import { detectDffPresetClearRegions } from "../lib/pipeline/runDffPresetClearRegionsPipeline.ts";
import { detectSwitchedRlDualShort } from "../lib/pipeline/runSwitchedRlDualShortPipeline.ts";
import { detectTwoSourceRlSuperposition } from "../lib/pipeline/runTwoSourceRlSuperpositionPipeline.ts";
import { detectAcDcSourceSuperpositionVc } from "../lib/pipeline/runAcDcSourceSuperpositionVcPipeline.ts";
import { detectRlcAntiresonanceLadder } from "../lib/pipeline/runRlcAntiresonanceLadderPipeline.ts";
import { detectJkTwoPhaseClock } from "../lib/pipeline/runJkTwoPhaseClockPipeline.ts";
import { detectMaxPowerTwoSourceRatio } from "../lib/pipeline/runMaxPowerTwoSourceRatioPipeline.ts";
import { detectNumberReprFillBlank } from "../lib/pipeline/runNumberReprFillBlankPipeline.ts";
import { detectJfetDepletionFillBlank } from "../lib/pipeline/runJfetDepletionFillBlankPipeline.ts";
import { detectBjtEarlyEffectFillBlank } from "../lib/pipeline/runBjtEarlyEffectFillBlankPipeline.ts";
import { detectMaxwellConceptFillBlank } from "../lib/pipeline/runMaxwellConceptFillBlankPipeline.ts";
import { detectTffStateDesignInput } from "../lib/pipeline/runTffStateDesignInputPipeline.ts";
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
  detectSheetLineEfieldVector(a) ? "sheet_line_efield_vector"
  : detectCylinderInternalInductance(a) ? "cylinder_internal_inductance"
  : detectBentSemiInfiniteWires(a) ? "bent_semi_infinite_wires"
  : detectTwoWiresFieldForce(a) ? "two_wires_field_force"
  : detectCoaxLineMagneticField(a) ? "coax_line_magnetic_field"
  : detectDielectricBoundary(a) ? "dielectric_boundary_field"
  : detectCoaxTwoDielectric(a) ? "coax_two_dielectric_axial"
  : detectDielectricPotentialMode(a) ? "dielectric_two_region_cap"
  : detectFluxLoopInducedCurrent(a) ? "flux_loop_induced_current"
  : detectCurlLineIntegral(a) ? "curl_from_line_integral"
  : detectSheetRingEfield(a) ? "sheet_ring_efield_ratio"
  : detectSheetCurrentsVectorPotential(a) ? "sheet_currents_vector_potential"
  : detectPointLineNullField(a) ? "point_line_null_field"
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
  // ★ 입력 X 있는 2-bit 상태기계 + FF 설계(임용 12번)는 자율 dff_state_design보다 앞.
  if (classifyCircuitType(a, subject).type === "tff_state_design_input" || detectTffStateDesignInput(a)) return "tff_state_design_input";
  // ★ 2단 OPAMP + R_X 설계(임용 2번 전자)는 opamp 형제들보다 앞 — finite_gain_block·three_stage_sum이
  //   연속으로 가로채던 실측 사고(분류기 0-PRE + route 안전망 둘 다 반영).
  // ★ JK-FF 2개 Mealy 상태도(임용 9번 디지털)는 넓은 fsm·jk 분기보다 앞.
  if (classifyCircuitType(a, subject).type === "jk_mealy_state_design" || detectJkMealyStateDesign(a)) return "jk_mealy_state_design";
  // ★ D-FF + 비동기 PR·CLR + A·B 조합논리 → 구간 ㉠~㉢ Q 파형(임용 27번)은 과목 무관 0-PRE —
  //   전용 항목이 없던 시절 3과목 모두 `unsupported`(→ universal_digital)로 떨어졌다.
  if (classifyCircuitType(a, subject).type === "dff_preset_clear_regions" || detectDffPresetClearRegions(a)) return "dff_preset_clear_regions";
  // ★ Maxwell 개념 빈칸(임용 24번)은 개념 명칭형·EM 레지스트리보다 앞.
  if (classifyCircuitType(a, subject).type === "maxwell_concept_fill_blank" || detectMaxwellConceptFillBlank(a)) return "maxwell_concept_fill_blank";
  // ★ 데이터 표현·산술 연산 빈칸(임용 27번)은 그림 없는 텍스트 유형 — generic보다 앞.
  if (classifyCircuitType(a, subject).type === "number_repr_fill_blank" || detectNumberReprFillBlank(a)) return "number_repr_fill_blank";
  // ★ BJT Early 효과 빈칸(임용 27번 전자회로)은 형제 bjt_characteristic_curve·bjt_bias보다 앞.
  if (classifyCircuitType(a, subject).type === "bjt_early_effect_fill_blank" || detectBjtEarlyEffectFillBlank(a)) return "bjt_early_effect_fill_blank";
  // ★ JFET 공핍층·핀치오프 빈칸(임용 28번 전자회로)도 개념 명칭형보다 앞 — 형제 jfet_bias보다 앞.
  if (classifyCircuitType(a, subject).type === "jfet_depletion_fill_blank" || detectJfetDepletionFillBlank(a)) return "jfet_depletion_fill_blank";
  // ★ 두 회로 최대전력 비(임용 17번)는 단일 회로 최대전력 형제들보다 앞.
  if (classifyCircuitType(a, subject).type === "max_power_two_source_ratio" || detectMaxPowerTwoSourceRatio(a)) return "max_power_two_source_ratio";
  // ★ JK + 2상 클럭발생기(임용 30번)는 넓은 jk/fsm 분기보다 앞.
  if (classifyCircuitType(a, subject).type === "jk_two_phase_clock" || detectJkTwoPhaseClock(a)) return "jk_two_phase_clock";
  // ★ 병렬 LC 반공진 사다리(임용 16번)는 generic universal_ac·rlc_resonance보다 앞.
  if (classifyCircuitType(a, subject).type === "rlc_antiresonance_ladder" || detectRlcAntiresonanceLadder(a)) return "rlc_antiresonance_ladder";
  // ★ 교류 전압원 + 직류 전류원 정상상태(임용 15번)는 generic universal_ac보다 앞.
  if (classifyCircuitType(a, subject).type === "ac_dc_source_superposition_vc" || detectAcDcSourceSuperpositionVc(a)) return "ac_dc_source_superposition_vc";
  // ★ 전압원 2개 + 중첩·테브난(임용 4번)은 스위치 절체 형제(임용 3번)보다 앞 — 이 원본엔 스위치가 없다.
  if (classifyCircuitType(a, subject).type === "two_source_rl_superposition" || detectTwoSourceRlSuperposition(a)) return "two_source_rl_superposition";
  // ★ 스위치 2개가 소자를 단락시키는 전류원 RL(임용 17번)은 generic switched_rl보다 앞.
  if (classifyCircuitType(a, subject).type === "switched_rl_dual_short" || detectSwitchedRlDualShort(a)) return "switched_rl_dual_short";
  // ★ BJT 바이어스 + 베이스망 테브난 등가(임용 10번 전자)는 generic bjt_bias보다 앞.
  if (classifyCircuitType(a, subject).type === "bjt_thevenin_bias" || detectBjtTheveninBias(a)) return "bjt_thevenin_bias";
  // ★ BJT 스위치 → 논리게이트(임용 2번)는 과목 무관 0-PRE — 디지털 과목이면 kmap_sop로 새던 유형.
  if (classifyCircuitType(a, subject).type === "bjt_switch_logic_gate" || detectBjtSwitchLogicGate(a)) return "bjt_switch_logic_gate";
  // ★ 비교기 2개 + 다이오드 결합(임용 3번 전자)은 과목 무관 0-PRE — 실측에서 ㉠㉡+ON/OFF 때문에
  //   bjt_characteristic_curve가 가로채 BJT 출력특성곡선 문제로 변질됐다.
  if (classifyCircuitType(a, subject).type === "comparator_diode_or" || detectComparatorDiodeOr(a)) return "comparator_diode_or";
  // ★ 반전 가산기 + T형 궤환 + 부하 전류 I_L(임용 7번 전자)은 generic opamp_cascade보다 앞 —
  //   실측에서 cascade가 가로채 전역 되먹임 전달함수 문제로 변질됐다.
  if (classifyCircuitType(a, subject).type === "opamp_summer_tfeedback" || detectOpampSummerTFeedback(a)) return "opamp_summer_tfeedback";
  if (classifyCircuitType(a, subject).type === "opamp_two_stage_rx" || detectOpampTwoStageRx(a)) return "opamp_two_stage_rx";
  // ★ (+)단자 3입력 평균 + 2단 중첩(임용 8번 전자회로)은 generic OPAMP 경로보다 앞 —
  //   실측에서 (+)입력 3개가 반전 가산기로 뒤집혔다.
  if (classifyCircuitType(a, subject).type === "opamp_avg_superposition_r" || detectOpampAvgSuperposition(a)) return "opamp_avg_superposition_r";
  // ★ 종속전원 + V-I 그래프 + 최대전력(임용 9번 회로이론)은 generic 테브난 경로보다 앞 —
  //   실측에서 (나) 그래프가 통째로 빠지고 미지 R에 값이 노출됐다.
  if (classifyCircuitType(a, subject).type === "thevenin_dep_graph_max_power" || detectTheveninDepGraph(a)) return "thevenin_dep_graph_max_power";
  // ★ 2전원 RLC 메시 + 평균전력(임용 5번 회로이론)은 ac_rl_average_power(단일 전원)보다 앞 —
  //   실측에서 그 형제가 가로채 정답이 빈 문자열인 문제가 나왔다.
  if (classifyCircuitType(a, subject).type === "ac_two_source_mesh_power" || detectAcTwoSourceMeshPower(a)) return "ac_two_source_mesh_power";
  // ★ 2전원(V+I) 중첩 + V_L=0 조건으로 전류원 역산(임용 3번 회로이론)은 universal_ac보다 앞 —
  //   실측에서 정답이 "(query 없음)"인 빈 문제가 나왔다(2026-08-05 신고).
  if (classifyCircuitType(a, subject).type === "ac_superposition_null_source" || detectAcSuperpositionNullSource(a)) return "ac_superposition_null_source";
  // ★ 오실로스코프 화면 판독(임용 11번 회로이론)은 universal_ac보다 앞 — 실측에서 정답이
  //   "(query 없음)"인 빈 문제가 나왔다.
  if (classifyCircuitType(a, subject).type === "oscilloscope_phase_l" || detectOscilloscopePhaseL(a)) return "oscilloscope_phase_l";
  // ★ 교류 브리지 + Δ-Y 변환 등가 임피던스(임용 2번 회로이론)는 ac_parallel_branches보다 앞 —
  //   실측에서 그 형제(L≥2+C+R 조건)가 가로채 전혀 다른 문제가 생성됐다.
  if (classifyCircuitType(a, subject).type === "ac_delta_wye_bridge" || detectAcDeltaWyeBridge(a)) return "ac_delta_wye_bridge";
  // ★ 교류 테브난 소자값 a·b 설계(임용 7번)는 universal_ac·ac_bridge보다 앞 — 실측에서 브리지로 샜다.
  if (classifyCircuitType(a, subject).type === "ac_thevenin_design_ab" ||
      (subject === "circuit_theory" && detectAcTheveninDesignAb(a))) return "ac_thevenin_design_ab";
  // ★ 제너 직렬 션트 정전압 + 부하저항 범위(임용 2번)는 과목 무관 0-PRE — electronics fallback보다 앞.
  if (classifyCircuitType(a, subject).type === "zener_shunt_regulator" || detectZenerShuntRegulator(a)) return "zener_shunt_regulator";
  // ★ 주기 신호 수식 → 직류값·실효값(임용 36번)은 회로가 없다 — 개념 명칭형·generic 회로보다 앞.
  if (detectPeriodicSignalDcRms(a)) return "periodic_signal_dc_rms";
  // ★ t=0 스위치 개방 무전원 직렬 RLC(임용 5번)는 switched_rlc_step(전류원 포함)보다 앞.
  if (classifyCircuitType(a, subject).type === "switched_rlc_source_free" ||
      (subject === "circuit_theory" && detectSwitchedRlcSourceFree(a))) return "switched_rlc_source_free";
  // ★ 직류 V·I원 RLC 상태방정식(임용 6번)은 ac_superposition보다 앞 — 실측에서 교류 중첩으로 샜다.
  if (classifyCircuitType(a, subject).type === "rlc_state_equation" ||
      (subject === "circuit_theory" && detectRlcStateEquation(a))) return "rlc_state_equation";
  // ★ 스위치가 커패시터를 단락(임용 7번)은 switched_rlc_step보다 앞 — 실측에서 v1이 가로채
  //   원본에 없는 전류원·SPDT 회로로 변질됐다.
  if (classifyCircuitType(a, subject).type === "switched_cap_short_rl" ||
      detectSwitchedCapShortRl(a)) return "switched_cap_short_rl";
  // ★ 두 스위치 RLC(2022 전기 B-5)는 switched_rlc_step보다 앞 — v1(전류원 포함)이 가로채던 실측 사고.
  if (classifyCircuitType(a, subject).type === "switched_rlc_dual_switch" ||
      (subject === "circuit_theory" && detectSwitchedRlcDualSwitch(a))) return "switched_rlc_dual_switch";
  // ★ 점선 박스 2개 직렬 테브난(임용 10번 회로이론)은 universal_ac(theveninMaxPower)보다 앞 —
  //   그쪽이 가로채 단자쌍 하나짜리 회로로 변질되던 실측 사고.
  if (classifyCircuitType(a, subject).type === "ac_thevenin_two_box" || detectAcTheveninTwoBox(a)) return "ac_thevenin_two_box";
  // ★ 종속전원 AC 테브난(임용 6번)은 아래 두 감지기보다 **앞** — switched_rl_dep_i가 가로채던 실측 사고.
  if (classifyCircuitType(a, subject).type === "ac_thevenin_dependent" ||
      (subject === "circuit_theory" && detectAcTheveninDependent(a))) return "ac_thevenin_dependent";
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
  // 실측 원본 (2026-08-02) — 점전하 + x축 무한 선전하. 형제 point_line_charge_force가
  //   "점전하+선전하+전계"면 무조건 참이라 가드가 없으면 통째로 삼킨다.
  ["점전하+x축 선전하 → Q_A·전계 상쇄 위치 k (임용 9번 EM)", mk(
    "점전하와 무한 선전하에 의한 전계",
    "자유 공간의 직각 좌표계에서 점 P₁(0,3,2)의 점전하 A와 x축의 무한 선전하(ρ_L=4µC/m)에 의해 점 P₂(0,0,2)에 생기는 전계를 각각 구하고, 두 전계의 크기가 같아지는 전하량 Q_A를 구한 뒤, 점전하가 (0,0,k)로 이동했을 때 전계의 합이 0이 되는 k를 구한다.",
    ["점전하", "무한 선전하", "전계", "중첩의 원리"],
  ), "em", "point_line_null_field"],

  ["DC 휘트스톤 브리지 평형 (임용 3번)", mk(
    "휘트스톤 브리지 회로 해석",
    "휘트스톤 브리지 회로에서 평형 조건을 만족시키는 저항 R_x의 값을 구하고, 이때의 출력 전압 V_o를 계산하는 문제입니다.",
    ["휘트스톤 브리지", "평형 조건", "저항 분압"],
    inv("V:22V", "R:4Ω", "R:4Ω", "R:15Ω", "R:5Ω", "R:12Ω", "R:6Ω", "R:6Ω"),
  ), "circuit_theory", "dc_wheatstone_balance"],

  // 실측 analyze 요약 (2026-08-02) — universal_ac(theveninMaxPower)가 가로채 단자쌍 하나로 변질되던 원본
  ["점선 박스 2개 직렬 테브난 + R_L 최대전력 (임용 10번 회로이론)", mk(
    "RLC 회로의 테브난 등가 해석",
    "이 문제는 두 개의 교류 전원이 포함된 RLC 회로에서 단자 a-b의 테브난 등가 임피던스와 단자 c-d의 테브난 등가 전압을 구하고, 부하 저항 R_L에 최대 평균 전력을 전달하는 조건을 찾는 문제입니다.",
    ["테브난 등가 회로", "최대 전력 전달", "교류 해석", "페이저 해석"],
    inv("V:1∠0°V", "R:100Ω", "C:-j100Ω", "L:j50Ω", "I:0.01∠0°A", "R:100Ω", "L:j100Ω", "C:-j50Ω"),
  ), "circuit_theory", "ac_thevenin_two_box"],

  // 임용 12번 — 입력 X를 갖는 상태기계(※ Vision이 "입력 X"를 보존한 회차 기준. 흘리면 자율 유형으로 샌다)
  ["입력 X 상태기계 + FF 설계 (임용 12번 디지털)", mk(
    "상태도와 순서 논리 회로 설계",
    "상태 변수 Q_A, Q_B와 입력 X를 갖는 상태도로부터 상태표와 카르노맵을 작성하여 플립플롭의 입력을 불 함수로 구하고 게이트로 구현한다.",
    ["상태도", "상태표", "카르노맵", "플립플롭", "최소항의 합"],
  ), "digital_logic", "tff_state_design_input"],

  // 임용 9번 디지털 — JK-FF 2개 Mealy 상태도 + 상태표 빈칸 + y·J_A·J_B
  ["JK-FF 2개 Mealy 상태도 → y·J_A·J_B (임용 9번 디지털)", mk(
    "J-K 플립플롭 순서논리회로의 상태도",
    "출력 A를 갖는 J-K 플립플롭과 출력 B를 갖는 J-K 플립플롭으로 구성된 순서논리회로의 상태도와 상태표에서 빈칸 ㉠~㉥을 구하고, 입력 x에 대한 출력 y의 논리식과 J_A, J_B의 최소화된 논리식을 구한다.",
    ["J-K 플립플롭", "상태도", "상태표", "카르노맵", "순서논리회로"],
  ), "digital_logic", "jk_mealy_state_design"],

  // 임용 24번 — Maxwell 방정식 개념 (그림 없음)
  ["Maxwell 방정식 개념 빈칸 (임용 24번)", mk(
    "Maxwell 방정식에 대한 설명",
    "Maxwell 방정식에서 변위전류밀도, 전류 연속방정식, 유도 기전력, 도체 내 표피 깊이(skin depth)에 대한 설명 중 옳은 것을 고르는 문제이다.",
    ["Maxwell 방정식", "변위전류"],
    inv(),
  ), "electromagnetics", "maxwell_concept_fill_blank"],

  // 임용 27번 — 컴퓨터 데이터 표현·산술 연산 (그림 없음)
  ["보수·진수 변환·오버플로 빈칸 (임용 27번)", mk(
    "컴퓨터 데이터 표현과 산술 연산",
    "2진수를 16진수로 변환하고, 1의 보수와 2의 보수 표현, n비트 2의 보수 범위, 8비트 덧셈의 초과(overflow)를 판단하는 문제이다.",
    ["보수", "진수 변환"],
    inv(),
  ), "digital_logic", "number_repr_fill_blank"],

  // 임용 27번 전자회로 — npn BJT Early 효과 개념 (그림 (가)단면도 + (나)특성곡선)
  ["BJT Early 효과 개념 빈칸 (임용 27번)", mk(
    "npn BJT 공통 이미터 접속의 Early 효과",
    "그림 (가)는 npn 쌍극성 접합 트랜지스터의 공통 이미터 접속에서 CBJ 공핍층이 넓어져 유효 베이스폭이 줄어드는 것을, (나)는 활성영역 특성곡선을 왼쪽으로 연장한 −V_A와 동적출력저항 r_o를 나타낸다. Punch Through와 베이스 내 소수캐리어 농도 기울기에 대한 설명으로 옳은 것을 고르는 문제이다.",
    ["Early 효과", "베이스폭 변조"],
    inv(),
  ), "electronics", "bjt_early_effect_fill_blank"],

  // 임용 28번 전자회로 — n채널 JFET V_DS별 공핍층 변화 개념 (그림 (가)~(라) 4패널)
  ["JFET 공핍층 개념 빈칸 (임용 28번)", mk(
    "n채널 JFET의 V_DS에 따른 공핍층 변화",
    "그림 (가)~(라)는 게이트-소스 전압이 0인 n채널 JFET에서 드레인 전압을 높일 때 공핍층이 드레인 쪽으로 넓어지다가 핀치오프에 이르고, 그 뒤 포화 영역에서 드레인 전류가 거의 일정해지는 과정을 개념적으로 나타낸다. 선형동작구간과 핀치오프 전압에 대한 설명으로 옳은 것을 고르는 문제이다.",
    ["공핍층", "핀치오프", "채널"],
    inv(),
  ), "electronics", "jfet_depletion_fill_blank"],

  // 임용 17번 — 전원 크기만 다른 두 회로의 최대전력 부하 + η₁·η₂
  ["두 회로 최대전력 부하 + η₁·η₂ (임용 17번)", mk(
    "두 회로의 최대전력 부하 설계",
    "그림 (가)와 (나)의 각 회로에서 부하에 최대전력을 공급하기 위해 필요한 부하 저항과 인덕턴스를 구한다. 각 부하에 공급되는 최대전력을 P_max1, P_max2라 할 때 두 비를 구한다.",
    ["최대전력", "켤레 정합"],
    inv("V:24cos1000t", "R:6Ω", "L:6mH", "C:125µF"),
  ), "circuit_theory", "max_power_two_source_ratio"],

  // 임용 30번 — JK + 2상 클럭발생기 + 출력 게이트 2개
  ["JK + 2상 클럭발생기 → 출력 Y₁ 파형 (임용 30번)", mk(
    "JK 플립플롭과 2상 클럭발생기 순서논리회로",
    "그림 (가)는 JK 플립플롭과 2상 클럭발생기를 연결하여 활용한 순서논리회로이다. 클럭(CLK)과 입력 신호 J₁, K₁이 그림 (나)와 같을 때 출력 Y₁의 파형을 구한다.",
    ["JK 플립플롭", "2상 클럭"],
    inv("FF", "FF", "GATE", "GATE"),
  ), "digital_logic", "jk_two_phase_clock"],

  // 임용 16번 — 병렬 LC 반공진으로 우측이 개방되는 RLC 사다리
  ["병렬 LC 반공진 → 정상상태 전류 i(t) (임용 16번)", mk(
    "RLC 회로의 정상상태 전류",
    "그림은 RLC 회로이다. 정상상태 전류 i(t)[A]의 값을 구한다.",
    ["정상상태", "페이저"],
    inv("V:50√2cos1000t", "R:9Ω", "R:1Ω", "L:10mH", "L:2mH", "C:500µF", "C:500µF", "C:500µF"),
  ), "circuit_theory", "rlc_antiresonance_ladder"],

  // 임용 15번 — 교류 전압원 + 직류 전류원 RLC 정상상태 v_C(t)
  ["교류 전압원 + 직류 전류원 → 정상상태 v_C(t) (임용 15번)", mk(
    "교류 전압원과 직류 전류원이 포함된 회로",
    "그림은 교류 전압원과 직류 전류원이 포함된 회로이다. 커패시터 양단 전압 v_c(t)[V]의 정상상태 값을 구한다.",
    ["중첩", "정상상태"],
    inv("V:12cos8t", "I:1A", "R:4Ω", "R:2Ω", "L:3/4H", "L:1/4H", "C:1/16F"),
  ), "circuit_theory", "ac_dc_source_superposition_vc"],

  // 임용 4번 — 전압원 2개(계단 펄스+정현파) RL 중첩 5단계 (실측: 임용 3번 SPDT 유형이 가져갔다)
  ["2전압원 계단+정현파 → 테브난·중첩 5단계 (임용 4번)", mk(
    "2개의 전압원을 가지는 RL 회로의 해석",
    "그림 (가)는 2개의 전압원을 가지는 RL 회로이다. 5단계로 제시한 회로 해석 절차에 따라 2[H]의 인덕터에 흐르는 전류 i(t)를 구한다. v1(t)와 v2(t)를 단위계단함수 u(t)로 표현하고, 점선 부분을 테브난 등가회로로 변환한 뒤 중첩의 원리를 이용하여 i_A(t)를 구하고, 합성저항 R_eq로 대체한 등가회로에서 i_B(t)를 구한다.",
    ["중첩의 원리", "테브난 등가", "단위계단함수"],
    inv("V:10V", "V:10V", "R:2Ω", "R:2Ω", "R:4Ω", "L:2H"),
  ), "circuit_theory", "two_source_rl_superposition"],

  // 임용 17번 — 전류원 RL + 스위치 2개가 t=0에 소자를 단락 (실측: generic switched_rl로 샜다)
  ["두 스위치 동시 닫힘 → 전류원 RL 과도 (임용 17번)", mk(
    "두 스위치가 동시에 닫히는 RL 회로의 과도응답",
    "두 개의 스위치 SW₁과 SW₂가 오랜 시간 동안 개방 상태를 유지한 후 t=0에서 동시에 닫히는 RL 회로이다. t>0일 때 2[H]의 인덕터에 흐르는 전류 i(t)를 구한다.",
    ["RL 과도응답", "시정수"],
    inv("I:2A", "R:4Ω", "R:4Ω", "R:4Ω", "L:1H", "L:2H", "SW", "SW"),
  ), "circuit_theory", "switched_rl_dual_short"],

  // 임용 27번 — D-FF + 비동기 PR·CLR + A·B 조합논리 → 구간 ㉠~㉢ Q 파형.
  //   ★ Vision이 PR·CLR을 통째로 흘린 회차를 그대로 넣는다(전용 항목 이전엔 unsupported로 떨어졌다).
  ["D-FF + 비동기 PR·CLR → 구간 ㉠~㉢ Q 파형 (임용 27번)", mk(
    "D 플립플롭 회로의 타이밍 분석",
    "그림 (가) 회로에 인가되는 클럭(CLK)과 입력 신호 A, B의 값이 그림 (나)와 같을 때 구간 ㉠~㉢에서의 출력 Q의 값으로 옳은 것을 고른다.",
    ["D 플립플롭", "파형"],
    inv("FF"),
  ), "digital_logic", "dff_preset_clear_regions"],

  // 실측 analyze 요약 (2026-08-02) — generic bjt_bias(임용 7번 저항률 유형)가 가로채던 원본
  ["BJT 바이어스 + 베이스망 테브난 등가 (임용 10번 전자회로)", mk(
    "BJT 바이어스 회로 해석",
    "이 문제는 BJT의 직류 바이어스 회로를 분석하여 각 단계를 통해 저항 값을 구하는 문제입니다. 점선 부분을 테브난 등가 회로로 변경하여 등가 저항 R_T를 구하고, 베이스 전류 I_B와 전압 V_B를 계산한 뒤 V_CE가 특정 값이 되도록 하는 저항 R_C를 구합니다.",
    ["BJT 바이어스", "테브난 등가", "베이스 전류", "직류 해석"],
    inv("BJT", "R:820Ω", "V:8V", "R:2kΩ", "V:8V", "R:2kΩ", "V:10V", "R:1kΩ", "R:0.1kΩ", "I:100mA"),
  ), "electronics", "bjt_thevenin_bias"],

  // 임용 2번 — BJT 이상적 스위치 → 진리표 + 동일 동작 논리게이트 (과목이 흔들리는 유형)
  ["BJT 스위치 → 등가 논리게이트 (임용 2번)", mk(
    "BJT 응용 회로와 논리게이트",
    "쌍극성 접합 트랜지스터(BJT) 응용 회로에서 입력 X에 신호가 인가될 때 출력 ㉠, ㉡을 구하고, 이와 동일한 동작을 하는 논리게이트를 그리는 문제이다. 트랜지스터는 이상적인 스위칭 동작을 한다고 가정한다.",
    ["BJT", "스위칭 동작", "논리게이트", "진리표"],
    inv("BJT", "R:R_B", "R:R_C", "V:5V"),
  ), "electronics", "bjt_switch_logic_gate"],

  // 실측 analyze 요약 (2026-08-03) — bjt_characteristic_curve가 가로채 BJT 출력특성곡선 문제로
  //   변질되던 원본 (비교기 2개·다이오드 OR 결합·풀다운 저항 전부 소실).
  ["비교기 2개 + 다이오드 결합 (임용 3번 전자회로)", mk(
    "연산 증폭기 응용 회로 분석",
    "주어진 연산 증폭기 회로에서 입력 전압이 시간에 따라 변화할 때, 다이오드 D1과 D2의 상태를 분석하여 출력 전압을 구하는 문제입니다. 입력 전압이 주어진 구간에서 어떻게 변화하는지에 따라 다이오드의 ON/OFF 상태가 결정되고, 이에 따라 출력 전압이 달라집니다.",
    ["연산 증폭기", "다이오드", "비교기"],
    inv("V:+5V", "V:+2V", "OPAMP", "OPAMP", "D", "D", "R:10kΩ"),
  ), "electronics", "comparator_diode_or"],

  // 실측 analyze 요약 (2026-08-02) — generic opamp_cascade_voltage_divider가 가로채
  //   "전역 되먹임 전달함수" 문제로 변질되던 원본 (T형 궤환·미지 R₁·부하 전류 I_L 소실).
  ["반전 가산기 + T형 궤환 + 부하 전류 (임용 7번 전자회로)", mk(
    "연산증폭기 응용 회로 해석",
    "이 회로는 연산증폭기를 이용한 응용 회로로, 각 단계별로 연산증폭기의 입력과 출력 전압을 계산하는 문제입니다. 먼저, V_1이 -4V가 되도록 R_1 값을 구하고, 그에 따른 V_0의 출력을 계산합니다. 마지막으로 부하 저항 R_L이 5kΩ일 때 출력 부하 전류 I_L을 구하는 과정을 포함합니다.",
    ["연산증폭기", "반전 증폭기", "부하 저항", "전류 계산"],
    inv("V:1V", "V:2V", "R:1kΩ", "R:2kΩ", "R:R1[kΩ]", "OPAMP", "R:4kΩ", "R:2kΩ", "R:4kΩ", "R:2kΩ", "OPAMP", "R:R_L"),
  ), "electronics", "opamp_summer_tfeedback"],

  // 실측 analyze 요약 (2026-08-02) — opamp_finite_gain_block → opamp_three_stage_sum 순으로 새던 원본
  ["2단 OPAMP + R_X 설계 (임용 2번 전자회로)", mk(
    "연산 증폭기 회로 해석",
    "두 개의 연산 증폭기를 사용하여 특정 전압 조건을 만족하도록 설계된 회로입니다. V_x가 2V가 되도록 저항 R_x를 조정하고, 그에 따른 출력 전압 V_o를 구하는 문제입니다. 연산 증폭기는 이상적으로 동작합니다.",
    ["연산 증폭기", "이상적 증폭기", "전압 분배", "피드백 회로", "저항 조정", "출력 전압"],
    inv("R:2kΩ", "R:4kΩ", "R:2kΩ", "R:4kΩ", "R:2kΩ", "R:2kΩ", "R:2kΩ", "R:10kΩ", "V:4V", "V:6V", "OPAMP", "OPAMP"),
  ), "electronics", "opamp_two_stage_rx"],

  // ★ 실측 회차 (2026-08-12, 사용자 신고) — 전용 항목이 없어 개념 명칭형(원리 이름 쓰기)과
  //   generic 회로 경로(없는 R₁·R₂ netlist)가 번갈아 가로챘다. 회로도 그림도 없는 수식 문항이다.
  ["주기 신호 수식 → 직류값·실효값 (임용 36번 회로이론)", mk(
    "주기 신호의 직류 및 실효값",
    "주기 신호 v(t)=2cos^2(1000πt+π/2)[V]의 직류값 V_dc와 실효값 V_rms를 구하는 문제이다. " +
      "직류값은 한 주기 동안의 평균값이고, 실효값은 제곱 평균의 제곱근이다.",
    ["직류값", "실효값", "주기 신호", "평균값"],
    [],
  ), "circuit_theory", "periodic_signal_dc_rms"],
  // ★ 실측 analyze 요약 (2026-08-10) — 전용 항목이 없어 switched_rlc_step(v1)이 가로채
  //   원본에 **없는 전류원 2A·SPDT**가 들어간 회로로 변질되고 묻는 양도 i_L(t)→v_C(t)가 됐다.
  ["스위치가 커패시터를 단락 → RL 계단응답 (임용 7번 회로이론)", mk(
    "RLC 회로의 과도 응답 분석",
    "이 문제는 스위치가 닫힐 때 RLC 회로의 과도 응답을 분석하는 문제입니다. 인덕터에 흐르는 전류의 초기값을 구하고, " +
      "기초 회로 이론을 이용해 전류의 미분 방정식을 세워 풀이합니다. 마지막으로 초기값을 이용해 완전한 전류 응답을 구합니다.",
    ["과도 응답", "인덕터 전류", "미분 방정식", "직류 정상상태"],
    inv("V:12V", "R:4Ω", "C:1F", "L:2H"),
  ), "circuit_theory", "switched_cap_short_rl"],

  // 실측 analyze 요약 (2026-08-02) — switched_rlc_step(v1, 전류원 포함)으로 새던 원본
  ["SW₁ 닫힘 + SW₂(b→c) 2전압원 RLC (2022 전기 B-5)", mk(
    "RLC 회로의 과도 응답 분석",
    "스위치가 닫히고 열리는 RLC 회로의 과도 응답을 분석하는 문제입니다. 스위치의 상태 변화에 따라 회로의 전류와 전압의 변화를 라플라스 변환을 이용하여 구하고, 주어진 초기 조건을 바탕으로 시간 영역에서의 응답을 도출합니다.",
    ["RLC 회로", "과도 응답", "라플라스 변환", "스위칭 회로", "초기 조건"],
    inv("SW", "R:4Ω", "L:1H", "C:1/2F", "SW", "V:1V", "V:2V", "R:2Ω"),
  ), "circuit_theory", "switched_rlc_dual_switch"],

  // 실측 analyze 요약 (2026-08-02) — switched_rl_dep_i(직류 스위치 RL 과도)로 새던 원본
  ["종속전원 AC 테브난 + 켤레 최대전력 (임용 6번)", mk(
    "테브난 등가 회로 해석",
    "테브난 등가 회로를 이용하여 단자 A-B 사이의 등가 임피던스와 전압을 구하고, 이를 통해 부하에 최대 전력을 전달하는 조건을 찾는 문제입니다. 부하 임피던스를 조정하여 최대 전력을 전달할 수 있는 조건을 계산합니다.",
    ["테브난 정리", "최대 전력 전달 정리", "등가 임피던스", "부하 임피던스"],
    inv("I:√2∠0°A", "CCCS:1/2 I_c", "C:-j/2 Ω", "L:jX Ω", "R:R"),
  ), "circuit_theory", "ac_thevenin_dependent"],

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

  // 실측 analyze 요약 (2026-08-02) — straight_wire_B(단일 도선)로 새던 원본
  ["두 무한 직선 도선 합성 자계 → a·단위 길이당 힘 (임용 11번)", mk(
    "무한 도선 전류의 합성 자기장",
    "자유 공간에서 두 무한 도선 A와 B에 서로 반대 방향의 전류가 흐를 때 점 O와 점 P에서의 합성 자기장을 a가 포함된 식으로 구하고, 그 크기의 비율을 통해 a를 결정한 후 도선 B에 작용하는 단위 길이당 힘을 구한다.",
    ["무한 도선 자기장", "자기장 합성", "단위 길이당 힘", "앙페르 법칙"],
  ), "em", "two_wires_field_force"],

  ["정사각형 폐경로 선적분 → ∇×H (임용 11번)", mk(
    "자계 합성 및 경로 적분",
    "자유 공간에서 자계 H = 20x²a_z가 주어질 때 한 변이 1인 정사각형 경로를 따라 ∮H·dl을 구하고, 면적으로 나눈 값과 x₀=2에서의 ∇×H를 구한다.",
    ["경로 적분", "자계의 회전", "암페어 법칙의 미분형"],
  ), "em", "curl_from_line_integral"],

  // 실측 analyze 요약 (2026-08-03) — circular_loop_axis_field(두 원형 루프)로 새던 원본.
  //   Vision이 topic을 "두 원형 루프의 합성 자계"로 오요약한 회차 그대로 넣는다.
  ["원점에서 꺾인 반무한 직선 도선 → 합성 자계로 전류 I (임용 11번)", mk(
    "두 원형 루프의 합성 자계",
    "3차원 직각 좌표계에서 크기가 I[A]인 선전류가 무한히 먼 곳에서 y축을 따라 원점 O까지 -a_y 방향으로 흐른 후, 다시 원점 O에서 x축을 따라 +a_x 방향으로 무한히 먼 곳으로 흐르고 있다. 점 P(3,4,0)에서 y축의 전류에 의한 자계 H_1과 x축의 전류에 의한 자계 H_2의 합성 자계 H_3 = (1/π)a_z가 되는 전류 I를 구한다.",
    ["비오사바르 법칙", "합성 자계", "반무한 직선 전류"],
  ), "em", "bent_semi_infinite_wires"],

  // 실측 analyze 요약 (2026-08-03) — sheet_ring_efield_ratio(원형 링)로 새던 원본.
  //   Vision이 topic을 "무한 면전하와 원형 루프 선전하"로 오요약한 회차 그대로.
  ["면전하+직선 선전하 → 합성 전계 벡터로 C₁·C₂ 역산 (임용 12번)", mk(
    "무한 면전하와 원형 루프 선전하의 합성 전계",
    "x=4[m] 위치의 무한 평면에 면전하 밀도 C1[nC/m^2]가, x=0[m] z=1[m] 위치의 무한선에 선전하 밀도 C2[nC/m]가 균일하게 분포한다. 점 P(1,2,-1)에서 각각의 전하 분포에 의한 합성 전계 E = -162pi a_x - 36pi a_z [V/m]가 되는 면전하 밀도 C1과 선전하 밀도 C2의 값을 각각 구한다.",
    ["면전하", "선전하", "합성 전계"],
  ), "em", "sheet_line_efield_vector"],

  // 실측 analyze 요약 (2026-08-03) — 레지스트리에 항목이 없어 솔레노이드 인덕턴스로 새던 원본.
  // 실측 analyze 요약 (2026-08-04) — ac_rl_average_power(단일 전원)가 가로채 정답이 빈 문자열이던 원본.
  ["2전원 RLC 메시 → I₁·I₂ + 평균 전력 (임용 5번 회로이론)", mk(
    "교류 RLC 회로 해석",
    "이 문제는 두 개의 교류 전원을 포함한 RLC 회로에서 페이저 전류와 전력을 구하는 문제입니다. 주어진 해석 절차에 따라 저항과 인덕터에 흐르는 전류를 구하고, 저항에서 소비되는 평균 전력과 전원이 공급하는 평균 전력을 계산합니다. 페이저 해석을 통해 각 전류와 전력을 단계별로 구하는 것이 핵심입니다.",
    ["페이저", "평균 전력", "RLC 회로"],
    inv("R:1Ω", "R:1Ω", "C:-j1Ω", "C:-j2Ω", "L:j3Ω", "V:√8∠45°V", "V:2∠180°V"),
  ), "circuit_theory", "ac_two_source_mesh_power"],

  // ★ 실측 analyze 요약 (2026-08-05) — 전용 항목이 없어 **universal_ac**로 떨어져 정답이
  //   "(query 없음)"이던 원본. 요약이 **있지도 않은 "종속 전원"을 지어냈고**(인벤토리 dep=0)
  //   "중첩"·"전류원"이라는 낱말도 한 번도 쓰지 않았다 — 남는 신호는 **영(0) 조건**뿐이다.
  ["2전원 중첩 → V_L=0 되는 전류원 역산 (임용 3번 회로이론)", mk(
    "RLC 회로의 페이저 해석",
    "이 문제는 주어진 RLC 회로에서 페이저 전압과 전류를 구하는 문제입니다. 주어진 전압원과 인덕터 양단의 전압이 0이 될 때의 전류를 구하는 과정입니다. 페이저 해석을 통해 복소수 형태의 전압과 전류를 계산하며, 종속 전원이 포함되어 있어 이를 고려한 해석이 필요합니다.",
    ["페이저 해석", "복소수 전압", "복소수 전류", "종속 전원", "인덕턴스"],
    inv("V:√2∠45°", "R:1", "R:1", "L:j2", "C:-j1", "C:-j1", "I:i_s"),
  ), "circuit_theory", "ac_superposition_null_source"],

  // 실측 analyze 요약 (2026-08-04) — generic OPAMP 경로로 새서 **(+)단자 3입력이 반전 가산기로 뒤집힌** 원본.
  ["(+)3입력 평균 + 2단 중첩 → 미지 R (임용 8번 전자회로)", mk(
    "연산증폭기 응용 회로 해석",
    "두 개의 연산증폭기로 구성된 회로에서 출력 V_o가 주어질 때 저항 R의 값을 구하는 문제이다. 중첩의 원리를 이용해 a점에서 V_1에 의한 전압과 V_2에 의한 전압을 각각 R의 식으로 구한다.",
    ["연산증폭기", "중첩의 원리"],
    inv("OPAMP:", "OPAMP:", "V:3V", "V:2V", "V:1V", "V:3V", "R:3kΩ", "R:3kΩ", "R:3kΩ", "R:2kΩ", "R:2kΩ", "R:3kΩ"),
  ), "electronics", "opamp_avg_superposition_r"],

  // 실측 analyze 요약 (2026-08-04) — generic 테브난 경로로 새서 (나) 그래프가 빠지고
  // 미지 저항 R에 값이 노출되던 원본. ★요약이 **종속전원을 한 번도 언급하지 않는다** — 인벤토리로 잡아야 한다.
  ["종속전원 + V-I 그래프 → 미지 R → 최대전력 (임용 9번 회로이론)", mk(
    "테브난 등가 회로와 최대 전력 전달",
    "주어진 회로에서 테브난 등가 회로를 구하고, 부하 저항 R_L에 최대 전력이 전달될 때의 조건을 분석하는 문제입니다. 그림 (가)의 회로를 테브난 등가 회로로 변환한 후, 그림 (나)의 그래프를 통해 부하 저항에 따른 전류와 전압을 분석합니다.",
    ["테브난 정리", "최대 전력 전달"],
    inv("V:9V", "R:5Ω", "CCVS:2i_x", "R:1Ω", "R:R", "R:2Ω"),
  ), "circuit_theory", "thevenin_dep_graph_max_power"],

  // 실측 analyze 요약 (2026-08-04) — universal_ac로 새서 정답이 "(query 없음)"이던 원본.
  //   ★ Vision이 정상상태 문제를 "과도응답"으로 오요약한 회차 그대로 고정한다.
  ["오실로스코프 파형 → 위상차 α → 인덕턴스 L (임용 11번 회로이론)", mk(
    "RL 회로의 과도응답 분석",
    "이 문제는 오실로스코프로 측정한 파형에서 v_s(t)와 v_L(t)의 위상차를 구하고, 이를 통해 인덕턴스 L의 값을 도출하는 과정이다. Ch1은 2.00 V/div, Ch2는 1.00 V/div이고 수평 스케일은 500µs/div이다. 주어진 파형에서 V_m과 주파수 f를 구한다.",
    ["오실로스코프", "위상차", "인덕턴스", "파형 측정"],
    inv("V:v_s(t)", "R:2000π/√3Ω", "L:1H", "L:1H", "L:L"),
  ), "circuit_theory", "oscilloscope_phase_l"],

  // 실측 analyze 요약 (2026-08-04) — ac_parallel_branches(임용 5번)로 새던 원본.
  ["교류 브리지 + Δ-Y 변환 → 등가 임피던스 (임용 2번 회로이론)", mk(
    "RLC 회로의 Δ-Y 변환",
    "이 문제는 교류 전원이 포함된 RLC 회로에서 Δ-Y 변환을 통해 등가 임피던스를 구하고, 주어진 전압과 전류 조건에서 미지수 a의 값을 계산하는 문제입니다. Δ-Y 변환을 통해 회로를 단순화한 후, 주어진 전압과 전류의 페이저 관계를 이용하여 a의 값을 도출합니다.",
    ["Δ-Y 변환", "임피던스", "페이저", "교류 회로 해석", "RLC 회로"],
    inv("V:20∠0°V", "L:j2Ω", "R:2Ω", "C:-j2Ω", "L:j2Ω", "R:2Ω"),
  ), "circuit_theory", "ac_delta_wye_bridge"],

  // 실측 analyze 요약 (2026-08-03) — ac_bridge_max_power(브리지)로 새던 원본.
  ["교류 테브난 → 소자 값 a·b 설계 + 최대평균전력 (임용 7번 회로이론)", mk(
    "RLC 회로의 테브난 등가 해석",
    "교류 전원이 포함된 RLC 회로에서 테브난의 등가 회로를 활용하여 부하 Z_L에 전달되는 평균 전력이 최대가 되기 위한 a, b의 값과 부하에 공급되는 최대 평균 전력 P_L[W]을 구한다. 단자 A-B 사이의 테브난 등가 임피던스 Z_TH와 테브난 등가 전압 V_TH를 a, b가 포함된 수식으로 나타낸다. 상단에 a[Ω]과 jb[Ω]이 직렬로 있고 −jb[Ω]이 병렬로 연결되어 있다.",
    ["테브난 등가", "최대 평균 전력", "임피던스 정합"],
    inv("V:8∠90°V", "R:2Ω", "C:-j3Ω", "R:a[Ω]", "L:jb[Ω]", "C:-jb[Ω]", "R:2Ω", "L:j2Ω"),
  ), "circuit_theory", "ac_thevenin_design_ab"],

  // 실측 analyze 요약 (2026-08-03) — dc_mesh(electronics fallback)로 새던 원본. 정답까지 틀렸다.
  ["제너 2개 직렬 정전압 → 부하 저항 최솟값·최댓값 (임용 2번 전자회로)", mk(
    "제너 다이오드 정전압 회로 분석",
    "2개의 동일한 제너 다이오드를 이용한 정전압 회로에서 정전압 V_RL이 유지되도록 부하 저항 R_L을 변화시킬 때, 부하 저항의 최솟값 R_Lmin이 1kΩ이 되는 a의 값을 구하고 그 값을 이용하여 부하 저항의 최댓값 R_Lmax를 구한다. 제너 다이오드는 이상적으로 동작한다.",
    ["제너 다이오드", "정전압 회로", "부하 저항"],
    inv("V:40V", "R:a[kΩ]", "D:V_z=5V", "D:V_z=5V"),
  ), "electronics", "zener_shunt_regulator"],

  // 실측 analyze 요약 (2026-08-03) — switched_rlc_step(SPDT+전류원)으로 새던 원본.
  ["t=0 스위치 개방 → 무전원 직렬 RLC 자연응답 (임용 5번 회로이론)", mk(
    "RLC 회로의 과도 응답 분석",
    "그림은 t=0에서 스위치가 개방되는 RLC 회로이다. t>0에서 전류 i(t)를 해석 절차에 따라 구한다. t<0에서 회로는 직류 정상 상태를 가정한다. 커패시터 전압의 초깃값과 인덕터 전류의 초깃값을 구하고, 기본회로소자의 전압 방정식을 이용하여 i(t)에 대한 2차 미분방정식을 구한 뒤 i(t)를 구한다.",
    ["과도 응답", "2차 미분방정식", "초깃값"],
    inv("V:25V", "R:10Ω", "SW", "R:40Ω", "R:60Ω", "C:2e-3F", "L:5H"),
  ), "circuit_theory", "switched_rlc_source_free"],

  // 실측 analyze 요약 (2026-08-03) — ac_superposition(교류 중첩)으로 새던 원본.
  ["직류 V·I원 RLC → 상태 방정식 A·B (임용 6번 회로이론)", mk(
    "RLC 회로의 상태 방정식",
    "직류 전압원과 전류원을 포함하는 RLC 회로에서 인덕터 전류 i[A]와 커패시터 양단 전압 v[V]에 대한 회로의 상태 방정식을 행렬 형태로 표현하고자 한다. 전압원 V1을 포함하는 전류 i에 대한 1차 미분방정식과 전류원 I1을 포함하는 전압 v에 대한 1차 미분방정식을 구해 행렬 A와 B를 구한다.",
    ["상태 방정식", "1차 미분방정식", "KVL", "KCL"],
    inv("V:V1[V]", "R:1[Ω]", "L:1/5[H]", "C:1/2[F]", "R:2[Ω]", "I:I1[A]"),
  ), "circuit_theory", "rlc_state_equation"],

  ["원통 도체의 내부 인덕턴스 (임용 10번)", mk(
    "무한 원통 도체의 내부 인덕턴스 계산",
    "반지름이 r[m]이고 z축으로 무한히 긴 원통형 도체에 10[A]의 직류 전류가 균일하게 흐를 때, 도체 길이 1[m]당 도체 내부 인덕턴스 L[H/m]을 구하는 문제이다. 중심에서 a만큼 떨어진 점 P의 자계와 자속 밀도를 구하고, 도체 내부를 쇄교하는 자속수를 구한 뒤 내부 인덕턴스를 구한다. 표피 효과는 무시하며 비투자율은 50이다.",
    ["앙페르 법칙", "쇄교 자속", "내부 인덕턴스"],
  ), "em", "cylinder_internal_inductance"],

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
