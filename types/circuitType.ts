/**
 * CircuitType — netlist generator가 분기 키로 사용하는 회로 archetype.
 *
 * TopicKey(textbook 분류)와 다른 점:
 *  - TopicKey: 학습 단원 (mesh_analysis, nodal_analysis ...)
 *  - CircuitType: 코드 generator가 "이 회로를 어떻게 만들지" 결정하는 모델
 *
 * 예: TopicKey="dc_resistive" 이지만 본문에 "테브난 등가"가 나오면 CircuitType="thevenin".
 *     반대로 TopicKey="mesh_analysis"는 그 자체가 archetype.
 *
 * 현재는 회로이론 위주. electronics/digital_logic은 "unsupported"로 fallback.
 */
export type CircuitType =
  // ── 등가회로 ─────────────────────────────────
  | "thevenin"              // a-b 단자에서 본 Thevenin 등가 (V_th + R_th)
  | "norton"                // a-b 단자에서 본 Norton 등가 (I_n + R_n)
  | "max_power_transfer"    // 최대 전력 전달 (R_L 미정)
  // ── 직류 저항 회로 해석 ──────────────────────
  | "dc_mesh"               // 메시 해석 (1+ mesh, 종속 없음, 스위치 없음)
  | "dc_nodal"              // 노드 해석
  | "dc_supermesh"          // 슈퍼메시 (두 mesh 공유 source)
  | "dc_supernode"          // 슈퍼노드
  | "dc_dependent_source"   // 종속전원 포함 DC 회로
  | "ac_superposition"      // AC 다중 전원 (V_ac + I_ac) + R/L/C 임피던스 + 중첩의 원리 (임용 10번)
  | "ac_parallel_branches"  // AC + 다중 병렬 가지 (R∥L1∥I_S∥L2∥R∥C) — 임용 5번 형식. V_C → I_L2·I_S → I_R1 phasor 단계
  | "bjt_bias"              // DC 바이어스된 BJT 회로 (임용 7번) — V_BE=0.7V 가정, V_E·I_C·V_O 계산, 저항률 ρ
  | "mosfet_bias"           // NMOS DC bias 회로 (단순 단일단) — 포화 영역 I_D=K(V_GS-V_TH)², V_GS·I_D·V_D·V_DS 단계 도출
  | "mosfet_cascode_mirror" // NMOS cascode current mirror (임용 10번 정확 재현) — M1 reference + M2 mirror + M3 cascode + R(학생 도출) + R_G 분압. 단계 1:V_GS1·R, 단계 2:V_D2, 단계 3:V_GS3·V_S3
  | "counter_dac_comparator" // 복합형: 2-bit JK 카운터 + R-2R DAC + OPAMP 비교기 (임용 8번)
  | "flash_adc_2bit"         // 복합형: 2비트 플래시 ADC (저항사다리+3비교기+인코더→Q1Q0, 임용 6번). 온도계코드 빈칸·Q최소화·논리회로
  | "zener_bjt_regulator"    // 제너+BJT 전압 레귤레이터 (임용 8번) — V_o=V_z+V_BE, I_1·I_z·R_4 도출. "포화영역" 키워드로 특성곡선 오분류 방지
  // ── 과도응답 ─────────────────────────────────
  | "rc_step"               // RC step input 응답
  | "rl_step"               // RL step input 응답
  | "rlc_step"              // RLC step input 응답 (under/over/critically damped) — 단순 V_step+R+L+C 직렬
  | "rlc_resonance"         // RLC 직렬/병렬 공진 + 주파수응답 (I[A] vs f[Hz] 곡선, f_0, Q, Imax) — 임용 9번 형식
  | "rlc_resonance_max_power" // RLC 공진 + Wheatstone 5저항 → r_S + R_L 최대전력. 단계: C·r_S·R_L+P_max — 임용 7번 형식
  | "switched_rlc_step"     // 스위치 t=0 SPDT 전환 (A↔B) + dual-source(V_s/I_s) + RLC core. 초기조건(v_C(0⁻)·i_L(0⁻)) → dv_C(0⁺)/dt → 2차 미방+v_C(t). 단순화 v1 (3-leg)
  | "switched_rlc_5leg"     // 임용 9번 정확 재현 — 6-leg (V_s | R | R+L_a | C∥R | L_b | I_s) + 2 top horizontal R + SPDT SW. v_C(0⁻)·i_L(0⁻) → dv_C(0⁺)/dt → 2차 미방+v_C(t)
  // ── 스위칭 ───────────────────────────────────
  | "switched_rc"           // SW가 t=0에 닫혀 RC 응답 시작
  | "switched_rl"           // SW가 t=0에 닫혀 RL 응답 시작
  | "switched_dc"           // SW open/closed 두 DC 정상상태 비교 (C/L 없음, 과도 없음)
  // ── 전자회로 ─────────────────────────────────
  | "opamp"                 // 이상 OPAMP DC 분석 (inverting/non_inverting/summing 등)
  | "opamp_time_domain"     // 시간영역 OPAMP (integrator / differentiator)
  | "bjt_small_signal"      // BJT CE 소신호 등가 (hybrid-π: r_π + VCCS)
  | "bjt_characteristic_curve" // BJT 출력특성곡선(I_C-V_CE) 영역(포화/활성/차단) 식별 + 스위칭 동작 ON/OFF (개념·도식 해석형)
  // ── 디지털논리 ───────────────────────────────
  | "kmap_sop"              // K-map → 최소 SOP → 구현 회로 (AND-OR)
  | "kmap_pos"              // K-map → 최소 POS → 구현 회로 (OR-AND, SOP dual)
  | "flipflop_counter"      // 2비트 D-FF 카운터 (상태 순서 → D 입력 K-map)
  | "flipflop_mixed_app"    // T-FF + JK-FF 등 혼합 응용회로 — 상태표 + 파형도
  | "tff_state_table_blank" // T-FF 2개 (T_A·T_B) + 입력 C + 상태표 빈칸 ㉠~㉧ + K-map 도출 (임용 7번 정보과)
  | "ff_with_waveform"      // 단일 FF (D/T/JK) + 비동기 RESET + 조합부 + 파형도 (임용 8번 형식)
  | "combinational_gate"    // 3-입력 2-출력 조합 회로 (F, G 동시 설계)
  | "mux_implementation"    // (가) 조합논리회로 + (나) 4×1 MUX 등가구현 — POS→SOP→MUX 입력 결정 (임용 5번 형식)
  | "fsm"                   // Mealy 4-state FSM (상태 전이도 + 구현 회로)
  | "sr_ff_mux_sequential"  // SR-FF 2개 + 2×1 MUX 4개 상태순환 순차회로 설계 (임용 10번 정보과). 여기표→S/R SOP, 선택선 분해로 MUX 입력 도출
  | "sequence_detector"     // 시퀀스 검출기 + D-FF + 상태도/표 빈칸 (임용 8번 정보과)
  | "waveform_analysis"     // 디지털 입력 파형 → 출력 파형 분석
  | "thevenin_switched_rc"  // SW + RC + 점선박스(Thevenin 대상) 다단계 (임용 9번 정보과)
  | "opamp_cascade_voltage_divider"  // 2-OPAMP cascade + 5R + V_o/V_i 전달함수 (임용 10번)
  | "opamp_generic"          // 범용 OPAMP — GPT 구조추출 netlist + MNA (가산기+차동 R역산 등, 임용 8번)
  | "thevenin_dependent_generic"  // 회로이론 테브난+최대전력+종속전원 — GPT 구조추출 + V_oc/I_sc (임용 9번)
  | "sequential_dff_generic" // 디지털 순서논리 D-FF+클록+파형 상태분석 — GPT 구조추출 + 상태 시뮬 (임용 12번)
  | "async_preset_ripple_counter" // 비동기 SET/RESET D-FF 응용회로 — NOR(F) all-zero 검출로 I 패턴 비동기 적재 + 리플 T-FF 다운카운트 (출력 모두 0이면 재적재). ㉠ 적재값·㉡ 카운트 파형 도출
  // ── Universal (rule-based) ───────────────────
  | "universal_dc"          // 임의 DC 회로(V/I/R) + 다단계 query 패턴 — archetype-free path
  | "universal_ac"          // 임의 AC 회로(R/L/C/V/I) + phasor/공진/최대전력 query — archetype-free
  | "universal_ac_pwl"      // 임의 AC + 다이오드(piecewise-linear) + 스위치(event) — 시간영역 sample (임용 6번 형식). Phase 2~ (현재는 분류만, 솔버 미구현)
  | "universal_digital"     // 임의 N-변수 M-함수 K-map + gate combination — digital_logic archetype-free
  // ── fallback ─────────────────────────────────
  | "unsupported";          // electronics / digital_logic / 분류 실패

