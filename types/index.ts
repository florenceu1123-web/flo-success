// =====================================================================
// Subject (과목) — canonical key는 영어, 표시 라벨은 한국어
// =====================================================================

/** 과목 캐널 키 (API·DB·로그) */
export type SubjectKey =
  | "digital_logic" | "electronics" | "circuit_theory" | "mixed_signal" | "electromagnetics"
  | "c_language"      // C언어 — 회로 아님. 코드 분석·출력 예측 (GPT 생성, 코드 블록 figure)
  | "communications"  // 통신 — 회로 아님. 변조·표본화·정보이론 등 (GPT 생성, 파형·스펙트럼 figure)
  | "pedagogy";       // 교육학(교직) — 회로 아님. 교육심리·교육과정·평가 등 (GPT 생성, figure 없음)

/** 과목 한국어 표시 라벨 */
export type SubjectLabel = "디지털논리회로" | "전자회로" | "회로이론" | "복합형" | "전자기학" | "C언어" | "통신" | "교육학";

/** UI 노출 순서로 정렬한 키 목록 */
export const SUBJECT_KEYS: SubjectKey[] = ["electronics", "circuit_theory", "digital_logic", "mixed_signal", "electromagnetics", "c_language", "communications", "pedagogy"];

/** SubjectKey → 한국어 라벨 */
export const SUBJECT_LABEL: Record<SubjectKey, SubjectLabel> = {
  electronics: "전자회로",
  circuit_theory: "회로이론",
  digital_logic: "디지털논리회로",
  mixed_signal: "복합형",
  electromagnetics: "전자기학",
  c_language: "C언어",
  communications: "통신",
  pedagogy: "교육학",
};

/** 한국어 라벨 → SubjectKey (역매핑, 외부 입력 정규화용) */
export const SUBJECT_KEY_BY_LABEL: Record<SubjectLabel, SubjectKey> = {
  전자회로: "electronics",
  회로이론: "circuit_theory",
  디지털논리회로: "digital_logic",
  복합형: "mixed_signal",
  전자기학: "electromagnetics",
  C언어: "c_language",
  통신: "communications",
  교육학: "pedagogy",
};

// =====================================================================
// Topic (세부 주제) — 과목별 sub-classification
// =====================================================================

/** 디지털논리회로 세부 주제 */
export type DigitalLogicTopic =
  | "kmap_sop"
  | "kmap_pos"
  | "combinational_gate"
  | "flipflop_counter"
  | "fsm"
  | "sequence_detector"   // 시퀀스 검출기 + D-FF + 상태도/표 빈칸 (임용 8번 정보과)
  | "waveform_analysis";

/** 전자회로 세부 주제 */
export type ElectronicsTopic =
  | "opamp"
  | "bjt_bias"
  | "bjt_amplifier"
  | "mosfet_bias"
  | "mosfet_amplifier"
  | "diode"
  | "mixed_signal";

/** 회로이론 세부 주제 */
export type CircuitTheoryTopic =
  | "dc_resistive"
  | "mesh_analysis"
  | "nodal_analysis"
  | "transient_rc"
  | "transient_rl"
  | "rlc_response"
  | "supermesh"
  | "supernode"
  | "dependent_source"
  | "switching_circuit";

/** 복합형(전자+디지털 혼합) 세부 주제 */
export type MixedSignalTopic =
  | "counter_dac_comparator"   // 2-bit JK 카운터 + R-2R DAC + 비교기 — 임용 8번
  | "adc_sample_hold"          // 샘플홀드 + ADC (잠재)
  | "logic_opamp_hybrid";      // 그 외 일반 디지털+아날로그 혼합

/** 전자기학 세부 주제 (회로 아님 — 장·공식 기반) */
export type ElectromagneticsTopic =
  | "electrostatics"          // 점전하 전계·전위·쿨롱 힘
  | "gauss_law"               // 가우스 법칙 (선전하·면전하·구대칭)
  | "capacitance"             // 정전용량·정전 에너지
  | "magnetostatics"          // 직선도선·솔레노이드·토로이드 자기장 (앙페르)
  | "em_induction"            // 전자기 유도 (패러데이·운동 기전력)
  | "magnetic_force"          // 로렌츠 힘·전류 도선의 힘
  | "em_wave"                 // 전자기파 (맥스웰)
  | "current_conduction";     // 정상 전류·도전율·저항 (동축 저항 등)

/** C언어 세부 주제 (회로 아님 — 코드 분석·출력 예측) */
export type CLanguageTopic =
  | "c_output_prediction"     // 코드 실행 결과·출력 예측
  | "c_pointer_array"         // 포인터·배열·주소
  | "c_control_flow"          // 제어문·반복문·조건문 흐름
  | "c_function_recursion"    // 함수·재귀 호출·스택
  | "c_struct_bitwise"        // 구조체·공용체·비트 연산
  | "c_string";               // 문자열·문자 배열 처리

/** 통신 세부 주제 (회로 아님 — 신호·변조·정보이론) */
export type CommunicationsTopic =
  | "comm_analog_modulation"  // 아날로그 변조 (AM·FM·PM)
  | "comm_digital_modulation" // 디지털 변조 (ASK·FSK·PSK·QAM)
  | "comm_sampling_pcm"       // 표본화·양자화·PCM
  | "comm_information_theory" // 정보이론 (엔트로피·채널용량·부호화)
  | "comm_signal_spectrum"    // 신호·스펙트럼·푸리에·대역폭
  | "comm_noise_snr";         // 잡음·SNR·오류확률

/** 교육학(교직) 세부 주제 (회로 아님 — 교육 이론·논술형) */
export type PedagogyTopic =
  | "ped_psychology"          // 교육심리 (학습·발달·동기 이론)
  | "ped_curriculum"          // 교육과정 (교육과정 이론·유형·설계)
  | "ped_evaluation"          // 교육평가 (평가 유형·타당도·신뢰도·문항분석)
  | "ped_method_tech"         // 교육방법·공학 (교수설계·수업모형·에듀테크)
  | "ped_administration"      // 교육행정 (조직·지도성·정책·법규)
  | "ped_sociology"           // 교육사회학 (기능·갈등·재생산 이론)
  | "ped_philosophy_history"  // 교육철학·교육사 (사상·사조·역사)
  | "ped_counseling";         // 생활지도·상담 (상담이론·생활지도)

/** 모든 세부 주제 union */
export type TopicKey = DigitalLogicTopic | ElectronicsTopic | CircuitTheoryTopic | MixedSignalTopic | ElectromagneticsTopic | CLanguageTopic | CommunicationsTopic | PedagogyTopic;

/** 과목별 토픽 묶음 */
export const TOPICS_BY_SUBJECT: {
  digital_logic: DigitalLogicTopic[];
  electronics: ElectronicsTopic[];
  circuit_theory: CircuitTheoryTopic[];
  mixed_signal: MixedSignalTopic[];
  electromagnetics: ElectromagneticsTopic[];
  c_language: CLanguageTopic[];
  communications: CommunicationsTopic[];
  pedagogy: PedagogyTopic[];
} = {
  digital_logic: ["kmap_sop", "kmap_pos", "combinational_gate", "flipflop_counter", "fsm", "sequence_detector", "waveform_analysis"],
  electronics: ["opamp", "bjt_bias", "bjt_amplifier", "mosfet_bias", "mosfet_amplifier", "diode", "mixed_signal"],
  circuit_theory: [
    "dc_resistive", "mesh_analysis", "nodal_analysis",
    "transient_rc", "transient_rl", "rlc_response",
    "supermesh", "supernode", "dependent_source", "switching_circuit",
  ],
  mixed_signal: ["counter_dac_comparator", "adc_sample_hold", "logic_opamp_hybrid"],
  electromagnetics: ["electrostatics", "gauss_law", "capacitance", "magnetostatics", "em_induction", "magnetic_force", "em_wave", "current_conduction"],
  c_language: ["c_output_prediction", "c_pointer_array", "c_control_flow", "c_function_recursion", "c_struct_bitwise", "c_string"],
  communications: ["comm_analog_modulation", "comm_digital_modulation", "comm_sampling_pcm", "comm_information_theory", "comm_signal_spectrum", "comm_noise_snr"],
  pedagogy: ["ped_psychology", "ped_curriculum", "ped_evaluation", "ped_method_tech", "ped_administration", "ped_sociology", "ped_philosophy_history", "ped_counseling"],
};

/** TopicKey → SubjectKey 역매핑 (validation·라우팅용) */
export const TOPIC_TO_SUBJECT: Record<TopicKey, SubjectKey> = (() => {
  const m = {} as Record<TopicKey, SubjectKey>;
  (Object.keys(TOPICS_BY_SUBJECT) as SubjectKey[]).forEach((s) => {
    for (const t of TOPICS_BY_SUBJECT[s] as TopicKey[]) m[t] = s;
  });
  return m;
})();

/** TopicKey → 한국어 라벨 (UI 표시용 — 필요 시 사용자가 수정) */
export const TOPIC_LABEL: Record<TopicKey, string> = {
  // digital_logic
  kmap_sop: "카르노맵 SOP",
  kmap_pos: "카르노맵 POS",
  combinational_gate: "조합 논리 게이트",
  flipflop_counter: "플립플롭·카운터",
  fsm: "유한 상태 기계 (FSM)",
  sequence_detector: "시퀀스 검출기 (D-FF + 상태도)",
  waveform_analysis: "파형 분석",
  // electronics
  opamp: "OPAMP",
  bjt_bias: "BJT 바이어스",
  bjt_amplifier: "BJT 증폭기",
  mosfet_bias: "MOSFET 바이어스",
  mosfet_amplifier: "MOSFET 증폭기",
  diode: "다이오드",
  mixed_signal: "혼합 신호",
  // circuit_theory
  dc_resistive: "직류 저항 회로",
  mesh_analysis: "메시 해석",
  nodal_analysis: "노드 해석",
  transient_rc: "RC 과도응답",
  transient_rl: "RL 과도응답",
  rlc_response: "RLC 응답",
  supermesh: "슈퍼메시",
  supernode: "슈퍼노드",
  dependent_source: "종속 전원",
  switching_circuit: "스위칭 회로",
  // mixed_signal
  counter_dac_comparator: "카운터 + DAC + 비교기 (임용 8번)",
  adc_sample_hold: "샘플홀드 + ADC",
  logic_opamp_hybrid: "디지털·아날로그 혼합",
  // electromagnetics
  electrostatics: "정전계 (전계·전위·쿨롱)",
  gauss_law: "가우스 법칙",
  capacitance: "정전용량·에너지",
  magnetostatics: "정자계 (자기장·앙페르)",
  em_induction: "전자기 유도",
  magnetic_force: "자기력",
  em_wave: "전자기파",
  current_conduction: "정상 전류·저항 (도전율)",
  // c_language
  c_output_prediction: "코드 출력 예측",
  c_pointer_array: "포인터·배열",
  c_control_flow: "제어문·반복문",
  c_function_recursion: "함수·재귀",
  c_struct_bitwise: "구조체·비트연산",
  c_string: "문자열 처리",
  // communications
  comm_analog_modulation: "아날로그 변조 (AM·FM·PM)",
  comm_digital_modulation: "디지털 변조 (ASK·FSK·PSK·QAM)",
  comm_sampling_pcm: "표본화·양자화·PCM",
  comm_information_theory: "정보이론 (엔트로피·채널용량)",
  comm_signal_spectrum: "신호·스펙트럼",
  comm_noise_snr: "잡음·SNR",
  // pedagogy (교육학·교직)
  ped_psychology: "교육심리 (학습·발달·동기)",
  ped_curriculum: "교육과정",
  ped_evaluation: "교육평가",
  ped_method_tech: "교육방법·공학",
  ped_administration: "교육행정",
  ped_sociology: "교육사회학",
  ped_philosophy_history: "교육철학·교육사",
  ped_counseling: "생활지도·상담",
};

// =====================================================================
// SemanticStructure — 핵심 코어 (문제의 의미 구조 4-flag 분류)
// =====================================================================

/**
 * 문제의 의미 구조를 4개 boolean으로 분류한다.
 * SubjectKey·TopicKey와 직교(orthogonal)하며, 생성·검증 파이프라인의 분기 키로 사용된다.
 */
export type SemanticStructure = {
  /** 상태 천이가 있는가 (FSM·플립플롭·카운터·순차논리) */
  hasStateTransition: boolean;
  /** 등가회로 변환이 필요한가 (테브난·노턴·소스변환·임피던스 합성) */
  hasEquivalentTransformation: boolean;
  /** 시간에 따른 파형 진화가 있는가 (RC/RL 과도응답·스위칭·타이밍도) */
  hasWaveformEvolution: boolean;
  /** 회로도 외 추가 그림이 필요한가 (파형도·카르노맵·상태천이도 등) */
  requiresMultiFigure: boolean;
};

// =====================================================================
// Generation 모드 — 두 가지 정책
// =====================================================================

/** 문제 생성 모드 */
export type GenerationMode = "exam_similar" | "exam_variant" | "gpt_generated";

