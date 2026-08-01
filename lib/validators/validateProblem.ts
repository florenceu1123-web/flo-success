import type {
  DiagramType,
  FigureRole,
  FigureVariant,
  GeneratedProblem,
  SubjectKey,
  TopicKey,
} from "@/types";
import type { RuleSet } from "@/lib/rules";
import { aliasGroupKey, getAliasGroup, isMainCircuitRole, isStateRole } from "./figureRoleAliases";

const SUPPORTED_DIAGRAM_TYPES: DiagramType[] = [
  "analog_netlist", "logic_network", "kmap", "waveform", "truth_table",
  "concept_diagram", "block_diagram", "mixed_circuit", "characteristic_curve",
  "mux_diagram", "mux_gar_circuit", "rlc_resonance_max_power_circuit",
  "imyong_10_dc_nodal", "em_field_diagram",
  "number_ring_diagram",   // n비트 수 표현 고리 (임용 4번) — 회로 아님
  "code_block", "comm_diagram",   // C언어·통신 (비회로 subject)
];

/** 회로 figure로 간주되는 diagramType — analog 계열 + archetype 전용 fixed-slot. */
const CIRCUIT_FIGURE_TYPES: ReadonlySet<DiagramType> = new Set<DiagramType>([
  "analog_netlist",
  "logic_network",
  "imyong_10_dc_nodal",
  "sr_ff_mux_sequential_circuit", // 임용 10번 정보과 (다) SR-FF + MUX 구현 회로 = topology figure
  "dff_mux_sequential_circuit",   // 임용 8번 정보과 (나) D-FF/T-FF + 2×1 MUX = topology figure
  "ff_mixed_app_circuit",         // 임용 9번 정보과 (가) T-FF+JK-FF 세로 스택 = topology figure
  "ac_dc_superposition_rc_circuit", // 임용 12번 회로이론 (가) AC+DC 중첩 RC 회로 = topology figure
  "ac_dc_superposition_rc_dual_circuit", // 위의 쌍대 (변형유형) = topology figure
  "vi_thevenin_maxpower_circuit", // 임용 5번 2전압원+2전류원 테브난+최대전력 = topology figure
  "flash_adc_2bit_circuit", // 임용 6번 2비트 플래시 ADC = topology figure
  "zener_bjt_regulator_circuit", // 임용 8번 제너+BJT 전압 레귤레이터 = topology figure
  "bjt_two_stage_switched_circuit", // 임용 10번 SW + 상보형 2단 BJT = topology figure
  "opamp_two_input_cascade",        // 임용 5번 (가) 2-OPAMP 캐스케이드
  "opamp_two_input_diff",           // 임용 5번 (나) 차동증폭기
  "opamp_series_regulator_circuit", // 임용 30번 OPAMP 직렬형 정전압 안정화 회로 = topology figure
  "active_lowpass_filter_circuit", // 임용 31번 1차 능동 저역통과 필터 = topology figure
  "opamp_summer_circuit", // 아날로그 시스템 2-OPAMP 가산기 = topology figure
  "async_preset_counter_circuit", // 비동기 SET/RESET D-FF 응용회로 (가) = topology figure
  "rlc_resonance_bandwidth_circuit", // 직렬 RLC 공진+대역폭 (가) = topology figure
  "rlc_resonance_bandwidth_dual_circuit", // 위의 쌍대(기출변형) 병렬 RLC = topology figure
  "inductor_ramp_circuit", // i(t) 램프 RL (임용 2번) = topology figure
  "opamp_two_stage_circuit", // 2단 OPAMP (임용 2번) = topology figure
  "function_generator_circuit", // 비정현파 발진기 (임용 29번) = topology figure
  "opamp_finite_gain_circuit", // 연산증폭기 유한 개방루프 이득 (임용 11번 (가)) = topology figure
  "opamp_finite_gain_offset_circuit", // 유한 이득 OPAMP + 출력단 오프셋 전압원 V_B (임용 9번 전자회로) = topology figure
  "opamp_loop_gain_circuit", // OPAMP 루프이득 (가)/(나) (임용 12번 전자회로) = topology figure
  "opamp_three_stage_sum_circuit", // 3-OPAMP 반전+버퍼+가산 (임용 2번 전자) = topology figure
  "ac_bridge_circuit", // AC 휘트스톤 브리지 (가, 임용 7번) = topology figure
  "ac_bridge_thevenin_circuit", // 테브난 등가 (나) = topology figure
  "ac_thevenin_ladder_circuit", // 단일 AC원 L-C-R 사다리 (가, 임용 7번 회로이론) = topology figure
  "ac_thevenin_equiv_circuit", // 위의 테브난 등가 (나) = topology figure
  "dc_thevenin_2src_circuit", // 2전압원 병렬가지 (가, 임용 3번 회로이론) = topology figure
  "dc_thevenin_equiv_circuit", // 위의 테브난 등가 (나) = topology figure
  "demux_circuit", // 1→4 디멀티플렉서 (임용 8번 (가)) = topology figure
  "mod_n_counter_circuit", // mod-N 카운터 회로 (임용 9번 (나)) = topology figure
  "jk_excitation_circuit", // JK-FF 2개 + 조합논리 ㉲ (2025 전기 A-8 (나)) = topology figure
  "ac_superposition_source_design_circuit", // 2전원 페이저 RLC 중첩 (임용 5번 회로이론) = topology figure
  "dc_wheatstone_balance_circuit", // DC 휘트스톤 브리지 평형 (임용 3번 회로이론) = topology figure
  "ac_power_factor_circuit", // AC 역률보정 (임용 9번 회로이론) = topology figure
  "ac_admittance_resonance_circuit", // 어드미턴스 공진 (가, 임용 7번 회로이론) = topology figure
  "ac_admittance_resonance_dual_circuit", // 위의 쌍대(변형) = topology figure
  "ac_vccs_phasor_circuit", // 종속전류원 2단 구동 페이저 회로 (임용 3번 회로이론) = topology figure
  "switched_rc_dc_circuit", // t=0 스위치 개방 RC (임용 2번) = topology figure
  "switched_rl_dual_src_circuit", // 2전원 SPDT 스위치 RL 과도 (임용 3번 회로이론) = topology figure
  "dff_state_design_circuit", // D-FF 2개 + 게이트 구현 (임용 9번 정보과 (다)) = topology figure
  "jk_sync_counter_circuit", // JK 플립플롭 3개 동기식 카운터 (가) = topology figure
  "jk_state_machine_circuit", // JK 카운터 비순환 상태형 (가) = topology figure
  "jk_state_machine_variant_circuit", // 위 + 게이트 (변형) = topology figure
  "clean_counter_circuit", // 범용 카운터 버스식 (GPT mod-N 등) = topology figure
  "scr_turn_on_circuit", // SCR 턴온 회로 (가) = topology figure
  "reactive_vi_integral_circuit", // 인덕터/커패시터 v-i 적분 회로 (가) = topology figure
  "supermesh_switched_dependent_circuit", // 스위치 2-state + 종속전류원 + supermesh (임용 8번) = topology figure
]);