/**
 * Generator가 사용할 회로 구성 파라미터.
 * 모든 필드 옵셔널 — circuit_type별로 의미 있는 필드만 채움.
 */
export type CircuitTypeParams = {
  // ── 소자 카운트 (Generator floor) ────────────
  resistorCount?: number;
  vSourceCount?: number;
  iSourceCount?: number;
  capacitorCount?: number;
  inductorCount?: number;
  switchCount?: number;
  dependentSourceCount?: number;
  // ── 토폴로지 ─────────────────────────────────
  meshCount?: number;
  nodeCount?: number;
  branchCount?: number;
  // ── 의미 ─────────────────────────────────────
  /** a-b 같은 외부 단자가 있는가 (Thevenin/Norton/max_power) */
  hasTerminalPort?: boolean;
  /** R_L 같은 학생-채움 부하 placeholder가 있는가 */
  hasLoadPlaceholder?: boolean;
  /** SW 상태 전후 두 그림이 필요한가 */
  hasStateTransition?: boolean;
  /** 종속전원 (VCVS/VCCS/CCVS/CCCS) 존재 */
  hasDependentSource?: boolean;
  /** waveform figure 동반 필요 */
  hasWaveform?: boolean;
  // ── 디지털 K-map / 조합회로 전용 ──────────────
  /** 다중 출력 K-map / 회로의 회로 내 학생-채움 빈칸 게이트 수 (예: ⓐ, ⓑ → 2) */
  kmapBlankCount?: number;
  // ── 플립플롭 응용회로 전용 ───────────────────
  /** 사용 FF 종류 (예: ["T","JK"]). flipflop_mixed_app / ff_with_waveform에서 의미. */
  ffTypes?: Array<"D" | "T" | "JK">;
  /** 상태표(현재상태→입력→다음상태) figure 필요 */
  hasStateTable?: boolean;
  /** 비동기 RESET 입력 존재 (ff_with_waveform 등) */
  hasAsyncReset?: boolean;
  // ── RLC 공진 (rlc_resonance) ─────────────────
  /** "series" | "parallel" — RLC 토폴로지. exam_similar는 원본 유지, exam_variant는 임의 선택. */
  rlcTopology?: "series" | "parallel";
  // ── BJT 다중 트랜지스터 (전류미러·차동증폭기 등) ──
  /** 전류미러/차동증폭기 등 multi-BJT 토폴로지 플래그. bjt_bias 파이프라인에서 분기. */
  multiBjtMirror?: boolean;
  /** 인벤토리에서 추출한 BJT(NPN/PNP/트랜지스터) 개수. */
  bjtCount?: number;
  // ── universal_ac_pwl (다이오드 + SW + AC) ────
  /** 다이오드 존재 — universal_ac_pwl path 트리거. */
  hasDiode?: boolean;
  /** 인벤토리에서 추출한 다이오드(D) 개수. */
  diodeCount?: number;
  /** SW 존재 (counts.SW + features.hasSwitch + 키워드 기반 inferred). */
  hasSwitch?: boolean;
  /** AC 전원 존재 (hasACInventory 또는 text 키워드 기반). */
  hasACSource?: boolean;
  // ── sequence_detector (시퀀스 검출기 + D-FF + 상태도) ──────
  /** 검출 시퀀스 패턴 — '110', '101', '011', '1010' 등. 미지정 시 generator가 변형. */
  sequencePattern?: string;
  // ── bjt_characteristic_curve device hint (임용 6번 등) ───────
  /**
   * 원본이 MOSFET 특성곡선이면 "mosfet" — generator가 BJT-only SIMILAR pool 대신
   * MOSFET variant pool에서 pick하도록 강제. 미지정 시 mode 기반 default.
   */
  device?: "bjt" | "mosfet";
  // ── kmap_sop truth-table-input variant (임용 5번 정보과) ──────
  /**
   * 임용 5번 형식 — (가) 진리표 + (나) 간략화된 회로(㉠ 빈칸).
   * true면 kmap_sop pipeline이:
   *   - figure 순서·라벨을 (가) truth_table → (나) implementation_circuit으로 정렬
   *   - 변수명을 W·X·Y·Z 로 강제 (4-변수)
   *   - don't care 행 일부 포함
   *   - 회로에 ㉠ 빈칸 게이트 마커 + 점선 그룹 표시
   *   - 풀이 단계: [단계 1] K-map 도출 → [단계 2] ㉠ 게이트 식별 → [단계 3] 점선 부분 게이트 식별
   */
  truthTableBlank?: boolean;
  // ── universal_digital 공유항·입력결정 variant (임용 7번 정보과 형식) ──────
  /**
   * 다중 출력 공유항(multi-output shared term) + 입력변수 빈칸 형식.
   * 원본이 "함수가 Σm으로 주어지고 + 빈 K-map + 회로 입력 ㉠㉡㉢ 빈칸" 형식이면 true.
   * true면 universal_digital pipeline이 출력 합성(정방향) 대신:
   *   - 공유 prime implicant를 갖는 M개 함수 minterm 셋 생성
   *   - figure: (나) 빈 K-map + (다) 공유항 회로 (입력 ㉠㉡㉢ 빈칸)
   *   - 풀이 방향: [단계 1] K-map 도출 → [단계 2] 중복(공유) 항 → [단계 3] 입력변수 결정
   */
  sharedTermInputBlank?: boolean;
  // ── waveform_analysis 타이밍→논리 도출 (임용 8번 형식) ──────
  /**
   * 타이밍 도표만 주어지고 학생이 회로를 도출하는 방향 (임용 5번의 역방향).
   * 원본이 "입력 A·B·C + 출력 F 타이밍 도표만 제시 → ① F의 카르노맵 작성 ② 최소화+논리회로 도시
   * ③ 2입력 NAND 게이트로 도시" 형식이면 true.
   * true면 waveform_analysis pipeline이:
   *   - given figure: 타이밍 도표(waveform) **하나만** (회로·kmap은 학생 도출물 → solutionFigures)
   *   - 풀이 방향: [단계1] 타이밍→카르노맵 [단계2] 최소화 F + 회로 도시 [단계3] NAND 변환
   */
  timingGivenDeriveCircuit?: boolean;
  // ── universal_ac DC+AC 중첩 모드 (임용 2022 B-6 형식) ──────
  /**
   * 직류 전원 + 교류 전원이 스위치(단자 선택)로 연결된 정상상태 중첩 문제.
   * true면 universal_ac pipeline이 phasor 단일 해석 대신:
   *   - DC 패스(교류 전원 제거, L=단락) → I_DC
   *   - AC 패스(직류 전원 제거, 페이저 해석) → i_ac(t) + 인덕터 전류 분배
   *   - 중첩: i(t) = I_DC + i_ac(t)
   *   - figure: 단일 회로 (DC·AC 전원 + SW + R + 병렬 L) — waveform·state pair 면제
   */
  acDcSuperposition?: boolean;
  /**
   * 2개의 교류 전원(전압원 + 전류원) + RLC + 부하 R_L 최대 평균 전력 (임용 10번 형식).
   * true면 universal_ac pipeline이 buildFromTopology 대신 고정 토폴로지 archetype generator
   * (generateAcTheveninMaxPower)를 사용 — generic topology 추출이 부하 단자 연결을 잃는 문제 회피.
   *   - [단계 1] Z_th  [단계 2] V_th(중첩)  [단계 3] R_L=|Z_th|, P_max
   */
  theveninMaxPower?: boolean;
  /**
   * AC+DC 중첩 RC 회로 (임용 12번 회로이론 형식) — 스위치 없는 고정 토폴로지.
   * 교류 전원 v(t)=A√2cos(ωt) + 직류 전원이 RC 회로에 포함, 중첩의 원리로 i_ab·I_DC·I_R4 도출.
   * true면 universal_ac pipeline이 generic buildFromTopology 대신 generateAcDcSuperpositionRc 사용
   * (generic 추출은 두 전원 병합·DC 소실). 기존 acDcSuperposition(스위치+RL)과 다른 구조.
   */
  acDcSuperpositionRc?: boolean;
};

/**
 * 분류 결과. confidence가 low면 fallback(unsupported) 또는 user 확인 권장.
 */
export type CircuitTypeClassification = {
  type: CircuitType;
  params: CircuitTypeParams;
  confidence: "high" | "medium" | "low";
  /** 분류 근거 한 줄 (로그·디버깅용) */
  reasoning: string;
};