/** 모드 한국어 라벨 */
export const GENERATION_MODE_LABEL: Record<GenerationMode, string> = {
  exam_similar: "기출유사유형",
  exam_variant: "기출변형유형",
  gpt_generated: "GPT생성유형",
};

/** 모드별 정책 객체 */
export type GenerationPolicy = {
  mode: GenerationMode;
  preserveTopology: boolean;
  allowComponentChange: boolean;
  allowValueChange: boolean;
  description: string;
};

export const GENERATION_POLICIES: Record<GenerationMode, GenerationPolicy> = {
  exam_similar: {
    mode: "exam_similar",
    preserveTopology: true,
    allowComponentChange: false,
    allowValueChange: true,
    description: "회로·문항 모두 동일, 소자 수치만 변경",
  },
  exam_variant: {
    mode: "exam_variant",
    preserveTopology: true,
    allowComponentChange: true,
    allowValueChange: true,
    description: "구조·원리 동일, 수치 + 소자 종류 1~2개 변형 가능",
  },
  gpt_generated: {
    mode: "gpt_generated",
    preserveTopology: false,
    allowComponentChange: true,
    allowValueChange: true,
    description: "같은 주제로 GPT가 자유롭게 새 문제 생성 (구조 달라도 됨)",
  },
};

// =====================================================================
// API 응답 타입
// =====================================================================

/** /api/analyze 응답 */
export type AnalysisResult = {
  topic: string;
  interpretation: string;
  relatedConcepts: string[];
  fillInTheBlanks: FillInTheBlank[];
  /** 추후 분류기 도입 시 함께 반환 (현재는 옵셔널) */
  semantic?: SemanticStructure;
  /** 추후 분류기 도입 시 함께 반환 (현재는 옵셔널) */
  topicKey?: TopicKey;
  /** SubjectKey 그대로 — 분석에서 재확정 (옵셔널, 신규) */
  subjectKey?: string;
  /** TopicKey와 동의 (옵셔널, 신규) */
  family?: string;
  /** 원본의 입출력 신호/변수 */
  signals?: {
    inputs: string[];
    outputs: string[];
    /**
     * 중간 신호 — 게이트 사이의 wire (입력도 출력도 아닌 것).
     *   예) 임용 8번: f_1, f_2, f_3, f_4 (각 K-map의 minimized SOP 출력 wire)
     *   여러 stage gate network에서 stage 간 신호 이름.
     *   universal_digital pipeline·renderer가 이 이름으로 K-map figure title·
     *   combination circuit input label을 표시.
     */
    intermediateSignals?: string[];
    /**
     * Multi-stage gate spec — 각 중간/최종 게이트의 op + inputs를 명시.
     *   provided 시 universal_digital pipeline이 이걸로 LogicDAG를 직접 빌드.
     *   미제공 시 binary tree heuristic으로 fallback (모든 stage 같은 op).
     *
     *   id: X, Y, Z 등 게이트 출력 wire 이름. 마지막 entry가 최종 출력 (outputId).
     *   op: 게이트 종류 (AND/OR/XOR/NAND/NOR/XNOR/NOT — stage별 다르게 가능).
     *   inputs: function id (f1, f2, ...) 또는 이전 stage id (X, Y).
     *
     *   예 (임용 8번 multi-stage):
     *     [
     *       { id:"X", op:"AND", inputs:["f1","f2"] },
     *       { id:"Y", op:"OR",  inputs:["f3","f4"] },
     *       { id:"Z", op:"XOR", inputs:["X","Y"]   }
     *     ]
     *
     *   ★ 절대 금지: f1·f2·f3·f4를 하나의 OR 게이트에 직접 연결한 단일 entry
     *   ([{ id:"Z", op:"OR", inputs:["f1","f2","f3","f4"] }]) — multi-stage 손실.
     */
    intermediateGates?: Array<{
      id: string;
      op: "AND" | "OR" | "XOR" | "NAND" | "NOR" | "XNOR" | "NOT";
      inputs: string[];
    }>;
  };
  /** 원본 분석에서 결정된 figure 요구사항 — generate·validator가 그대로 강제 */
  figureRequirements?: FigureRequirement[];
  /**
   * 원본 회로 구조 시그니처 — exam_similar(=exam_mutation)일 때 정확히 일치 강제.
   * exam_variant(=new_problem)일 때는 ±1 허용 / family 보존만.
   */
  structureSignature?: StructureSignature | LogicStructureSignature;
  /**
   * 원본 회로의 위상 시그니처 — branches 단위(직렬 chain)로 capture.
   * exam_similar 모드에서 정확 보존 강제 (validateTopologyPreserved).
   */
  topologySignature?: TopologySignature;
  /**
   * TopologySignature에서 derive된 envelope.
   * exam_variant 모드에서 범위 안에서 자유 변형 허용 (validateStructuralEnvelope).
   */
  structuralEnvelope?: StructuralEnvelope;
  /**
   * 별도 vision 호출로 추출한 component inventory (analyze branches와 독립적 source of truth).
   * type별 개수 floor를 generate에 강제 — analyze branches가 일부 component를 놓쳐도
   * inventory가 잡은 개수만큼은 반드시 생성되도록.
   * pins: Connectivity Detection — 각 component 양 끝 노드 라벨 (검수·편집 게이트에서 편집 가능).
   */
  componentInventory?: Array<{
    id: string;
    type: string;
    value?: string;
    pins?: string[];
    /** 종속 전원의 제어 대상 소자 id (전류 제어면 제어 전류가 흐르는 저항 id). */
    control?: string;
  }>;
  /**
   * Canonical Graph 자체-일관성 검증 결과 — /api/analyze·/api/recover-topology가 첨부.
   * 검수·편집 게이트 UI가 confidence·경고 표시에 사용.
   */
  graphValidation?: {
    ok: boolean;
    confidence: number;
    errors: string[];
    warnings: string[];
    floatingNodes: string[];
  };
  /**
   * motif·objective 기반 자동 생성 tags — /api/analyze·/api/recover-topology가 첨부.
   */
  tags?: string[];
  /**
   * topology 복원 전략·신뢰도 — /api/recover-topology가 첨부 (검수·편집 게이트 표시용).
   */
  topologyRecovery?: {
    strategy: string;
    confidence: number;
  };
  /**
   * 회로 archetype 분류 — netlist generator가 분기 키로 사용.
   * lib/analysis/classifyCircuitType.ts가 다른 분석 필드에서 derive (추가 GPT 호출 없음).
   */
  circuitType?: import("./circuitType").CircuitTypeClassification;
  /**
   * 원본의 단자 라벨 (a/b/x/y 등) — Thevenin·등가회로 문제의 측정점.
   * analyzeImage가 명시 추출, topology-driven generator가 netlist.nodeAnnotations로 emit.
   */
  nodeAnnotations?: NodeAnnotation[];
  /**
   * 원본의 부하 placeholder (R_L 등 학생-채움 자리).
   * analyzeImage가 점선 박스로 표시된 부하를 추출, generator가 netlist.loadPlaceholders로 emit.
   */
  loadPlaceholders?: LoadPlaceholder[];
};

export type FillInTheBlank = {
  sentence: string;
  answer: string;
};

/** /api/generate 응답의 단일 문제 */
export type GeneratedProblem = {
  id: string;
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
  /** validator의 family 검사·라우팅용 */
  topicKey?: TopicKey;
  /** SemanticStructure 분류 결과 */
  semantic?: SemanticStructure;
  /** 회로·다이어그램 figure 셋 (renderer가 SVG로 변환) — 문제 본문 영역 */
  figureVariants?: FigureVariant[];
  /** 정답·풀이 영역에 표시할 figure (예: 채워진 파형, 답안용 회로) — 문제 영역에는 표시되지 않음 */
  solutionFigures?: FigureVariant[];
};

// =====================================================================
// Figure Variants — 단일 통합 shape. dispatch는 diagramType으로.
// GPT는 절대 SVG/circuitikz 직접 출력 금지 — 모두 diagram(JSON) 형태.
// =====================================================================

/** 7가지 시각 표현 타입 — diagramType별 전용 renderer로 dispatch */
export type DiagramType =
  | "analog_netlist"
  | "analog_mesh_network"
  | "logic_network"
  | "kmap"
  | "waveform"
  | "truth_table"
  | "concept_diagram"
  | "block_diagram"
  | "mixed_circuit"
  | "characteristic_curve"
  | "mux_diagram"
  | "imyong_10_dc_nodal"     // archetype-specific fixed-slot renderer
  | "mux_gar_circuit"
  | "rlc_resonance_max_power_circuit"
  | "sequence_block"         // 시퀀스 검출기 (가) 블록도
  | "sequence_state_diagram" // 시퀀스 검출기 (나) 상태 전이도 + 빈칸 ㉠㉡㉢㉣
  | "sequence_state_table"   // 시퀀스 검출기 (다) 상태표 + 빈칸 + don't care
  | "thevenin_original_circuit"   // 임용 9번 정보과 (가) 원본 RC + SW + 점선박스
  | "thevenin_equivalent_circuit" // 임용 9번 정보과 (나) Thevenin 등가 회로
  | "opamp_cascade"               // 임용 10번 2-OPAMP cascade 회로
  | "sr_ff_mux_sequential_circuit" // 임용 10번 정보과 — SR-FF 2개 + 2×1 MUX 4개 순차회로 구현 (다)
  | "ac_dc_superposition_rc_circuit" // 임용 12번 회로이론 — AC+DC 중첩 RC 회로 (고정 슬롯)
  | "ac_dc_superposition_rc_dual_circuit" // 위의 쌍대 — RL + 전류원 (기출변형유형)
  | "vi_thevenin_maxpower_circuit" // 임용 5번 — 2전압원+2전류원 테브난+최대전력 (고정 슬롯)
  | "flash_adc_2bit_circuit" // 임용 6번 — 2비트 플래시 ADC (저항사다리+비교기+인코더, 복합형)
  | "zener_bjt_regulator_circuit" // 임용 8번 — 제너+BJT 전압 레귤레이터 (고정 슬롯)
  | "bjt_two_stage_switched_circuit" // 임용 10번 — SW + 상보형 2단 BJT (NPN Q1 + PNP Q2)
  | "opamp_two_input_cascade" // 임용 5번 (가) — 2입력 2-OPAMP 캐스케이드
  | "opamp_two_input_diff"    // 임용 5번 (나) — 차동증폭기 (R₁·R₂ 설계)
  | "dff_mux_sequential_circuit" // 임용 8번 (나) — D-FF/T-FF 2개 + 2×1 MUX 2개 (세로 스택)
  | "ff_mixed_app_circuit"    // 임용 9번 (가) — T-FF(위) + JK-FF(아래) 세로 스택 + 조합부 (고정 슬롯)
  | "opamp_series_regulator_circuit" // 임용 30번 — OPAMP(오차증폭기) 직렬형 정전압 안정화 회로 (고정 슬롯)
  | "active_lowpass_filter_circuit" // 임용 31번 — 1차 능동 저역통과 필터 (v_i·R·C·OPAMP 버퍼, 고정 슬롯)
  | "opamp_summer_circuit" // 아날로그 시스템 설계 — 2-OPAMP 가산기(반전가산기→반전증폭, 모든 R 동일, 고정 슬롯)
  | "async_preset_counter_circuit" // 비동기 SET/RESET D-FF 응용회로 (가) — NOR(F) 적재 + 리플 T-FF (고정 슬롯)
  | "rlc_resonance_bandwidth_circuit" // 직렬 RLC 공진+대역폭 (임용 11번) — R–[C₁∥C₂]–L + 단자 a·b (고정 슬롯)
  | "rlc_resonance_bandwidth_dual_circuit" // 위의 쌍대(기출변형) — 병렬 RLC(전류원∥R_d∥[L₁+L₂]∥C_d), I_ab 측정
  | "opamp_two_stage_circuit" // 2단 OPAMP (1단 비반전 → 2단 반전), V_P·V_i·V_o (임용 2번)
  | "opamp_three_stage_sum_circuit" // 3-OPAMP: 반전증폭(V_x)+버퍼+반전가산(R_f 도출) (임용 2번 전자)
  | "opamp_finite_gain_circuit" // 연산증폭기 유한 개방루프 이득 (가) — V_in─R₁─V⁻─R₂─V_out, V⁺=GND (임용 11번)
  | "opamp_finite_gain_offset_circuit" // 유한 이득 OPAMP + 출력단 직렬 오프셋 전압원 V_B (임용 9번 전자회로)
  | "opamp_loop_gain_circuit" // OPAMP 루프이득 L(s)=V_r/V_t — (가) 원 회로 / (나) 루프 절단 회로 (임용 12번 전자회로)
  | "function_generator_circuit" // 비정현파 발진기: 비교기(가)+적분기(나)+R₂·R₃ 피드백 루프 (임용 29번)
  | "ac_bridge_circuit"           // AC 휘트스톤 브리지 (가) — 4-arm + R_L 가교 (임용 7번)
  | "ac_bridge_thevenin_circuit"  // 위의 테브난 등가 (나) — V_TH·Z_TH·R_L
  | "ac_thevenin_ladder_circuit"  // 단일 AC원 L-C-R 사다리 (가) — 직렬-션트-직렬 + 부하 Z_L (임용 7번 회로이론)
  | "ac_thevenin_equiv_circuit"   // 위의 테브난 등가 (나) — V_TH 직렬 Z_TH → 단자 a·b → Z_L
  | "dc_thevenin_2src_circuit"    // 2전압원 병렬가지 (가) — R1+V1 ∥ R2+V2, 단자 a·b (임용 3번 회로이론)
  | "demux_circuit"              // 1→4 디멀티플렉서 조합논리회로 (임용 8번 (가))
  | "number_ring_diagram"        // n비트 수 표현 원형(고리) 다이어그램 — 임용 4번 (가)·(나)
  | "mod_n_counter_circuit"      // mod-N 동기식 카운터 (T·D FF + CLR + 검출 게이트 ⓒ) — 임용 9번 (나)
  | "jk_excitation_circuit"      // JK-FF 2개 + 조합논리 ㉲ 블록 + HIGH + CLK (2025 전기 A-8 (나))
  | "ac_superposition_source_design_circuit" // 2전원 페이저 RLC (임용 5번) — R₁·R₂ 상단 + R₃/jX_L/−jX_C 가운데 leg + V_s∠0°/I_s∠−90°
  | "dc_wheatstone_balance_circuit" // DC 휘트스톤 브리지 평형 — V_s+R_s + 다이아몬드 4암(미지 R_x∥R_p) + 브리지 암 + 개방 V_o (임용 3번 회로이론)
  | "inductor_ramp_circuit"      // i(t) 램프 RL 회로 (임용 2번) — V_s+SW+R+L 직렬
  | "dc_thevenin_equiv_circuit"   // 위의 테브난 등가 (나) — V_T 직렬 R_T → 단자 a·b
  | "ac_power_factor_circuit"     // AC 역률보정 — V_s 직렬 R+L + 부하 Z(R∥C) (임용 9번 회로이론)
  | "ac_admittance_resonance_circuit"      // 어드미턴스 공진 (가) — 전압원→병렬[C∥(R+L)], Y_eq=a+jb (임용 7번 회로이론)
  | "ac_admittance_resonance_dual_circuit" // 위의 쌍대(변형) — 전류원→직렬[L+(R∥C)], Z_eq=a+jb, V_M
  | "ac_vccs_phasor_circuit"      // 종속전류원(g·V_c) 2단 구동 페이저 회로 (임용 3번 회로이론) — 좌측망 V_c → 우측망 I_R
  | "switched_rc_dc_circuit"      // t=0 스위치 개방 RC (임용 2번) — V_s+R_s∥I_s ─SW─ C∥R_load
  | "switched_rl_dual_src_circuit" // 2전원 SPDT 스위치 RL 과도 (임용 3번 회로이론) — V_A leg ∥ V_B leg → SPDT(단자A↔B) → 직렬 R+L, i(t)
  | "dff_state_design_circuit"    // D-FF 2개 + 게이트 구현 회로 (임용 9번 정보과 (다))
  | "jk_sync_counter_circuit"     // JK 플립플롭 3개 동기식 카운터 (가) — 전용 fixed-slot (교과서식 깔끔 배치)
  | "jk_state_machine_circuit"    // JK 카운터 (비순환 상태형, 단일신호 J·K 직결) — 전용 fixed-slot
  | "jk_state_machine_variant_circuit" // 위 + 게이트 1개 추가 (변형유형) — 전용 fixed-slot
  | "clean_counter_circuit"       // 범용 카운터(N-FF + 게이트) 버스식 깔끔 렌더 (GPT mod-N 등). diagram=LogicNetworkDiagram
  | "scr_turn_on_circuit"         // SCR 턴온 회로 (가) — +V·R_A·SCR(A/G/K)·게이트(V_G·R_G) 전용 fixed-slot
  | "reactive_vi_integral_circuit" // 이상 인덕터/커패시터 v-i 적분 회로 (가) — 전원 + 단일 소자 루프
  | "jk_state_diagram"            // JK 카운터 상태도 — 사이클 링 배치 + 비순환 상태 바깥 진입 (전용)
  | "supermesh_switched_dependent_circuit" // 스위치 2-state + 종속전류원 + supermesh (임용 8번) — (가)SW개방 / (나)SW단락
  | "vi_line_graph"               // 테브난 V-I 직선 (임용 9번 (나)) — 세로 긴 전용 그래프
  | "em_field_diagram"            // 전자기학 전용 도식 (점전하·선전하·평행판·솔레노이드·운동봉·전자기파 등)
  | "code_block"                  // C언어 전용 — 코드 스니펫 (monospace 블록, 코드 분석·출력 예측)
  | "comm_diagram";               // 통신 전용 — 파형/스펙트럼/블록도 (변조·표본화·정보이론 등)

