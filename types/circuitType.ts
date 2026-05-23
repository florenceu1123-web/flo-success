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
  // ── 과도응답 ─────────────────────────────────
  | "rc_step"               // RC step input 응답
  | "rl_step"               // RL step input 응답
  | "rlc_step"              // RLC step input 응답 (under/over/critically damped) — 단순 V_step+R+L+C 직렬
  | "rlc_resonance"         // RLC 직렬/병렬 공진 + 주파수응답 (I[A] vs f[Hz] 곡선, f_0, Q, Imax) — 임용 9번 형식
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
  // ── 디지털논리 ───────────────────────────────
  | "kmap_sop"              // K-map → 최소 SOP → 구현 회로 (AND-OR)
  | "kmap_pos"              // K-map → 최소 POS → 구현 회로 (OR-AND, SOP dual)
  | "flipflop_counter"      // 2비트 D-FF 카운터 (상태 순서 → D 입력 K-map)
  | "flipflop_mixed_app"    // T-FF + JK-FF 등 혼합 응용회로 — 상태표 + 파형도
  | "ff_with_waveform"      // 단일 FF (D/T/JK) + 비동기 RESET + 조합부 + 파형도 (임용 8번 형식)
  | "combinational_gate"    // 3-입력 2-출력 조합 회로 (F, G 동시 설계)
  | "fsm"                   // Mealy 4-state FSM (상태 전이도 + 구현 회로)
  | "waveform_analysis"     // 디지털 입력 파형 → 출력 파형 분석
  // ── Universal (rule-based) ───────────────────
  | "universal_dc"          // 임의 DC 회로(V/I/R) + 다단계 query 패턴 — archetype-free path
  | "universal_ac"          // 임의 AC 회로(R/L/C/V/I) + phasor/공진/최대전력 query — archetype-free
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
