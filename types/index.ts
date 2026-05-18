// =====================================================================
// Subject (과목) — canonical key는 영어, 표시 라벨은 한국어
// =====================================================================

/** 과목 캐널 키 (API·DB·로그) */
export type SubjectKey = "digital_logic" | "electronics" | "circuit_theory" | "mixed_signal";

/** 과목 한국어 표시 라벨 */
export type SubjectLabel = "디지털논리회로" | "전자회로" | "회로이론" | "복합형";

/** UI 노출 순서로 정렬한 키 목록 */
export const SUBJECT_KEYS: SubjectKey[] = ["electronics", "circuit_theory", "digital_logic", "mixed_signal"];

/** SubjectKey → 한국어 라벨 */
export const SUBJECT_LABEL: Record<SubjectKey, SubjectLabel> = {
  electronics: "전자회로",
  circuit_theory: "회로이론",
  digital_logic: "디지털논리회로",
  mixed_signal: "복합형",
};

/** 한국어 라벨 → SubjectKey (역매핑, 외부 입력 정규화용) */
export const SUBJECT_KEY_BY_LABEL: Record<SubjectLabel, SubjectKey> = {
  전자회로: "electronics",
  회로이론: "circuit_theory",
  디지털논리회로: "digital_logic",
  복합형: "mixed_signal",
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

/** 모든 세부 주제 union */
export type TopicKey = DigitalLogicTopic | ElectronicsTopic | CircuitTheoryTopic | MixedSignalTopic;

/** 과목별 토픽 묶음 */
export const TOPICS_BY_SUBJECT: {
  digital_logic: DigitalLogicTopic[];
  electronics: ElectronicsTopic[];
  circuit_theory: CircuitTheoryTopic[];
  mixed_signal: MixedSignalTopic[];
} = {
  digital_logic: ["kmap_sop", "kmap_pos", "combinational_gate", "flipflop_counter", "fsm", "waveform_analysis"],
  electronics: ["opamp", "bjt_bias", "bjt_amplifier", "mosfet_bias", "mosfet_amplifier", "diode", "mixed_signal"],
  circuit_theory: [
    "dc_resistive", "mesh_analysis", "nodal_analysis",
    "transient_rc", "transient_rl", "rlc_response",
    "supermesh", "supernode", "dependent_source", "switching_circuit",
  ],
  mixed_signal: ["counter_dac_comparator", "adc_sample_hold", "logic_opamp_hybrid"],
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
export type GenerationMode = "exam_similar" | "exam_variant";

/** 모드 한국어 라벨 */
export const GENERATION_MODE_LABEL: Record<GenerationMode, string> = {
  exam_similar: "기출유사유형",
  exam_variant: "기출변형유형",
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
   */
  componentInventory?: Array<{ id: string; type: string; value?: string }>;
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
  | "mixed_circuit";

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
 * node에 붙는 라벨/마커.
 *  - "terminal_dot": ●a / ●b 같은 단자 표시 (Thevenin 등)
 *  - "label_only":   라벨 텍스트만 (예: V1 노드 이름)
 *  - "voltage_arrow": V_ab 같은 두 노드 간 전압 측정 (이건 NodeAnnotation 1개로 표현 어려움 — measurementMarks 사용)
 */
export type NodeAnnotation = {
  node: string;
  label: string;
  style?: "terminal_dot" | "label_only";
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

/** Karnaugh map cell value */
export type KmapValue = 0 | 1 | "X";

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
  /** 시간축 기준점 마커 — 학생이 답해야 할 구간 표시 (예: t₁, t₂, t₃, t₄). */
  markers?: Array<{ t: number; label: string }>;
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