/**
 * C언어 전용 figure — 코드 스니펫 블록.
 *   GPT가 정확한 C 코드 문자열을 emit, 렌더러가 monospace <pre>로 표시 (줄번호 포함).
 *   회로 아님 — 코드 분석·출력 예측 문제의 지문 코드.
 */
export type CodeBlockDiagram = {
  /** 코드 본문 (개행·들여쓰기 보존) */
  code: string;
  /** 언어 (기본 "c") — syntax hint용, 현재 표시만 */
  language?: string;
  /** 상단 캡션 (예: "다음 프로그램", "[코드]") */
  caption?: string;
};

/**
 * 통신 전용 figure — 파형(시간영역) / 스펙트럼(주파수영역) / 블록도(송수신 시스템).
 *   kind로 dispatch. GPT가 안정적으로 emit하도록 파형은 해석적(analytic) 형태 우선.
 */
export type CommDiagram =
  | {
      kind: "waveform";
      caption?: string;
      xLabel?: string;   // 기본 "t"
      yLabel?: string;   // 기본 진폭
      /** 그릴 시간 범위 (기본 1) — analytic form의 t=0..timeSpan */
      timeSpan?: number;
      signals: Array<{
        name: string;
        /** 파형 형태 — analytic(sine 등)이면 amplitude·freq·phase로 합성, "samples"면 samples 사용 */
        form: "sine" | "cosine" | "square" | "triangle" | "pulse" | "samples";
        amplitude?: number;
        freq?: number;     // 주기 수 (timeSpan 내 사이클 수로 해석)
        phase?: number;    // 라디안
        offset?: number;   // DC offset
        samples?: Array<{ t: number; v: number }>;
      }>;
    }
  | {
      kind: "spectrum";
      caption?: string;
      xLabel?: string;   // 기본 "f [Hz]"
      yLabel?: string;   // 기본 "amplitude"
      /** 주파수 성분(임펄스/막대) — stem plot */
      lines: Array<{ freq: number; amplitude: number; label?: string }>;
    }
  | {
      kind: "block";
      caption?: string;
      /** 좌→우 신호 흐름 블록 (변조기·채널·복조기 등) */
      blocks: Array<{ id: string; label: string }>;
      edges: Array<{ from: string; to: string; label?: string }>;
    };

/**
 * 임용 8번 회로이론 (스위치 2-state + 종속전류원 + supermesh) 전용 figure.
 *   고정 토폴로지 (4 세로가지 + 3 상단 R, mesh 3개):
 *     ①V_s ─R1─ ②[0.2·V₂ 종속전류원] ─R2─ ③[SW─R4─I_s 직렬] ─R3─ ④wire, 모두 GND 복귀.
 *   swState로 (가)SW개방 / (나)SW단락 두 figure를 같은 슬롯에서 그린다.
 */
export type SupermeshSwitchedDependentCircuitDiagram = {
  swState: "open" | "closed";
  /** 좌측 독립 전압원 라벨 (e.g. "10V") */
  vsLabel: string;
  /** 상단 직렬 저항 3개 (R1: V_s↔V₁, R2: V₁↔V₂, R3: V₂↔우외곽) */
  r1Label: string;
  r2Label: string;
  r3Label: string;
  /** 스위치 가지 직렬 저항 (SW 아래) */
  r4Label: string;
  /** 종속전류원 라벨 (e.g. "0.2V₂") — V₁ 세로가지, 위 화살표(주입) */
  depLabel: string;
  /** 스위치 가지 전류원 라벨 (e.g. "1A") — SW·R4 아래, 위 화살표 */
  isLabel: string;
  /** 노드 전압 라벨 (상단) */
  v1Label: string; // "V₁"
  v2Label: string; // "V₂"
  /** supermesh 점선 표시 여부 (나=closed일 때 true) */
  showSupermesh?: boolean;
};

/**
 * 임용 7번 (RLC 공진 + 5R Wheatstone 등가 + R_L 최대전력) 전용 figure.
 *   고정 구조: v(t) AC + dashed box 안 5R bridge + C(학생 도출) + R_L(학생 도출) + L 직렬.
 *   값은 5R + L + ω_0 + V_peak만 외부 결정, 나머지는 renderer 고정.
 */
export type RlcResonanceMaxPowerCircuitDiagram = {
  /** Wheatstone 5저항 라벨 — [R1(top-left), R2(top-right), R3(bot-left), R4(bot-right), R5(middle)] */
  Rlabels: [string, string, string, string, string];
  /** L 라벨 (e.g. "100mH") */
  Llabel: string;
  /** AC source 라벨 (e.g. "v(t) = 5sin(ω₀t)V") */
  vSourceLabel: string;
  /** 공진주파수 라벨 (선택, 박스 상단에 보조 표시) */
  omega0Label?: string;
};

/**
 * 임용 5번 (가) 전용 figure — 3 NOTs + 3 ORs + 1 AND 고정 layout.
 *
 *   factors: 3개 OR factor, 각 2-literal. literal은 {var:"A"|"B"|"C", neg:boolean}.
 *   renderer는 6개 literal bus(A·A̅·B·B̅·C·C̅)를 항상 그리고, factor에 따라 wire tap을 결정.
 */
export type MuxGarCircuitDiagram = {
  factors: Array<[
    { variable: "A" | "B" | "C"; negated: boolean },
    { variable: "A" | "B" | "C"; negated: boolean },
  ]>;
};

/**
 * 4×1 (또는 일반 N×1) MUX 표준 figure — 임용 5번 (나) 형식.
 *
 *   선택선 S_high·S_low (예: S_1=A, S_0=B)에 따라 4개 데이터 입력 I_0~I_3 중 하나를 F로 출력.
 *   각 데이터 입력은 다음 중 하나:
 *     "0" | "1" | 단일 변수 ("C") | 보수 ("C̄") | 변수 ("A" 등) | 학생이 채울 빈칸(blankMarker)
 *   학생 학습 의도: F(A,B,C) 진리표 → 선택선 입력값 (A,B)에 대해 C가 어떻게 mux input에 매핑되는지 결정.
 */
export type MuxDiagram = {
  /** MUX 차수 (현재 4만 지원, 향후 8 확장 가능) */
  size: 4;
  /** 선택선 라벨 — high 비트 (예: S_1 ← A), low 비트 (예: S_0 ← B) */
  selectors: {
    high: { pinLabel: string; signal: string };
    low: { pinLabel: string; signal: string };
  };
  /** 데이터 입력 4개 — slot=0이 I_0 (S=00), slot=3이 I_3 (S=11). */
  inputs: Array<{
    slot: 0 | 1 | 2 | 3;
    /** 핀 라벨 (예: "I_0") — 표시용 */
    pinLabel: string;
    /** 입력 신호 또는 정수 값. blank=true면 학생이 채울 빈칸으로 무시. */
    value: string;
    /** true이면 ㉠/㉡ 같은 marker를 핀 외쪽에 표시 + value는 정답 (renderer는 가림). */
    blank?: boolean;
    /** blank=true일 때 표시할 marker (예: "㉠"). */
    blankMarker?: string;
  }>;
  /** 출력 핀 라벨 (기본 "F") */
  outputLabel?: string;
  /** MUX 상단 캡션 (기본 "4×1 MUX") */
  caption?: string;
};

/**
 * BJT/MOSFET 출력특성곡선 — 한 가족(family)의 다중 곡선(I_B 또는 V_GS 값별)을 동일 평면에 도시.
 * 학습 의도: 동작 영역(포화/활성/차단 또는 triode/saturation/cutoff)을 ㉠·㉡ 같은 marker로
 *           가리키고 학생이 영역명·ON/OFF 동작을 식별.
 *
 *   x축: V_CE (BJT) / V_DS (MOSFET) — 0~xMax
 *   y축: I_C (BJT) / I_D (MOSFET) — 0~yMax
 *   curves[i]: 동일 I_B 또는 V_GS에 대한 V_x vs I_y 곡선 — 초입에서 가파른 ohmic, knee 이후 평탄.
 *   regions: 두 개 이상의 동작 영역 음영 + 한국어 marker(㉠/㉡/㉢ 등)
 */