/**
 * 본문/조건/질문에 그림 참조 표현이 있는지 검사한다.
 * 예: "아래 그림", "다음 그림", "위 그림", "그림과 같이", "[그림]" 등.
 */
function referencesFigure(text: string): boolean {
  if (!text) return false;
  const patterns = [
    /(아래|다음|위)\s*그림/,
    /그림\s*과?\s*같이/,
    /\[\s*그림/,
    /도시(된|함)/,
  ];
  return patterns.some((p) => p.test(text));
}

export type ValidationIssue = {
  rule: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

/**
 * 7개 규칙으로 단일 문제를 검사한다 (CLAUDE.md Architecture #8).
 *  1. subject mismatch
 *  2. family mismatch (TopicKey)
 *  3. figureVariants 누락 (requiresMultiFigure=true인데 ruleSet.requiredFigureRoles 미충족)
 *  4. topology 없음 (회로 문제인데 netlist figure 부재)
 *  5. switch 문제인데 SW component 없음
 *  6. waveform 문제인데 waveform figure 없음
 *  7. kmap 문제인데 implementation_circuit 없음
 *
 * @param expected 원본/요청에서 결정된 기준
 */
export function validateProblem(args: {
  problem: GeneratedProblem;
  expected: {
    subject: SubjectKey;
    topicKey?: TopicKey;
    ruleSet: RuleSet;
  };
}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { problem, expected } = args;

  // 1. subject — GeneratedProblem 자체엔 subject가 없으므로 RuleSet의 subject가 expected와 일치 여부만 확인
  if (expected.ruleSet.subject !== expected.subject) {
    issues.push({ rule: "subject_mismatch", message: `ruleSet.subject(${expected.ruleSet.subject}) ≠ expected.subject(${expected.subject})` });
  }

  // 2. family (topicKey) mismatch
  if (expected.topicKey && problem.topicKey && problem.topicKey !== expected.topicKey) {
    issues.push({ rule: "family_mismatch", message: `topicKey(${problem.topicKey}) ≠ expected(${expected.topicKey})` });
  }

  const figs: FigureVariant[] = problem.figureVariants ?? [];
  const roles = new Set<FigureRole>(figs.map((f) => f.role));

  // state figure가 required면 main_circuit은 자동 satisfied로 간주
  const stateRequired = expected.ruleSet.requiredFigureRoles.some((r) => isStateRole(r));
  // ★ actual figure에 state_before/after(SW 2-state 회로)가 있으면 그것이 main/original_circuit
  //   역할을 대체한다. 전용 스위치 2-state archetype(supermesh_switched_dependent 등)은 (가)·(나)
  //   두 회로 figure로 회로를 모두 제시하므로 별도 main_circuit figure를 요구하지 않는다.
  const hasActualStateFig = roles.has("state_before") || roles.has("state_after");

  // Thevenin-style 문제 검출: original_circuit + equivalent_circuit 두 figure를 가지면
  //   state_before/state_after/waveform 요구를 등가회로 형식으로 대체 만족한 것으로 간주.
  //   (예: thevenin_switched_rc archetype은 (가) 원본 + (나) Thevenin 등가로 스위치 전후 분석)
  const isTheveninStyle =
    (roles.has("original_circuit") || roles.has("main_circuit")) &&
    (roles.has("equivalent_circuit") || roles.has("thevenin_equivalent") || roles.has("norton_equivalent"));

  // 3. figureVariants 누락 — alias 그룹 단위로 dedup해서 한 번씩만 검사
  const checkedGroups = new Set<string>();
  for (const r of expected.ruleSet.requiredFigureRoles) {
    // state가 required이거나 actual figure에 state(SW 2-state)가 있으면 main_circuit/original_circuit skip (대체 만족)
    if ((stateRequired || hasActualStateFig) && isMainCircuitRole(r)) continue;
    // Thevenin-style이면 state/waveform 요구는 등가회로로 대체 만족
    if (isTheveninStyle && (isStateRole(r) || r === "waveform" || r === "input_waveform" ||
        r === "output_waveform" || r === "measurement_waveform" || r === "frequency_response_curve")) {
      continue;
    }

    const aliases = getAliasGroup(r);
    const groupKey = aliasGroupKey(r);
    if (checkedGroups.has(groupKey)) continue;
    checkedGroups.add(groupKey);

    if (!aliases.some((a) => roles.has(a as FigureRole))) {
      const others = aliases.filter((a) => a !== r);
      issues.push({
        rule: "missing_figure_variant",
        message: `필수 figure role 누락: ${r}${others.length > 0 ? ` (or ${others.join("/")})` : ""}`,
      });
    }
  }

  const isCircuitSubject =
    expected.subject === "electronics" ||
    expected.subject === "circuit_theory" ||
    expected.subject === "digital_logic";

  // 4. topology 없음 (회로 figure가 하나도 없으면)
  //    개념·도식 해석형(characteristic_curve, concept_diagram만 있는 경우)은 회로 figure 면제.
  const hasCircuitFigure = figs.some((f) => CIRCUIT_FIGURE_TYPES.has(f.diagramType));
  const hasConceptOnly = figs.length > 0 && figs.every((f) =>
    f.diagramType === "characteristic_curve" ||
    f.diagramType === "concept_diagram" ||
    f.diagramType === "rlc_resonance_max_power_circuit" ||
    f.diagramType === "mux_gar_circuit" ||
    f.diagramType === "mux_diagram" ||
    // sequence_detector 3 figure: 블록도·상태도·상태표 모두 개념도 (analog/logic netlist 아님)
    f.diagramType === "sequence_block" ||
    f.diagramType === "sequence_state_diagram" ||
    f.diagramType === "sequence_state_table" ||
    // thevenin_switched_rc 2 figure — 둘 다 fixed-slot circuit. analog_netlist 분류는 아니지만 회로 figure.
    f.diagramType === "thevenin_original_circuit" ||
    f.diagramType === "thevenin_equivalent_circuit" ||
    // opamp_cascade — 2-OPAMP cascade fixed-slot circuit (임용 10번)
    f.diagramType === "opamp_cascade" ||
    // truth_table·waveform도 회로 figure 아님 (보조 figure로 단독 사용 가능)
    f.diagramType === "truth_table" ||
    f.diagramType === "waveform" ||
    // ★ 수 표현 고리(임용 4번) — 회로가 아니라 **수 체계 도식**이다(2026-07-30 실측: missing_topology 발화).
    f.diagramType === "number_ring_diagram" ||
    // 상태도(고리) — jk_state_diagram도 회로 figure가 아니다.
    f.diagramType === "jk_state_diagram",
  );
  // analog 회로는 analog_netlist, 디지털논리는 logic_network — 둘 중 하나는 있어야
  // 단, 개념·도식 해석형(특성곡선·개념도)은 회로 figure 없이도 정상 — 면제.
  if (isCircuitSubject && figs.length > 0 && !hasCircuitFigure && !hasConceptOnly) {
    issues.push({ rule: "missing_topology", message: "회로 문제이지만 analog_netlist/logic_network figure 없음" });
  }

  // 5. switch — state_before/state_after 중 하나라도 있는데 SW component 없음
  const hasStateFig = roles.has("state_before") || roles.has("state_after");
  if (hasStateFig) {
    const hasSwitch = figs.some((f) => {
      // 전용 fixed-slot 스위치 회로 figure는 SW를 렌더러가 내장 — payload에 components 배열이 없어도 인정.
      if (f.diagramType === "supermesh_switched_dependent_circuit") return true;
      if (f.diagramType !== "analog_netlist") return false;
      const d = f.diagram as { components?: Array<{ type?: string }> } | null | undefined;
      return Array.isArray(d?.components) && d.components.some((c) => (c?.type ?? "").toUpperCase() === "SW");
    });
    if (!hasSwitch) {
      issues.push({ rule: "switch_without_sw_component", message: "state_before/after figure 있으나 SW 소자 없음" });
    }
  }

  // 6. waveform 문제인데 waveform figure 없음
  //   ※ Thevenin-style은 등가회로 두 figure로 대체 만족 — waveform 요구 면제.
  if (expected.ruleSet.semantic.hasWaveformEvolution &&
      !figs.some((f) => f.diagramType === "waveform") &&
      !isTheveninStyle) {
    issues.push({ rule: "missing_waveform", message: "hasWaveformEvolution=true이지만 waveform figure 없음" });
  }

  // 7. kmap 문제인데 implementation_circuit 없음
  if (roles.has("kmap") && !roles.has("implementation_circuit")) {
    issues.push({ rule: "kmap_without_implementation", message: "kmap figure 있으나 implementation_circuit 없음" });
  }

  // 8. 본문/조건/질문이 그림을 참조하는데 figure가 없거나 unsupported diagramType
  const refText = [problem.content, ...problem.conditions, problem.question].join("\n");
  if (referencesFigure(refText)) {
    const renderable = figs.some((f) =>
      SUPPORTED_DIAGRAM_TYPES.includes(f.diagramType as DiagramType)
    );
    if (!renderable) {
      issues.push({
        rule: "figure_reference_without_renderable",
        message: figs.length === 0
          ? "본문이 '그림'을 참조하지만 figureVariants가 비어 있음"
          : `본문이 '그림'을 참조하지만 렌더 가능한 diagramType이 없음 (있는 type: ${figs.map((f) => String(f.diagramType)).join(", ")})`,
      });
    }
  }

  // 9. 발문이 참조하는 빈칸 마커가 실제로 존재하는지 (실측 신고: "ㅁ이 없어")
  //    예: 발문 "괄호 안의 ㅇ, ㅁ에 해당하는 용어를 순서대로 쓰시오"인데 본문엔 ( ㅇ )만 있고
  //    ㅁ가 어디에도 없어 학생이 답할 대상이 사라진 문항이 생성됐다.
  //    마커는 본문·조건뿐 아니라 **그림 안**(표 셀·회로 라벨)에 있을 수도 있으므로 figure까지 훑는다.
  //    (예: dff_state_design은 ㉠~㉣이 truth_table 셀에 들어간다.)
  const referencedMarkers = extractBlankMarkers(problem.question);
  if (referencedMarkers.length > 0) {
    let figureText = "";
    try {
      figureText = JSON.stringify(figs ?? []);
    } catch {
      figureText = "";
    }
    // ★ 지시문 문장은 제외하고 찾는다 — "괄호 안의 ○, □에 해당하는 용어를 쓰시오" 같은 문장이
    //   content에 그대로 복사되는 탓에, 마커가 **설명(빈칸 자리)에는 없고 지시문에만** 있어도
    //   통과하던 구멍이 있었다(실측: 설명은 ○ 하나뿐인데 답은 "PIN, 정류" 2개).
    const INSTRUCTION_SENTENCE = /(쓰시오|쓰라|구하시오|구하라|고르시오|서술하시오|답하시오|나열하시오)/;
    const bodyLines = [problem.content, ...problem.conditions, figureText]
      .flatMap((t) => String(t ?? "").split(/\n|(?<=[.!?])\s+/))
      .filter((line) => !INSTRUCTION_SENTENCE.test(line));
    const missing = referencedMarkers.filter((m) => !bodyLines.some((line) => line.includes(m)));
    if (missing.length > 0) {
      issues.push({
        rule: "blank_marker_missing",
        message: `발문이 참조하는 빈칸 마커 ${missing.join("·")}가 본문·조건·그림 어디에도 없음 — 학생이 답할 대상이 없다`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * 발문에서 빈칸 마커(㉠·①·ㅇ·ㅁ 류)를 추출.
 *
 *   임용 문항은 본문·표·그림에 마커를 찍고 발문에서 "㉠~㉣을 구하시오"처럼 참조한다.
 *   마커로 쓰이는 문자만 좁게 인정한다 — 원문자(㉠…·①…), 한글 낱자(ㄱ·ㅇ·ㅁ 등),
 *   도형(○·□·△·◇ 등). 일반 한글 음절은 마커가 아니므로 오탐 위험이 낮다.
 *   ★ 도형까지 포함하는 이유: 같은 유형이라도 실행에 따라 "ㅇ, ㅁ"로도 "○, □"로도 나온다(실측).
 */
function extractBlankMarkers(question: string): string[] {
  if (!question) return [];
  // ㉠-㉻(원 한글), ①-⑮(원 숫자), ㄱ-ㅎ(낱자), 도형 마커
  const MARKER = /[㉠-㉻①-⑮ㄱ-ㅎ○●〇◯□■◻◼◇◆△▲▽▼]/g;
  // ★ "참조"로 쓰인 마커만 인정한다. 객관식 보기("① 쇼트키 ② 제너 …")처럼 발문 안에서
  //   마커가 **선택지를 정의**하는 경우는 본문에 없어도 정상이므로 제외해야 한다
  //   (제외하지 않으면 정상 객관식이 계속 재생성 대상이 된다).
  //   판별: 마커 뒤에 조사·구두점·범위표시가 오면 참조(㉠~㉣에, ②가, "ㅇ, ㅁ에"),
  //         일반 낱말이 이어지면 선택지 정의(② 제너 다이오드).
  const markers: string[] = [];
  for (const m of question.matchAll(MARKER)) {
    const rest = question.slice((m.index ?? 0) + m[0].length);
    if (/^\s*(?:[)\]]?\s*)(?:[에와과의가을를은는이,·、~∼-]|$)/.test(rest)) {
      markers.push(m[0]);
    }
  }
  return [...new Set(markers)];
}
