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
  // ── 과도응답 ─────────────────────────────────
  | "rc_step"               // RC step input 응답
  | "rl_step"               // RL step input 응답
  | "rlc_step"              // RLC step input 응답 (under/over/critically damped)
  // ── 스위칭 ───────────────────────────────────
  | "switched_rc"           // SW가 t=0에 닫혀 RC 응답 시작
  | "switched_rl"           // SW가 t=0에 닫혀 RL 응답 시작
  | "switched_dc"           // SW open/closed 두 DC 정상상태 비교 (C/L 없음, 과도 없음)
  // ── 전자회로 ─────────────────────────────────
  | "opamp"                 // 이상 OPAMP DC 분석 (inverting/non_inverting/summing 등)
  | "opamp_time_domain"     // 시간영역 OPAMP (integrator / differentiator)
  // ── 디지털논리 ───────────────────────────────
  | "kmap_sop"              // K-map → 최소 SOP → 구현 회로 (AND-OR)
  | "kmap_pos"              // K-map → 최소 POS → 구현 회로 (OR-AND, SOP dual)
  | "flipflop_counter"      // 2비트 D-FF 카운터 (상태 순서 → D 입력 K-map)
  | "combinational_gate"    // 3-입력 2-출력 조합 회로 (F, G 동시 설계)
  | "fsm"                   // Mealy 4-state FSM (상태 전이도 + 구현 회로)
  | "waveform_analysis"     // 디지털 입력 파형 → 출력 파형 분석
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