export type CharacteristicCurveDiagram = {
  /** "bjt" | "mosfet" — 축/곡선 라벨 자동 결정 */
  device: "bjt" | "mosfet";
  /** 다중 곡선 — 위에서 아래로 (I_B 큰 → 작은) 정렬 권장 */
  curves: Array<{
    /** 곡선 라벨 (예: "I_B6", "I_B=0", "V_GS5") */
    label: string;
    /** 평탄 영역에서 도달하는 y값 (활성/포화 영역의 I_C/I_D) — 0~1 정규화 */
    plateau: number;
    /** ohmic→knee 전환 V_x — 0~1 정규화 (xMax 대비 비율). 기본 0.1 권장. */
    knee?: number;
  }>;
  /** 동작 영역 marker — 회로 동작 영역에 라벨 + 음영 */
  regions: Array<{
    /** marker symbol ("㉠", "㉡", "㉢" 등) */
    marker: string;
    /** 영역 종류 — BJT: saturation(포화)/active(활성)/cutoff(차단), MOSFET: triode/saturation/cutoff */
    region: "saturation" | "active" | "cutoff" | "triode";
  }>;
  /** x축 표기 customize — 미지정 시 device 기본값 (BJT: V_CE, MOSFET: V_DS) */
  xLabel?: string;
  /** y축 표기 customize — 미지정 시 device 기본값 (BJT: I_C, MOSFET: I_D) */
  yLabel?: string;
  /**
   * ★ 포화 시작점(핀치오프) 궤적 — 각 곡선의 knee 지점을 잇는 **점선**.
   *   임용 6번(MOSFET 해석 절차형)의 정의적 요소: V_DS = V_GS − V_T 경계선.
   *   region 음영과 무관하게 그려지며, marker는 이 궤적 위에 단독으로 찍힌다.
   */
  pinchOffLocus?: {
    /** 궤적 위에 찍을 단일 marker ("㉠" 등). 없으면 궤적만 그린다. */
    marker?: string;
    /** marker를 찍을 위치 — 궤적을 아래에서 위로 0~1로 파라미터화 (기본 0.82 = 위쪽) */
    markerAt?: number;
    /** 궤적 옆 주석 (예: "V_DS = V_GS − V_T") */
    note?: string;
  };
};

/**
 * 원본 회로 구조의 시그니처. exam_similar는 정확히 일치 강제, exam_variant는 ±1 허용.
 */
/**
 * Universal structure signature — 모든 과목·도메인의 핵심 구조를 담는 불변 spec.
 * Analyze가 추출, Generate가 prompt로 전달, Validator가 검사하여 retry 트리거.
 */
export type StructureSignature = {
  subjectKey: "digital_logic" | "circuit_theory" | "electronics";
  family: string;
  signals?: {
    inputs: string[];
    outputs: string[];
    intermediateSignals?: string[];   // 게이트 사이 wire (예: f_1, f_2, f_3, f_4)
    /** Multi-stage gate spec (AnalysisResult.signals.intermediateGates와 동일 shape). */
    intermediateGates?: Array<{
      id: string;
      op: "AND" | "OR" | "XOR" | "NAND" | "NOR" | "XNOR" | "NOT";
      inputs: string[];
    }>;
  };
  figureRequirements: {
    role: string;
    diagramType: string;
    scope: "single" | "combined" | "per_output" | "per_state";
    targets?: string[];
    states?: string[];
    overlays?: string[];
    required: boolean;
  }[];
  componentCounts?: Record<string, number>;
  gateCounts?: Record<string, number>;
  requiredFeatures: {
    hasSwitch?: boolean;
    hasDependentSource?: boolean;
    hasSupermesh?: boolean;
    hasKmap?: boolean;
    hasWaveform?: boolean;
    hasBlankGate?: boolean;
    hasMesh?: boolean;
    hasStateTransition?: boolean;
  };
  topologyHints?: {
    meshCount?: number;
    nodeCount?: number;
    branchCount?: number;
    outputCount?: number;
    inputCount?: number;
  };
  /** Legacy: 기존 LogicStructureSignature·analog count 필드 (점진적 마이그레이션) */
  inputCount?: number;
  outputCount?: number;
  figureCount?: number;
  totalComponentCount?: number;
  totalGateCount?: number;
  topologyEdges?: { from: string; to: string; via: string; type: string }[];
  requiredRoles?: string[];
  blankCount?: number;
};

/**
 * Branch role enum — TopologySignature에서 각 branch가 회로 안에서 차지하는 역할.
 * analyze가 이 enum 중 하나를 골라 GPT에게 추출시키고, validator는 generated 회로에서 같은 분포가 나오는지 검사.
 */
export type BranchRole =
  | "voltage_source_leg"           // V source가 포함된 vertical leg
  | "current_source_leg"           // I source가 포함된 vertical leg
  | "dependent_source_leg"         // VCCS/VCVS/CCCS/CCVS가 포함된 leg
  | "switching_leg"                // SW가 포함된 leg
  | "load_leg"                     // 부하 R 등이 ground로 떨어지는 leg
  | "shared_supermesh_branch"      // supermesh의 두 mesh가 공유하는 branch
  | "mesh_only_branch"             // 단일 mesh 안에만 속하는 일반 branch
  | "top_rail_resistor"            // top rail 위 horizontal R
  | "bottom_rail_wire";            // ground rail (보통 단일 wire)

/**
 * Grid edge 좌표 — planar cell(face) 기반 모델의 핵심.
 *   회로를 (rows × cols) cell 격자로 보고 각 branch가 어느 edge에 위치하는지 표현.
 *   type="horizontal": (row, col) — row는 0..gridRows, col은 0..gridCols-1
 *   type="vertical":   (row, col) — row는 0..gridRows-1, col은 0..gridCols
 *   같은 (type, row, col)을 가진 branch는 평행 가지 (parallel).
 */
export type GridEdge = {
  type: "horizontal" | "vertical";
  row: number;
  col: number;
};

/**
 * Cell 기반 회로 표현 — planar face가 1급 객체.
 *   각 cell은 4 edge(top/bottom/left/right)로 둘러싸인 닫힌 영역 = 1 mesh.
 *   인접 cell은 edge를 SHARE한다 (같은 edgeId 참조).
 *
 *   예 — 2×2 cells:
 *     TL.right === TR.left
 *     TL.bottom === BL.top
 *     TR.bottom === BR.top
 *     BL.right === BR.left
 *
 *   한 edge에 element가 여러 개면 평행 가지(parallel).
 *   element가 비어있으면 wire only.
 */
export type CellEdge = {
  id: string;                       // 같은 id는 같은 edge (share).
  orientation: "horizontal" | "vertical";
  elements: Array<{
    type: string;                   // R / V / I / L / C / SW / wire
    value?: string | number;
    componentId?: string;           // CircuitNetlist component 참조
  }>;
};

export type Cell = {
  id: string;                       // e.g., "TL", "TR", "BL", "BR" or `c_${row}_${col}`
  row: number;                      // 0..gridRows-1
  col: number;                      // 0..gridCols-1
  top?: CellEdge;
  bottom?: CellEdge;
  left?: CellEdge;
  right?: CellEdge;
};

export type GridCircuit = {
  gridShape: { rows: number; cols: number };  // cell 개수
  cells: Cell[];
  /** edge id로 빠르게 조회. cells의 top/bottom/left/right와 같은 객체 reference. */
  edges: Record<string, CellEdge>;
};

/**
 * 회로 위상 시그니처 — analyze가 추출.
 * branches는 abstract leg/branch 단위로 capture (각 leg = 직렬 component chain).
 */
export type TopologySignature = {
  subjectKey: string;
  family: string;
  features: {
    hasSwitch?: boolean;
    hasDependentSource?: boolean;
    hasGround?: boolean;
    hasSupermesh?: boolean;
    hasMesh?: boolean;
    hasStateTransition?: boolean;
    meshCount?: number;
  };
  branches: Array<{
    role: BranchRole | string;
    components: Array<{
      type: string;
      value?: string | number;
    }>;
    /**
     * (선택) 명시적 노드 쌍 — 평행 branch와 비-순차 토폴로지에 사용.
     *   미지정 시 branches 순서대로 자동 배치 (legacy).
     *   같은 [a, b] 쌍에 여러 branch가 있으면 parallel로 처리 (mesh 추가 생성).
     *   예) [["n1","n2"], ["n1","n2"]] → n1·n2 사이 2개 평행 branch (1 mesh 추가)
     */
    betweenNodes?: [string, string];
  }>;
};

/**
 * 구조 envelope — TopologySignature에서 derive.
 * GPT에게 명시적 의도 전달 + validator의 정량 검사 기준.
 */
export type StructuralEnvelope = {
  subjectKey: string;
  family: string;
  requiredFeatures: {
    hasSwitch?: boolean;
    hasDependentSource?: boolean;
    hasGround?: boolean;
    hasSupermesh?: boolean;
    hasKmap?: boolean;
    hasBlankGate?: boolean;
    hasStateTransition?: boolean;
  };
  countRange: {
    minBranches?: number;
    maxBranches?: number;
    minComponents?: number;
    maxComponents?: number;
    minMeshes?: number;
    maxMeshes?: number;
    minOutputs?: number;
    maxOutputs?: number;
  };
  requiredBranchRoles: string[];
  allowedComponentTypes: string[];
  forbiddenSimplifications: string[];
};

/** Logic network 전용 — SOP/POS 패턴 구조까지 캡처 */
export type LogicStructureSignature = StructureSignature & {
  gateCounts: {
    NOT?: number;
    AND?: number;
    OR?: number;
    NAND?: number;
    NOR?: number;
    XOR?: number;
    XNOR?: number;
  };
  productTermGateCount: number;
  outputCombinerGateCount: number;
  sharedTermCount: number;
};

/**
 * Analyze 단계에서 결정되는 figure 요구사항.
 * 생성·검증 파이프라인이 이 spec을 그대로 강제한다.
 */
export type FigureRequirement = {
  role:
    | "kmap"
    | "truth_table"
    | "implementation_circuit"
    | "waveform"
    | "state_diagram"
    | "equivalent_circuit"
    | "main_circuit";
  diagramType:
    | "kmap"
    | "truth_table"
    | "logic_network"
    | "waveform"
    | "analog_netlist"
    | "concept_diagram";
  /**
   * - per_output: targets의 각 출력당 1개 figure (kmap 2개 등)
   * - combined: targets 전체를 1개 figure로 (1 truth_table에 X,Y 둘 다)
   * - per_state: states의 각 상태당 1개 (state_before/after)
   * - single: 1개만
   */
  scope: "per_output" | "combined" | "per_state" | "single";
  targets?: string[]; // ["X","Y"], ["Q0","Q1"], ["Vo"] 등
  states?: string[];  // ["switch_open","switch_closed"]
  required: boolean;
};

/** 의미적 역할 — UI 라벨링·validator 분류용 (자유 문자열도 허용) */
export type FigureRole =
  | "main_circuit"
  | "original_circuit"
  | "equivalent_circuit"
  | "implementation_circuit"
  | "state_before"
  | "state_after"
  | "kmap"
  | "waveform"
  | "input_waveform"        // 입력 신호 (예: V_s(t) step)
  | "output_waveform"       // 출력 신호 (예: V_c(t) RC 응답)
  | "measurement_waveform"  // 오실로스코프 등 측정 화면
  | "truth_table"
  | "concept_diagram"
  | (string & {});

/**
 * 단일 figure 구조.
 * - id: 문제 내 고유 식별자
 * - label: 캡션 (예: "원본 회로", "t<0 상태")
 * - role: 의미 역할
 * - diagramType: 시각 표현 — renderer dispatch 키
 * - diagram: diagramType별 데이터 (renderer가 해석)
 */
export type FigureVariant = {
  id: string;
  label: string;
  role: FigureRole;
  diagramType: DiagramType;
  diagram: unknown;
};

// 권장 diagram 페이로드 shapes (renderer 내부에서 narrow하여 사용)

// ─── Circuit Netlist (신규 통합 모델) ─────────────────────────────────
// pin마다 side·role을 명시 → renderer가 결정론적으로 배치.
// 같은 node id를 가진 pin은 자동으로 같은 전기적 net으로 연결됨.

export type PinSide = "left" | "right" | "top" | "bottom";

export type PinRole =
  | "input"
  | "output"
  | "control"
  | "positive"
  | "negative"
  | "gate"
  | "drain"
  | "source"
  | "base"
  | "collector"
  | "emitter"
  | "non_inverting"
  | "inverting";

export type ComponentPin = {
  /** component 내 pin 식별자 (예: "p1") */
  id: string;
  /** 연결된 node id (같은 값이면 같은 net) */
  node: string;
  /** symbol 박스의 어느 면에서 나오는 pin인지 */
  side: PinSide;
  /** semantic 역할 (선택) */
  role?: PinRole;
};

export type CircuitComponentType =
  | "R" | "C" | "L"
  | "V" | "I" | "SW"
  | "VCCS" | "VCVS" | "CCCS" | "CCVS"
  | "D" | "BJT" | "MOSFET" | "OPAMP"
  | "GND" | "WIRE";   // WIRE — 0-symbol component (오른쪽 끝 ground return 등 dangling 닫기용)

export type CircuitComponent = {
  id: string;
  type: CircuitComponentType;
  value?: string | number;
  state?: "open" | "closed";
  gain?: string | number;
  control?: string;
  pins: ComponentPin[];
  /**
   * vertical leg chain(SW+R+I 직렬 등)의 일부면 그 leg의 root top node id.
   * renderer가 mid↔mid component(둘 다 non-ground)를 horizontal로 오분류하지 않고
   * legRoot 아래 vertical chain으로 그리도록.
   */
  legRoot?: string;
};

/**
 * Planar CircuitGraph — 회로의 위상 구조를 명시적으로 표현.
 *   "outline은 참고용, 진짜 기준은 node·branch·face"라는 원칙.
 *
 *   nodes:    좌표를 가진 노드 (junction/terminal/ground/label)
 *   branches: 두 노드를 잇는 element (wire 또는 회로 소자)
 *             — 소자가 있는 선분은 wire가 아니다.
 *   faces:    planar embedding에서 계산된 face. role="mesh"가 내부 mesh, "outer"가 unbounded face.
 */
export type GraphNode = {
  id: string;
  x: number;
  y: number;
  kind: "junction" | "terminal" | "ground" | "label";
};

export type GraphBranch = {
  id: string;
  from: string;
  to: string;
  element: "wire" | "R" | "C" | "L" | "V" | "I" | "diode" | "opamp" | "switch";
  value?: string;
  orientation: "horizontal" | "vertical";
  row?: number;
  col?: number;
  /** 원본 component id (있을 때) — renderer가 component metadata 재참조. */
  componentId?: string;
  /**
   * Planar embedding 방향 정보 — branch를 from→to로 walk할 때 좌·우에 인접한 face id.
   * 외부(outer) face가 한쪽이면 그쪽이 "outer" 또는 null. cell-grid 격자에서 자동 채워짐.
   */
  leftFace?: string;
  rightFace?: string;
};

export type GraphFace = {
  id: string;
  /** boundary branch id 목록 (cycle 순서). */
  boundary: string[];
  role?: "mesh" | "outer";
};

export type CircuitGraph = {
  nodes: GraphNode[];
  branches: GraphBranch[];
  faces: GraphFace[];
};

/**
 * node에 붙는 라벨/마커.
 *  - "terminal_dot": ●a / ●b 같은 단자 표시 (Thevenin 등)
 *  - "label_only":   라벨 텍스트만 (예: V1 노드 이름)
 *  - "voltage_arrow": V_ab 같은 두 노드 간 전압 측정 (이건 NodeAnnotation 1개로 표현 어려움 — measurementMarks 사용)
 */
export type NodeAnnotation = {
  node: string;
  label: string;
  style?: "terminal_dot" | "label_only";
  /**
   * Semantic role — pattern detector·layout template이 이름 무관하게 노드를
   * 식별할 수 있도록 부여. 가능하면 모든 semantic node에 role 부여.
   *   source_plus    : V/I 소스의 +단자 (예: V_s가 GND 외에 연결되는 top node)
   *   main_unknown   : 주 측정 노드 (가변 R / R_L이 매달린 top node)
   *   right_unknown  : 보조 측정 노드 (고정 load R이 매달린 top node)
   *   ground         : GND
   */
  role?: "source_plus" | "main_unknown" | "right_unknown" | "ground";
};

/** 회로에 비어 있는 위치 — 학생이 채울 부하 (R_L), 빈 가지 등 */
export type LoadPlaceholder = {
  /** 어느 두 node 사이에 그릴지 */
  betweenNodes: [string, string];
  /** 라벨 (예: "R_L") */
  label: string;
  /** 점선 박스로 강조 */
  emphasize?: boolean;
};

/** V_ab, I_x 같은 측정 표시 */
export type MeasurementMark = {
  kind: "voltage" | "current";
  /** 전압이면 두 node, 전류면 component id */
  refs: string[];
  label: string;
};

/** 신규 netlist diagram payload (figure.diagram for diagramType==="netlist") */
export type CircuitNetlist = {
  components: CircuitComponent[];
  ground?: string;  // ground node id (있으면 GND 심볼 부착)
  /** node에 붙는 라벨 (단자 a/b 등) */
  nodeAnnotations?: NodeAnnotation[];
  /** 부하 placeholder (R_L 등 학생이 풀어야 할 자리) */
  loadPlaceholders?: LoadPlaceholder[];
  /** 측정 표시 (V_ab, I_x 등) */
  measurementMarks?: MeasurementMark[];
  /** 노드별 (x,y) hint. generator가 archetype-specific layout을 줄 때 명시 — renderer는 hint가 있으면 우선 사용. */
  positions?: Record<string, { x: number; y: number }>;
  /**
   * archetype tag — renderer가 dispatch에 사용. 예: "WIEN_BRIDGE_OSCILLATOR" → 전용 renderer.
   * generic OPAMP 회로(반전·비반전·summing 등)는 생략.
   */
  archetype?: string;
};

/**
 * 블록도 (signal flow graph) — 임용 11번 (나) 같은 OPAMP 응용 시스템의 블록도 표현.
 *  · nodes: 외부 input/output 단자 또는 summing junction (⊕)
 *  · blocks: gain block (α, β, A(s) 등 — 박스 + 라벨)
 *  · edges: source → target, 화살표 + 부호(+/-)
 *  좌표는 좌측 input부터 우측 output까지 가로 흐름 + 피드백 wire는 박스 아래로 우회.
 */
export type BlockDiagram = {
  nodes: Array<{
    id: string;
    /** "input" (외부 입력 단자) | "output" (외부 출력 단자) | "junction" (합산점 ⊕) */
    kind: "input" | "output" | "junction";
    label?: string; // V_in, V_out, Σ 등
    x?: number;
    y?: number;
  }>;
  blocks: Array<{
    id: string;
    label: string; // "α", "β", "A(s)"
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    /** 블록 모양 — "rect" (사각형, gain block 기본), "triangle" (OPAMP/증폭기 심볼). 미지정시 rect. */
    shape?: "rect" | "triangle";
  }>;
  edges: Array<{
    from: string; // node id 또는 block id
    to: string;   // node id 또는 block id
    /** junction에 진입할 때의 부호 (default "+") */
    sign?: "+" | "-";
    /** route hint — "above"|"below"는 직선 외 우회 방향 (피드백 wire용) */
    routeHint?: "above" | "below" | "direct";
  }>;
};

/**
 * 복합형 회로 — logic part(JK-FF·게이트) + analog part(R·OPAMP) 단일 figure (임용 8번 등).
 *  · logic part: LogicNetworkDiagram의 부분 (gates, inputs, outputs)
 *  · analog part: CircuitNetlist의 부분 (components, ground)
 *  · bridgeNodes: logic의 output이 analog의 외부 입력 핀으로 들어가는 노드명 매핑
 *    (예: logic.Q_A → analog.Q_A_in 핀)
 *  · 단일 viewBox에 좌측(logic) + 우측(analog) + 사이(bridge wire)로 통합 렌더.
 */
export type MixedCircuitDiagram = {
  /** logic part — JK-FF·NOT·AND·OR 등 디지털 게이트와 입출력 */
  logic: LogicNetworkDiagram;
  /** analog part — R·OPAMP·V·I 등 아날로그 컴포넌트 */
  analog: CircuitNetlist;
  /** logic.outputs와 analog의 외부 입력 노드 매핑 (logic_signal → analog_node) */
  bridgeNodes?: Record<string, string>;
};

/** Legacy — 직전 단계의 단순 netlist. CircuitNetlist로 대체. */
export type NetlistDiagram = {
  nodes: string[];
  groundNode?: string;
  components: NetlistComponent[];
  edges: NetlistEdge[];
};

/** schematic diagram payload — 좌표·배선 포함된 schematic (CircuitNetlist 확장) */
export type SchematicDiagram = CircuitNetlist & {
  positions?: Record<string, { x: number; y: number }>;
  wires?: Array<[number, number, number, number]>; // x1,y1,x2,y2
};

/** Karnaugh map cell value — ""는 빈 셀 (학생이 채우는 빈 K-map 템플릿용) */
export type KmapValue = 0 | 1 | "X" | "";

/** K-map diagram 권장 shape (신규 — rowVars/colVars/rows 구조) */
export type KmapDiagram = {
  title?: string;
  variables: string[];   // ["A","B","C"]
  rowVars: string[];     // ["A"]
  colVars: string[];     // ["B","C"]
  rowOrder: string[];    // ["0","1"]
  colOrder: string[];    // ["00","01","11","10"]
  rows: { label: string; values: KmapValue[] }[];
};

// ─── Logic Network ──────────────────────────────────────────────────
/**
 * 조합 게이트 + 플립플롭(state register).
 *  - DFF: 1-input(D) → 1-output(Q), clock edge에 D를 latch. 입력 [D] / 출력 Q.
 *  - TFF: 1-input(T) → 1-output(Q), T=1이면 Q 토글. 입력 [T] / 출력 Q.
 *  - JKFF: 2-input(J,K) → 1-output(Q). J=1,K=0 set / J=0,K=1 reset / J=K=0 hold / J=K=1 toggle.
 *    입력 [J, K] / 출력 Q.
 *  플립플롭은 cycle-breaker state register — renderer/validator는 Q output을 `inputs`와 동등하게
 *  "초기에 produced된 신호"로 취급해 FSM 피드백 루프를 levelize 가능하게 한다.
 */
export type LogicGateType =
  | "NOT" | "AND" | "OR" | "NAND" | "NOR" | "XOR" | "XNOR"
  | "DFF" | "TFF" | "JKFF"
  | "MUX";   // 2×1 multiplexer — inputs=[I0, I1, S], output=F (S=0→F=I0, S=1→F=I1)

export type LogicGate = {
  id: string;
  type: LogicGateType;
  inputs: string[];   // 신호 이름들 (다른 gate.output 또는 diagram.inputs 참조)
  output: string;     // 이 gate가 만들어내는 신호 이름
  shared?: boolean;
  /**
   * FF 전용 — CLK 핀(▷)에 연결할 신호 이름. 지정되면 외부 CLK bus 대신 이 신호의 source에서
   * FF의 ▷ 핀으로 wire가 라우팅된다 (예: 임용 8번처럼 게이트 출력 X가 D-FF CLK 입력인 케이스).
   * 미지정이면 기존 동작: diagram.inputs에 "CLK"가 있으면 그 CLK bus가 모든 FF ▷에 자동 연결.
   */
  clockSignal?: string;
};

/**
 * 학생이 채워야 할 빈칸 게이트 표현.
 *  - symbol: 라벨 (예: "ⓐ", "ⓑ", "ㄱ", "ㄴ")
 *  - gateIds: 빈칸으로 처리할 gate id 목록
 *  - answer: 정답 (학생이 맞춰야 할 값)
 *  - pinIndex: 정의되면 해당 gate의 특정 입력 핀만 빈칸 처리 (예: MUX의 I0 입력).
 *              미정의면 gate 전체를 박스로 치환 (기존 동작).
 */
export type LogicBlank = {
  symbol: string;
  gateIds: string[];
  answer: string;
  pinIndex?: number;
};

/** logic_network diagram payload — analog_netlist와 별개. 신호 그래프. */
export type LogicNetworkDiagram = {
  inputs: string[];   // 외부 입력 신호 (degree 1 OK)
  outputs: string[];  // 외부 출력 신호 (degree 1 OK)
  gates: LogicGate[];
  /** 학생이 풀어야 할 빈칸. gates의 id를 참조. */
  blanks?: LogicBlank[];
  /**
   * 중간 wire 신호 라벨 — { signalName: displayLabel }. 회로 우측 외부 단자로 그려지지 않고
   * 게이트 output 핀 바로 옆에 작은 텍스트로 표시. 학생이 "어느 게이트 출력이 X·Y인지" 식별 가능.
   * (외부 단자가 필요한 신호는 outputs 배열 사용.)
   */
  signalLabels?: Record<string, string>;
  /**
   * 점선 박스 영역 — 회로의 일부 sub-circuit(게이트 묶음)을 점선 사각형으로 감싸 표시.
   * 임용 5번 [단계 3]: 학생이 점선 영역에 들어갈 게이트 종류를 K-map 도출로 도출.
   *  · gateIds: 박스로 감쌀 게이트들 (이 게이트들의 bbox + 여백으로 사각형 산정)
   *  · label: 박스 좌상단 라벨 (예: "㉡")
   */
  dashedRegions?: { gateIds: string[]; label?: string }[];
};

/** truth_table diagram 권장 shape.
 *  단일 출력: outputLabel + rows[i].output (legacy).
 *  다중 출력: outputLabels + rows[i].outputs (상태표·여러 FF 입력/출력 등).
 *  입력 셀도 string 허용 (빈칸 ㄱ/ㄴ/ㄷ 표기용).
 */
export type TruthTableDiagram = {
  variables: string[];
  rows: Array<{
    inputs: (number | string)[];
    /** legacy 단일 출력. outputs가 있으면 무시. */
    output?: number | string;
    /** 다중 출력 컬럼별 값 (outputs.length === outputLabels.length). */
    outputs?: Array<number | string>;
  }>;
  /** 단일 출력 컬럼 라벨 (기본 "F"). outputLabels가 있으면 무시. */
  outputLabel?: string;
  /** 다중 출력 컬럼 라벨 — 상태표 등. */
  outputLabels?: string[];
  /** 입력 컬럼들을 의미 그룹으로 묶을 때 그룹 헤더 (예: "현재 상태" / "입력"). */
  inputGroups?: Array<{ label: string; span: number }>;
  /** 출력 컬럼들을 의미 그룹으로 묶을 때 그룹 헤더 (예: "플립플롭 입력" / "다음 상태"). */
  outputGroups?: Array<{ label: string; span: number }>;
};

/** waveform diagram 권장 shape.
 *  markers: 시간축에 t₁, t₂, t₃ 같은 명시적 기준점 (세로 점선 + 라벨)을 그릴 때 사용.
 *  xAxis / yMarkers: 시간 외 도메인(주파수응답 곡선 등)에 재활용. xAxis.symbol 미지정 시 "t".
 */
export type WaveformDiagram = {
  signals: Array<{
    name: string;
    samples: Array<{ t: number; v: number }>;
    /** 신호 표시 스타일 — "step"이면 디지털 로직(0/1) 사각파. 미지정 시 linear. */
    shape?: "linear" | "step" | "square" | "exponential_rise" | "exponential_decay";
    tau?: number;
    /** true이면 lane(이름+0/1 축)만 그리고 신호 polyline은 생략 — 학생이 채울 빈칸 트랙 */
    blank?: boolean;
    /** blank=true에서 lane v 범위 명시 (samples 없이도 0/1 라벨 표시) */
    vRange?: { min: number; max: number };
  }>;
  unit?: { time?: string; value?: string };
  /** 시간축(또는 일반 x축) 기준점 마커 — 학생이 답해야 할 구간 표시 (예: t₁, t₂, t₃, t₄, f_0). */
  markers?: Array<{ t: number; label: string }>;
  /** x축 표기 customize. 미지정이면 symbol="t", unit은 unit.time 사용. */
  xAxis?: { symbol?: string; unit?: string };
  /** y축에 수평 점선 + 라벨 (예: I_max). 모든 lane 가로지름. lane 안쪽 v좌표. */
  yMarkers?: Array<{ v: number; label: string }>;
};

/**
 * sr_ff_mux_sequential_circuit payload — 임용 10번 정보과 (다) 구현 회로.
 *  SR 플립플롭 2개 + 2×1 MUX 4개. 각 FF 입력(S·R)을 MUX 1개가 구동.
 *  - selectVar: 모든 MUX 공통 선택선 (FF 출력 중 하나). "Q_A" | "Q_B".
 *  - muxes: 위→아래 MUX1..MUX4. muxes[0,1] = 상단 FF, muxes[2,3] = 하단 FF.
 *  - i0/i1: 데이터입력 라벨 (값 "0"/"1"/"Q_B"/"Q_B'" 또는 빈칸 심볼 "㉠"~"㉣").
 *  - blank: 학생이 도출할 빈칸 MUX (i0·i1이 심볼).
 */
export type SrFfMuxSequentialCircuitDiagram = {
  selectVar: "Q_A" | "Q_B";
  muxes: Array<{
    id: string;        // "MUX1".."MUX4"
    label: string;
    target: string;    // "S_A" | "R_A" | "S_B" | "R_B"
    i0: string;
    i1: string;
    blank: boolean;
  }>;
  flipflops: Array<{
    id: string;        // "FF_A" | "FF_B"
    label: string;
    sFrom: string;     // S 입력을 구동하는 MUX id
    rFrom: string;     // R 입력을 구동하는 MUX id
    qLabel: string;    // "Q_A"
    qbarLabel: string; // "Q_A'"
  }>;
};

/**
 * ac_dc_superposition_rc_circuit payload — 임용 12번 회로이론 (가) AC+DC 중첩 RC 회로.
 *  고정 토폴로지: g─v(t)─TL─C─a / a─V_dc─b / a─R_3─c / c─R_4─g / b─R_5─g.
 *  renderer가 고정 슬롯에 배치. 라벨 문자열만 받음.
 */
export type AcDcSuperpositionRcCircuitDiagram = {
  vacLabel: string;   // "v(t) = 10√2 cos5000t [V]"
  vacPhasor: string;  // "10√2∠0° V"
  vdcLabel: string;   // "20V"
  cLabel: string;     // "0.2µF"
  omegaLabel: string; // "5000 rad/s"
  r3Label: string;    // "2kΩ"
  r4Label: string;
  r5Label: string;
  iabLabel: string;   // "i_ab(t)"
  idcLabel: string;   // "I_DC"
};

/**
 * ac_dc_superposition_rc_dual_circuit payload — 임용 12번 RC 회로의 쌍대(RL + 전류원).
 *  V↔I, R↔G(1/R), C↔L, 직렬↔병렬. 전류원 + 병렬 L + 직렬 R₃·R₄ + 병렬 R₅, 전압 측정.
 */
export type AcDcSuperpositionRcDualCircuitDiagram = {
  iacLabel: string;   // "i(t) = 10√2 cos5000t [A]" (또는 mA)
  iacPhasor: string;  // "10√2∠0° A"
  idcLabel: string;   // "20 mA" (DC 전류원)
  lLabel: string;     // "L = 0.2 H"
  omegaLabel: string;
  r3Label: string;
  r4Label: string;
  r5Label: string;
  vabLabel: string;   // "v_ab(t)"
  vdcLabel: string;   // "V_DC"
};

/**
 * vi_thevenin_maxpower_circuit payload — 임용 5번 (2전압원 직렬 + 2전류원 + 2R + R_L).
 *  고정 슬롯: TL─R1─c─R2─a / TL─V1─V2─GND(좌 직렬) / c─[Iup↑∥Idown↓]─GND / a─R_L─b.
 */
export type ViTheveninMaxPowerCircuitDiagram = {
  v1Label: string; v2Label: string;
  r1Label: string; r2Label: string;
  iupLabel: string; idownLabel: string;
};

/**
 * flash_adc_2bit_circuit payload — 임용 6번 (가) 2비트 플래시 ADC.
 *  저항 사다리(V_top + N×R) → 기준전압 → 3 비교기 → 점선 인코더 → Q_1·Q_0.
 */
export type FlashAdc2bitCircuitDiagram = {
  vtopLabel: string;   // "4V"
  rLabel: string;      // "100Ω"
  vinLabel: string;    // "V_in"
  refLabels: string[]; // ["V_c","V_b","V_a"] (위→아래)
  compLabels: string[];// ["C_2","C_1","C_0"]
  outLabels: string[]; // ["Q_1","Q_0"]
};

/**
 * zener_bjt_regulator_circuit payload — 임용 8번 (가) 제너+BJT 전압 레귤레이터.
 *  20V─R1─V_o─(R3∥R4 부하)─GND, V_o 노드에 제너(V_z)+BJT 션트로 V_o=V_z+V_BE 안정화.
 */
/**
 * bjt_two_stage_switched_circuit payload — 임용 10번 SW + 상보형 2단 BJT.
 *  값은 kΩ·V. R5(Q1 컬렉터)·R6(Q2 이미터)는 학생 도출 미지(렌더러가 점선 박스 + "(?)").
 */
export type BjtTwoStageSwitchedCircuitDiagram = {
  Vcc: number;
  R1: number; R2: number; R3: number; R4: number; R5: number; R6: number; R7: number;
};

/** 임용 5번 (가) 2입력 2-OPAMP 캐스케이드 payload. 값 kΩ. */
export type OpampTwoInputCascadeDiagram = { Ri1: number; R0: number; Rf2: number };
/** 임용 5번 (나) 차동증폭기 payload. R₁·R₂는 설계 대상(점선). Rv1 kΩ. */
export type OpampTwoInputDiffDiagram = { Rv1: number };

/** 임용 8번 (나) D-FF/T-FF + 2×1 MUX 자율 순차회로 payload. */
export type DffMuxSequentialCircuitDiagram = {
  ffType: "D" | "T";
  selectVar: "Q_A" | "Q_B";
  muxes: Array<{ id: string; target: string; i0: string; i1: string }>;
  blankSymbols: string[];
};

/** 임용 9번 (가) — T-FF(위) + JK-FF(아래) 세로 스택 + 조합부 구현회로 (전용 고정 슬롯 렌더러). */
export type FfMixedAppGateSpec = {
  /** 조합 게이트 종류. "WIRE"면 단일 신호를 FF 입력으로 직결(게이트 없음). */
  op: "XOR" | "AND" | "OR" | "WIRE";
  /** 입력 신호 표시명 (예: "X", "Q_A", "Q_B'"). */
  inputs: string[];
};
export type FfMixedAppCircuitDiagram = {
  /** 상단 T 플립플롭 입력 T_A 조합식. */
  taGate: FfMixedAppGateSpec;
  /** 하단 JK 플립플롭 입력 J_B 조합식. */
  jbGate: FfMixedAppGateSpec;
  /** 하단 JK 플립플롭 입력 K_B 조합식. */
  kbGate: FfMixedAppGateSpec;
};

export type ZenerBjtRegulatorCircuitDiagram = {
  vinLabel: string; // "20V"
  vzLabel: string;  // "7.3V"
  r1Label: string;  // "120Ω"
  r2Label: string;  // "500Ω"
  r3Label: string;  // "150Ω"
  voLabel: string;  // "V_o"
  ilLabel: string;  // "I_L"
  i1Label: string;  // "I_1"
};

/**
 * opamp_series_regulator_circuit payload — 임용 30번 (가) OPAMP 직렬형 정전압 안정화 회로.
 *  V_DD ── NPN(직렬 패스, C=V_DD·E=V_o) ── V_o.
 *  OPAMP: (+)=제너 기준 V_z, (−)=피드백 분압 탭 M. 출력→베이스(R_s bias).
 *  피드백: V_o─R_a─M─R_b─GND, 부하 R_L: V_o─R_L─GND. V_o=V_z(1+R_a/R_b).
 */
export type OpampSeriesRegulatorCircuitDiagram = {
  vddLabel: string; // "30V"
  vzLabel: string;  // "10V"
  rsLabel: string;  // 베이스 bias 저항 "1kΩ"
  raLabel: string;  // 피드백 상단 (V_o→M) "20kΩ" 또는 "R_a=?" (변형)
  rbLabel: string;  // 피드백 하단 (M→GND) "20kΩ"
  voLabel: string;  // "V_o"
  rlLabel: string;  // 부하 "5kΩ"
  /** 변형(역문제): R_a가 미지(도출 대상) → 점선 강조. */
  raUnknown?: boolean;
};

/**
 * active_lowpass_filter_circuit payload — 임용 31번 (가) 1차 능동 저역통과 필터.
 *  v_i ─ R ─ 마디 P ─ OPAMP(+),  P ─ C ─ GND. OPAMP 비반전 버퍼(R_f 피드백). 출력 v_o.
 *  대역폭 f_c = 1/(2πRC).
 */
export type ActiveLowpassFilterCircuitDiagram = {
  viLabel: string; // "v_i"
  rLabel: string;  // 입력 저항 "50kΩ" (변형에선 "R")
  cLabel: string;  // "C" (또는 "8nF")
  rfLabel: string; // 피드백 "5kΩ"
  voLabel: string; // "v_o"
};

/**
 * opamp_summer_circuit payload — 2-OPAMP 아날로그 가산기 (반전 가산기 → 반전 증폭).
 *  U₁: v₁·v₂ ─R─ (−) ─Rf─ out(v_m=−(v₁+v₂)). U₂: v_m ─R─ (−) ─Rf─ v₀=v₁+v₂. 모든 R 동일.
 */
export type OpampSummerCircuitDiagram = {
  rLabel: string;  // "R" (모든 저항 동일)
  v1Label: string; // "v₁"
  v2Label: string; // "v₂"
  voLabel: string; // "v₀"
  vmLabel: string; // "v_m"
};

/**
 * async_preset_counter_circuit (가) payload — 비동기 SET/RESET D-FF 응용회로.
 *   구조는 고정(N개 D-FF 리플 체인 + 셀별 인버터+AND로 Set=F·I_k·Reset=F·I_k′ + 우측 NOR F).
 *   값(label)만 외부 결정 — bitCount·I 라벨·Q 라벨.
 */
export type AsyncPresetCounterCircuitDiagram = {
  /** FF 개수 (고정 슬롯 렌더러는 3 지원). */
  bitCount: number;
  /** 비동기 적재 입력 라벨 (좌→우, 예: ["I₀","I₁","I₂"]). */
  iLabels: string[];
  /** Q 출력 라벨 (예: ["Q₀","Q₁","Q₂"]). */
  qLabels: string[];
  /** 우측 NOR 게이트 출력 라벨 (예: "F"). */
  norLabel: string;
};

/**
 * rlc_resonance_bandwidth_circuit payload — 직렬 RLC 공진+대역폭 (임용 11번).
 *   고정 토폴로지: v(t) → R → 마디 a → [C₁ ∥ C₂] → 마디 b → L → v(t) 복귀.
 *   값(라벨)만 외부 결정. L은 미지(학생 도출)라 보통 "L" 표기.
 */
export type RlcResonanceBandwidthCircuitDiagram = {
  rLabel: string;   // "5Ω"
  c1Label: string;  // "3.5µF" (마디 a–b 상단)
  c2Label: string;  // "1.5µF" (마디 a–b 하단, C₁과 병렬)
  lLabel: string;   // "L" (미지) 또는 값
  vLabel: string;   // "v(t)=10cos ω₀t"
};

/**
 * rlc_resonance_bandwidth_dual_circuit payload — 위 직렬 RLC의 쌍대(병렬 RLC, 기출변형).
 *   전류원 i(t) ∥ R_d ∥ [L₁ 직렬 L₂] ∥ C_d. I_ab = 인덕터 가지 전류(V_ab의 쌍대).
 */
export type RlcResonanceBandwidthDualCircuitDiagram = {
  iLabel: string;   // "i(t)=10cos ω₀t [mA]"
  rdLabel: string;  // "200kΩ"
  l1Label: string;  // "2.5H"
  l2Label: string;  // "1.5H"
  cdLabel: string;  // "C" (미지)
};

/**
 * opamp_two_stage_circuit payload — 2단 OPAMP (임용 2번 형식).
 *   1단 비반전(V_i→+, Rg1→GND, Rf1 피드백) → V_P → 2단 반전(Rin2, Rf2 피드백, +→GND) → V_o.
 */
export type OpampTwoStageCircuitDiagram = {
  viLabel: string;   // "v_i(t)" / "V_i"
  rg1Label: string;  // 1단 GND측 R
  rf1Label: string;  // 1단 피드백 R
  rin2aLabel: string; // 2단 입력 직렬 R 1 (V_P↔N)
  rin2bLabel: string; // 2단 입력 직렬 R 2 (N↔op2 −)
  rf2Label: string;  // 2단 피드백 R (op2 (−)↔V_o)
  rf3Label: string;  // op2 추가 저항 (V_P↔V_o 직접 연결)
  vpLabel: string;   // "V_P"
  voLabel: string;   // "V_o"
};

/**
 * opamp_finite_gain_circuit payload — 연산증폭기 유한 개방루프 이득 (임용 11번 (가)).
 *   V_in ─ R₁ ─ V⁻(반전입력) ─ R₂ ─ V_out (피드백), V⁺=GND, OPAMP A(s).
 */
export type OpampFiniteGainCircuitDiagram = {
  vinLabel: string;  // "V_in"
  r1Label: string;   // "R₁"
  r2Label: string;   // "R₂"
  voutLabel: string; // "V_out"
  asLabel: string;   // OPAMP 내부 라벨 "A(s)"
};

/**
 * opamp_finite_gain_offset_circuit payload — 유한 이득 OPAMP + 출력단 오프셋 전압원 (임용 9번 전자회로).
 *   접지 ─ R₁ ─ V⁻ ─ OPAMP(−), R₂: V⁻ ↔ 출력 노드(되먹임), v_in → V⁺,
 *   OPAMP 출력 V_D ─ 직렬 전압원 V_B ─ V_out  ⇒  V_out = V_D − V_B.
 */
export type OpampFiniteGainOffsetCircuitDiagram = {
  r1Label: string;   // 반전 단자–접지 R
  r2Label: string;   // 출력–반전 단자 되먹임 R
  vbLabel: string;   // 출력단 직렬 전압원
  vinLabel: string;  // 입력 교류원
  a0Label: string;   // 개루프 이득 A₀
};

/**
 * opamp_loop_gain_circuit payload — OPAMP 루프이득 + 안정도 (임용 12번 전자회로).
 *   (가) variant="original": 분압망(R_a·R_f) + 전원 가지(R_S·V_s) + 귀환 저항 R_p → V_out.
 *   (나) variant="loop_broken": V_s 제거(R_S 접지) + 출력에서 루프 절단 → 연산증폭기 출력 V_r, 귀환망 구동 V_t.
 *   invertingSource=true(기출변형)면 전원+R_S 가지가 반전 단자 쪽으로 교환된다.
 */
export type OpampLoopGainCircuitDiagram = {
  variant: "original" | "loop_broken";
  invertingSource: boolean;
  raLabel: string;    // 분압 단자 ↔ 접지
  rfLabel: string;    // 분압 단자 ↔ 출력
  rpLabel: string;    // 전원 단자 ↔ 출력 (귀환 경로)
  rsLabel: string;    // "R_S"
  asLabel: string;    // "A(s)"
  outLabel: string;   // "V_out" (가) / "V_r" (나)
  sourceLabel?: string; // "V_s" (가)
  driveLabel?: string;  // "V_t" (나)
};

/**
 * function_generator_circuit payload — 비정현파 발진기(함수발생기, 임용 29번).
 *   (가) 비교기(슈미트 트리거): (−)→GND, (+)=R₂(↔(가))·R₃(↔(나)) 분압 → 구형파 출력.
 *   R₁: (가) → (나) 적분기 (−)입력. (나) 적분기: C 피드백, (+)→GND → 삼각파 출력.
 */
export type FunctionGeneratorCircuitDiagram = {
  r1Label: string;   // (가)→(나) 직렬 R (적분기 입력)
  r2Label: string;   // (가)↔(+)분압 R
  r3Label: string;   // (나)↔(+)분압 R (피드백)
  cLabel: string;    // 적분기 피드백 커패시터
  gaLabel: string;   // (가) 출력 라벨 "(가)"
  naLabel: string;   // (나) 출력 라벨 "(나)"
};

/**
 * opamp_three_stage_sum_circuit payload — 3-OPAMP (임용 2번 전자).
 *   1단 반전: V1 ─Rin1─ (−)U1, Rf1 피드백, (+)=GND → V_x.
 *   2단 버퍼: V2 → (+)U2 → V_buf.
 *   3단 반전가산: V_x ─Ra─ (−)U3, V_buf ─Rb─ (−)U3, R_f 피드백, (+)=GND → V_o.
 */
export type OpampThreeStageSumCircuitDiagram = {
  v1Label: string;   // "2[V]"
  rin1Label: string; // "4[kΩ]"
  rf1Label: string;  // "8[kΩ]"
  v2Label: string;   // "1[V]"
  raLabel: string;   // 3단 V_x 입력 R "2[kΩ]"
  rbLabel: string;   // 3단 V_buf 입력 R "1[kΩ]"
  rfLabel: string;   // "R_f[kΩ]"
  vxLabel: string;   // "V_x[V]"
  voLabel: string;   // "V_o[V]"
  u3NonInverting?: boolean;  // true면 U3 = 비반전 가산기(입력→+단자, R_f·R_g→−단자) (변형유형). V_o 공식 달라짐.
  rgLabel?: string;  // 비반전일 때 −단자 접지저항 R_g (예 "2[kΩ]")
};

/**
 * ac_bridge_circuit payload — AC 휘트스톤 브리지 (가, 임용 7번).
 *   다이아몬드: 상단노드 T, 하단노드 G(=GND), 좌마디 A, 우마디 B.
 *   Z1=T→A(좌상), Z2=T→B(우상), Z3=A→G(좌하, V_A), Z4=B→G(우하, V_B), R_L: A↔B.
 *   전원 V는 좌측 (T↔G).
 */
export type AcBridgeCircuitDiagram = {
  vLabel: string;    // "V_rms=4∠0°V"
  z1Label: string;   // 좌상 (예: "−j2Ω")
  z2Label: string;   // 우상 (예: "6Ω")
  z3Label: string;   // 좌하 (예: "j4Ω") — V_A
  z4Label: string;   // 우하 (예: "6Ω") — V_B
  rlLabel: string;   // "R_L"
};

/** ac_bridge_thevenin_circuit payload — 테브난 등가 (나). V_TH 직렬 Z_TH → 단자 A·B → R_L. */
export type AcBridgeTheveninCircuitDiagram = {
  vthLabel: string;  // "V_TH"
  zthLabel: string;  // "Z_TH"
  rlLabel: string;   // "R_L"
};

/**
 * ac_thevenin_ladder_circuit payload — 단일 AC원 사다리 (가, 임용 7번 회로이론).
 *   좌: AC원(세로) — 상단: 직렬 ser1 — 마디 M — [션트 sh ↓ 하단 rail] — 직렬 ser2 — 단자 a.
 *   단자 b = 하단 rail. 부하 Z_L(점선)이 a–b 가교.  (원본: ser1=L(j2), sh=C(−j1), ser2=R(2))
 */
export type AcTheveninLadderCircuitDiagram = {
  vLabel: string;       // "V_RMS=4∠0°V"
  ser1Type: "R" | "L" | "C";
  ser1Label: string;    // 직렬 1 (예: "j2Ω")
  shType: "R" | "L" | "C";
  shLabel: string;      // 션트 (예: "−j1Ω")
  ser2Type: "R" | "L" | "C";
  ser2Label: string;    // 직렬 2 (예: "2Ω")
  loadLabel: string;    // "Z_L"
};

/** ac_thevenin_equiv_circuit payload — 테브난 등가 (나). V_TH 직렬 Z_TH → 단자 a·b → Z_L. */
export type AcTheveninEquivCircuitDiagram = {
  vthLabel: string;  // "V_TH"
  zthLabel: string;  // "Z_TH"
  loadLabel: string; // "Z_L"
};

/** switched_rl_dual_src_circuit payload — 2전원 SPDT RL 과도 (임용 3번 회로이론).
 *  좌측 V_A leg ∥ 가운데 V_B leg → SPDT(단자 A=V_A 쪽, 단자 B=V_B 쪽, t=0에 A→B) → 우측 직렬 R+L, i(t) 측정.
 *  t<0 정상상태 i(0⁻)=V_A/R, t≥0 i(∞)=V_B/R, τ=L/R. */
export type SwitchedRlDualSrcCircuitDiagram = {
  vaLabel: string;        // "4[V]" — 단자 A 쪽(t<0) 전원
  vbLabel: string;        // "2[V]" — 단자 B 쪽(t≥0) 전원
  rLabel: string;         // "2[Ω]"
  lLabel: string;         // "1[H]"
  currentLabel?: string;  // "i(t)" (기본)
};

/** dc_thevenin_2src_circuit payload — 2전압원 병렬가지 (가, 임용 3번). leg1: R1+V1, leg2: R2+V2, 단자 a·b.
 *  loadLabel 있으면 단자 a–b에 부하(R_L) 연결된 완성 회로(변형: 전력 문제). */
export type DcThevenin2srcCircuitDiagram = {
  r1Label: string; v1Label: string; v1PlusTop: boolean;  // leg1 (R 상단, V 하단, + 단자 방향)
  r2Label: string; v2Label: string; v2PlusTop: boolean;  // leg2
  loadLabel?: string;  // 있으면 a–b에 부하 R_L 연결 (변형 전력 문제)
};

/** demux_circuit payload — 1→4 디멀티플렉서 (임용 8번). 구조 고정, 게이트 종류·라벨만. */
export type DemuxCircuitDiagram = {
  gateKind?: "NAND" | "AND";
  outputs?: number;
  selectLabels?: [string, string];
  inputLabel?: string;
};

/** number_ring_diagram payload — n비트 수 표현 고리 (코드↔10진수 대응). */
export type NumberRingDiagram = {
  bits: number;
  entries: Array<{ code: string; value: number }>;
};

/** mod_n_counter_circuit payload — mod-N 동기식 카운터 회로 (임용 9번 (나)).
 *  구조가 고정(FF 3개 + 공통 CLK + CLR + 검출 게이트 ⓒ)이라 종류·라벨만 받는다. */
export type ModNCounterCircuitDiagram = {
  ffTypes?: Array<"T" | "D" | "JK">;    // 기본 [T, D, T]
  clearActiveLow?: boolean;             // CLR 극성 (true면 NAND 검출)
  gateLabel?: string;                   // "ⓒ"
  gateKind?: "AND" | "NAND";
  detectState?: string;                 // 리셋을 유발하는 상태 (예 "111")
  modulus?: number;                     // 계수 N
};

/** jk_excitation_circuit payload — JK-FF 2개 + 조합논리 블록 ㉲ (2025 전기 A-8 (나)).
 *  구조가 고정이라 라벨만 받는다(좌표 정보 금지). */
export type JkExcitationCircuitDiagram = {
  blockLabel?: string;   // "㉲" — 조합 논리 블록(점선)
  inputLabel?: string;   // "x"
  ffALabel?: string;     // "FF_A"
  ffBLabel?: string;     // "FF_B"
  highLabel?: string;    // "HIGH"
  clockLabel?: string;   // "CLK"
};

/** ac_superposition_source_design_circuit payload — 2전원 페이저 RLC (임용 5번 회로이론).
 *  상단 rail: [V_s] ─ R₁ ─ 마디 A ─ R₂ ─ [I_s] / 가운데 leg: A ─ R₃ ─ jX_L ─ (−jX_C) ─ GND.
 *  targetOn이 가리키는 소자 양단에 목표 페이저 전압(targetLabel) 극성이 표기된다. */
export type AcSuperpositionSourceDesignCircuitDiagram = {
  r1Label: string;      // "1[Ω]" — 전압원 쪽 상단
  r2Label: string;      // "2[Ω]" — 전류원 쪽 상단
  r3Label: string;      // "2[Ω]" — 가운데 leg 저항
  lLabel: string;       // "j11[Ω]"
  cLabel: string;       // "−j10[Ω]"
  vsLabel: string;      // "V_s∠0°[V]"
  isLabel: string;      // "I_s∠−90°[A]"
  targetLabel: string;  // "V_c" | "V_L"
  targetOn: "capacitor" | "inductor";
};

/** dc_wheatstone_balance_circuit payload — DC 휘트스톤 브리지 평형 (임용 3번 회로이론).
 *  V_s ─ R_s ─ T(상단 레일) / 다이아몬드 T·L·R·B: 상단좌 R1 · 상단우 R_tr · 하단좌 R3a(+R3b는 L→GND 병렬) ·
 *  하단우 R_rb, 브리지 암 R_g(L–R). 미지 암(unknownArm)에는 보조 저항 R_p가 병렬로 붙는다.
 *  출력 V_o는 상단 레일(+)과 우측 마디 R(−) 사이 **개방** 단자. */
export type DcWheatstoneBalanceCircuitDiagram = {
  vsLabel: string;    // "22[V]"
  rsLabel: string;    // "4[Ω]" — 전원 직렬 저항 (상단 레일)
  r1Label: string;    // 상단 좌측 암 (T→L)
  r3aLabel: string;   // 하단 좌측 암 (L→B)
  r3bLabel: string;   // 하단 좌측 병렬 (L→GND)
  rtrLabel: string;   // 상단 우측 암 (T→R) — 미지면 "R_x"
  rrbLabel: string;   // 하단 우측 암 (R→B) — 미지면 "R_x"
  rpLabel: string;    // 미지 암과 병렬인 보조 저항
  rgLabel: string;    // 브리지 암 (L→R)
  unknownArm: "upper_right" | "lower_right";
  voLabel?: string;   // "V_o" (기본)
};

/** dc_thevenin_equiv_circuit payload — 테브난 등가 (나). V_T 직렬 R_T → 단자 a·b. loadLabel 있으면 a–b에 부하. */
export type DcTheveninEquivCircuitDiagram = {
  rtLabel: string;   // "R_T[Ω]"
  vtLabel: string;   // "V_T[V]"
  vtPlusTop: boolean;
  loadLabel?: string;  // 있으면 a–b에 부하 R_L 연결 (변형 전력 문제)
};

/**
 * ac_power_factor_circuit payload — AC 역률보정 (임용 9번 회로이론).
 *   V_s(좌, 세로 AC) ─ 직렬 R₁ ─ 직렬 L(jX_L) ─ 마디 ─ 부하 Z[ R₂ ∥ C(−jX_C) ] ─ 하단 rail.
 */
export type AcPowerFactorCircuitDiagram = {
  vsLabel: string;   // "100∠0°"
  r1Label: string;   // "1[Ω]"
  xlLabel: string;   // "j1[Ω]"
  r2Label: string;   // "2[Ω]" (부하 R)
  xcLabel: string;   // "−jX_C[Ω]" (부하 C, 미지)
};

/** ac_admittance_resonance_circuit payload — 어드미턴스 공진 (가, 임용 7번 회로이론).
 *  전압원 → 병렬 블록[ C ∥ (R+L 직렬) ], 점선 블록의 Y_eq=a+jb. */
export type AcAdmittanceResonanceCircuitDiagram = {
  srcLabel: string;  // "10cos(ωt)" — AC 전압원
  cLabel: string;    // "0.05[F]" — 병렬 가지
  rLabel: string;    // "1[Ω]" — 직렬 R+L 가지의 R
  lLabel: string;    // "0.1[H]"
  yeqLabel?: string; // "Y_eq=a+jb[Ʊ]"
};

/** ac_admittance_resonance_dual_circuit payload — 위의 쌍대(변형).
 *  전류원 → 직렬 블록[ L + (R∥C) ], 점선 블록의 Z_eq=a+jb. */
export type AcAdmittanceResonanceDualCircuitDiagram = {
  srcLabel: string;  // "10cos(ωt)" — AC 전류원
  lLabel: string;    // "0.05[H]" — 직렬 L
  rLabel: string;    // "1[Ω]" — 병렬 R
  cLabel: string;    // "0.1[F]" — 병렬 C
  zeqLabel?: string; // "Z_eq=a+jb[Ω]"
};

/** ac_vccs_phasor_circuit payload — 종속전류원(g·V_c) 2단 구동 페이저 회로 (임용 3번 회로이론).
 *  좌측망: V_s ─ R₁ ─ 마디 A ─ [shunt ∥ shunt] ─ GND (마디 A 전압 = V_c)
 *  우측망: 종속전류원 g·V_c ─ 마디 B ─ [R₂ ∥ 부하 리액턴스] ─ GND (R₂ 전류 = I_R)
 *  두 망은 접지만 공유 — 상단은 이어지지 않는다. */
export type AcVccsPhasorCircuitDiagram = {
  srcLabel: string;          // "10∠45° V"
  r1Label: string;           // "1 Ω" — 상단 직렬 저항
  shuntKind: "C" | "L";      // shunt 소자 종류 (유사=C, 변형=L)
  shunt1Label: string;       // "−j2 Ω"
  shunt2Label: string;       // "−j2 Ω"
  vcLabel: string;           // "V_c" — 마디 A 전압(제어전압)
  depLabel: string;          // "2V_c" — 종속전류원 값
  loadRLabel: string;        // "2 Ω" — I_R가 흐르는 저항
  loadKind: "L" | "C";       // 부하 리액턴스 종류 (유사=L, 변형=C)
  loadXLabel: string;        // "j2 Ω"
  irLabel: string;           // "I_R"
};

/**
 * switched_rc_dc_circuit payload — t=0 스위치 개방 RC (임용 2번).
 *   좌: V_s(+R_s) ∥ I_s, ─[SW t=0]─ 우: C(v_c) ∥ R_load(v_o). 개방 시 우측 C∥R_load 방전.
 */
export type SwitchedRcDcCircuitDiagram = {
  kind: "RC" | "RL";       // 유사=RC(커패시터), 변형=RL(코일)
  vsLabel: string;   // "5V"
  rsLabel: string;   // "1Ω"
  isLabel: string;   // "4A"
  reactLabel: string;     // "2.5F" (RC) 또는 "2H" (RL)
  rlLabel: string;   // "2Ω"
  reactMeasLabel: string; // "v_c(t)" (RC) 또는 "i_L(t)" (RL)
  voLabel: string;   // "v_o(t)"
};

/**
 * dff_state_design_circuit payload — D-FF 2개 + 게이트 구현 (임용 9번 정보과 (다)).
 *   ㉮ 게이트 → D_A → FF_A → Q_A,  ㉯ 게이트 → D_B → FF_B → Q_B. Q_A·Q_B 피드백, 공통 CLK.
 *   게이트는 빈칸(㉮·㉯) — 학생이 도출.
 */
export type DffStateDesignCircuitDiagram = {
  gateASym: string;   // "㉮"
  gateBSym: string;   // "㉯"
  gateAInputs: string[]; // ㉮ 입력 라벨 (예: ["Q_A","Q_B"])
  gateBInputs: string[];
  ffAType?: "D" | "T";      // FF_A 종류 (기본 D)
  ffBType?: "D" | "T";      // FF_B 종류 (기본 D). exam_variant은 T (D-FF + T-FF)
  ffAInputName?: string;    // FF_A 입력 라벨 (예: "D_A")
  ffBInputName?: string;    // FF_B 입력 라벨 ("D_B" 또는 "T_B")
};

/**
 * jk_sync_counter_circuit payload — JK 플립플롭 3개 동기식 카운터 (가) 전용 fixed-slot.
 *  구조 고정(3비트): FF0(Q₀)·FF1(Q₁)·FF2(Q₂) 공통 CP. J₀=K₀=1(High).
 *  상향(up): J₁=K₁=Q₀, J₂=K₂=Q₀·Q₁ (Q 출력 피드백).
 *  하향(down): J₁=K₁=Q̄₀, J₂=K₂=Q̄₀·Q̄₁ (Q̄ 출력 피드백 — NOT 게이트 불필요).
 */
export type JkSyncCounterCircuitDiagram = {
  direction: "up" | "down";
};

/**
 * jk_state_machine_circuit payload — 비순환 상태형 JK 카운터 (가) 전용 fixed-slot.
 *  J·K가 단일 신호(High/Qᵢ/Q̄ᵢ)에 직결(게이트 없음). 각 핀의 소스 신호 라벨만 받는다.
 */
export type JkStateMachineCircuitDiagram = {
  /** 각 J·K 입력의 소스 신호 표시 라벨 (예: "1", "Q₁", "Q̄₀"). */
  j0: string; k0: string; j1: string; k1: string; j2: string; k2: string;
  /** 변형유형: 있으면 J2=K2를 2입력 게이트(a,b)로 구동(게이트 1개 추가). a·b는 "Q0"/"Q1" 등. */
  gate?: { op: "AND" | "OR" | "XOR" | "NAND" | "NOR" | "XNOR"; a: string; b: string };
};

/**
 * jk_state_machine_variant_circuit payload — 변형유형 (게이트 1개 추가).
 *  고정 구조: J0=K0=1, J1=K1=j1k1(FF2에서 Q2/Q̄2), J2=K2=gate(Q1,Q2). 게이트 op만 가변.
 */
export type JkStateMachineVariantCircuitDiagram = {
  j1k1: string;   // "Q2" | "nQ2" 등 (FF1의 J·K 소스)
  gateOp: "AND" | "OR" | "XOR" | "NAND" | "NOR" | "XNOR";
};

/**
 * jk_state_diagram payload — JK 카운터 상태도 (사이클 링 배치).
 *  cycle: 000에서 시작하는 사이클 상태 라벨 순서(예: ["000","010",...]) — 링 위에 순서대로 배치.
 *  nonCyclic: 비순환 상태 → 진입 대상(사이클 상태). 링 바깥에 놓고 대상으로 화살표.
 */
export type JkStateDiagram = {
  cycle: string[];
  nonCyclic: Array<{ state: string; next: string }>;
};

/**
 * scr_turn_on_circuit payload — SCR 턴온 회로 (가) 전용 fixed-slot.
 *  +V ─ R_A(I_A) ─ A ─[SCR]─ K(접지), 게이트: V_G ─ R_G ─ G. 라벨만 받음.
 */
export type ScrTurnOnCircuitDiagram = {
  supplyLabel: string;  // "+15 V"
  rLabel: string;       // "20Ω"
  rGateLabel: string;   // "1kΩ"
  vGateLabel: string;   // "V_G"
  iaLabel: string;      // "I_A"
};

/**
 * reactive_vi_integral_circuit payload — 이상 인덕터/커패시터 v-i 적분 회로 (가).
 *  element="L": 전압원 v(t) + 인덕터 L, i(t) 측정 / element="C": 전류원 i(t) + 커패시터 C, v(t) 측정.
 */
export type ReactiveViIntegralCircuitDiagram = {
  element: "L" | "C";
  sourceLabel: string;  // "v(t)" 또는 "i(t)"
  elemLabel: string;    // "5H" 또는 "2F"
  measureLabel: string; // "i(t)" 또는 "v(t)"
};

/** concept_diagram diagram 권장 shape — 일반 그래프 */
export type ConceptDiagram = {
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
};

/** Netlist 구성 소자 — id 기반 */
export type NetlistComponent = {
  id: string;
  type: string;
  value?: string;
  meta?: Record<string, string | number | boolean>;
};

/** Netlist 노드간 연결. pin 표기 예: "V1+", "R1.a", "Q1.B" */
export type NetlistEdge = {
  from: string;
  to: string;
};

// =====================================================================
// Constraint system — 통합 제약 평가 (lib/constraints/*)
// =====================================================================
export type {
  Constraint,
  ConstraintContext,
  ConstraintKind,
  ConstraintSet,
  ConstraintSeverity,
  ConstraintViolation,
} from "./constraints";

// =====================================================================
// CircuitType — netlist generator의 회로 archetype 분기 키
// =====================================================================
export type {
  CircuitType,
  CircuitTypeClassification,
  CircuitTypeParams,
} from "./circuitType";
