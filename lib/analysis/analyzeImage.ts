import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SUBJECT_HINT } from "@/lib/prompts";
import { buildStructuralEnvelope } from "./buildStructuralEnvelope";
import {
  SUBJECT_LABEL,
  TOPICS_BY_SUBJECT,
  type AnalysisResult,
  type SubjectKey,
  type TopicKey,
  type TopologySignature,
} from "@/types";

const log = createLogger("lib/analysis/analyzeImage");

/**
 * Structured Outputs strict schema for ImageAnalysis.
 *  strict mode 제약: 모든 properties required + additionalProperties:false.
 *  optional은 ["type","null"] union으로.
 *  AnalysisResult의 일부 필드만 schema에 박음 (signals·figureRequirements·structureSignature·structuralEnvelope·subjectKey·family는 nullable).
 */
function buildAnalysisSchema(subject: SubjectKey): Record<string, unknown> {
  const topicEnum = TOPICS_BY_SUBJECT[subject] as readonly string[];
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "topic", "interpretation", "relatedConcepts", "fillInTheBlanks",
      "topicKey", "semantic", "topologySignature", "nodeAnnotations", "loadPlaceholders",
    ],
    properties: {
      topic: { type: "string", description: "문제의 주제 (한 줄, 25자 이내)" },
      interpretation: { type: "string", description: "문제 상황·구하는 미지수·해석 흐름의 한국어 해석 (3~5문장)" },
      relatedConcepts: { type: "array", items: { type: "string" }, description: "관련 핵심 개념·법칙·공식 5~8개" },
      fillInTheBlanks: {
        type: "array",
        description: "핵심 개념 빈칸 5개 ('____' 표기 + 정답).",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sentence", "answer"],
          properties: {
            sentence: { type: "string" },
            answer: { type: "string" },
          },
        },
      },
      topicKey: {
        anyOf: [{ type: "string", enum: [...topicEnum] }, { type: "null" }],
        description: `정확한 분류 안 되면 null. 가능 값: ${topicEnum.join(" | ")}`,
      },
      semantic: {
        type: "object",
        additionalProperties: false,
        required: ["hasStateTransition", "hasEquivalentTransformation", "hasWaveformEvolution", "requiresMultiFigure"],
        properties: {
          hasStateTransition: { type: "boolean" },
          hasEquivalentTransformation: { type: "boolean" },
          hasWaveformEvolution: { type: "boolean" },
          requiresMultiFigure: { type: "boolean" },
        },
      },
      topologySignature: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["subjectKey", "family", "features", "branches"],
            properties: {
              subjectKey: { type: "string", enum: ["digital_logic", "circuit_theory", "electronics"] },
              family: { type: "string" },
              features: {
                type: "object",
                additionalProperties: false,
                required: ["hasSwitch", "hasDependentSource", "hasGround", "hasSupermesh", "hasMesh", "hasStateTransition", "meshCount"],
                properties: {
                  hasSwitch: { type: "boolean" },
                  hasDependentSource: { type: "boolean" },
                  hasGround: { type: "boolean" },
                  hasSupermesh: { type: "boolean" },
                  hasMesh: { type: "boolean" },
                  hasStateTransition: { type: "boolean" },
                  meshCount: { type: "number" },
                },
              },
              branches: {
                type: "array",
                description: "회로의 모든 branch를 빠짐없이. 한 branch는 직렬 chain.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["role", "components", "betweenNodes"],
                  properties: {
                    role: {
                      type: "string",
                      enum: [
                        "voltage_source_leg", "current_source_leg", "dependent_source_leg",
                        "switching_leg", "load_leg",
                        "shared_supermesh_branch", "mesh_only_branch",
                        "top_rail_resistor", "bottom_rail_wire",
                      ],
                      description:
                        "voltage_source_leg/current_source_leg: vertical leg (top node↔GND)인 V/I. " +
                        "mesh_only_branch: top rail에 끼인 horizontal V/dep source (예: ─R1─⊕V─R2─). " +
                        "top_rail_resistor: top rail 위 horizontal R. " +
                        "switching_leg: SW 포함 vertical chain. ★ SW + R + I 같은 직렬 component가 한 vertical leg에 함께 있으면 모두 한 switching_leg branch의 components 배열에 직렬로 박을 것 — 각각 별도 branch로 분리 절대 금지. " +
                        "load_leg: 부하 R/I (vertical, top↔GND). " +
                        "dependent_source_leg: VCVS/VCCS/CCVS/CCCS 포함 leg.",
                    },
                    components: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["type", "value"],
                        properties: {
                          type: { type: "string" },
                          value: { anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }] },
                        },
                      },
                    },
                    betweenNodes: {
                      anyOf: [
                        { type: "null" },
                        {
                          type: "array",
                          items: { type: "string" },
                          minItems: 2,
                          maxItems: 2,
                        },
                      ],
                      description:
                        "(선택) 명시적 노드 쌍 — 4-mesh 이상 또는 평행 가지가 있을 때 반드시 사용. " +
                        "horizontal branch는 [좌측 노드, 우측 노드]. vertical leg는 [상단 노드, 'GND']. " +
                        "node id는 의미 있게 부여 ('n_left', 'n_v1', 'n_v3', 'n_right' 등). " +
                        "같은 노드 쌍에 여러 branch가 있으면 자동으로 평행 가지로 처리됨. " +
                        "미지정 시 branches 순서대로 자동 배치 (3-mesh 이하 단순 ladder에만 OK).",
                    },
                  },
                },
              },
            },
          },
          { type: "null" },
        ],
      },
      nodeAnnotations: {
        anyOf: [
          {
            type: "array",
            description:
              "단자 라벨(a/b/x/y 등). 발견되면 entry, 없으면 빈 배열. role은 가능하면 부여 " +
              "(source_plus | main_unknown | right_unknown | ground) — pattern detector가 이름 무관하게 매칭.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["node", "label", "style", "role"],
              properties: {
                node: { type: "string" },
                label: { type: "string" },
                style: { type: "string", enum: ["terminal_dot", "label_only"] },
                role: {
                  anyOf: [
                    { type: "string", enum: ["source_plus", "main_unknown", "right_unknown", "ground"] },
                    { type: "null" },
                  ],
                },
              },
            },
          },
          { type: "null" },
        ],
      },
      loadPlaceholders: {
        anyOf: [
          {
            type: "array",
            description: "부하 placeholder (R_L 점선 박스). 없으면 빈 배열.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["betweenNodes", "label", "emphasize"],
              properties: {
                betweenNodes: { type: "array", items: { type: "string" } },
                label: { type: "string" },
                emphasize: { type: "boolean" },
              },
            },
          },
          { type: "null" },
        ],
      },
    },
  };
}

function buildPrompt(subject: SubjectKey): string {
  const topicEnum = (TOPICS_BY_SUBJECT[subject] as readonly TopicKey[]).join(" | ");
  return `당신은 전자임용(중등 정보·전자) 출제·해설 전문가입니다.
첨부된 임용 기출 문제 이미지를 분석해 다음 JSON 스키마에 맞춰 응답하세요.

[과목] ${SUBJECT_LABEL[subject]} (${subject})
[과목 힌트] ${SUBJECT_HINT[subject]}
[유효 TopicKey 목록] ${topicEnum}

【출력 JSON 스키마】
{
  "topic": "문제의 주제 (한 줄, 25자 이내)",
  "interpretation": "문제 상황·구하는 미지수·해석 흐름의 한국어 해석 (3~5문장)",
  "relatedConcepts": ["관련 핵심 개념·법칙·공식 5~8개 (각각 짧은 명사구)"],
  "fillInTheBlanks": [
    { "sentence": "핵심 개념 문장 — 빈칸은 ____ 로 표기", "answer": "____에 들어갈 정확한 단어/공식" }
  ],
  "topicKey": "위 [유효 TopicKey 목록] 중 가장 적합한 하나",
  "semantic": {
    "hasStateTransition": boolean,           // FSM·플립플롭·카운터·순차논리·상태변화
    "hasEquivalentTransformation": boolean,  // 테브난·노턴·소스변환·등가회로
    "hasWaveformEvolution": boolean,         // RC/RL 과도응답·스위칭·타이밍·파형
    "requiresMultiFigure": boolean           // 회로도 외 추가 그림 필요 (kmap/waveform/state쌍 등)
  },
  "signals": {
    "inputs":  string[],
    "outputs": string[]
  },
  "figureRequirements": [
    {
      "role":         "kmap" | "truth_table" | "implementation_circuit" | "waveform" | "state_diagram" | "equivalent_circuit" | "main_circuit",
      "diagramType":  "kmap" | "truth_table" | "logic_network" | "waveform" | "analog_netlist" | "concept_diagram",
      "scope":        "per_output" | "combined" | "per_state" | "single",
      "targets":      string[]  // 옵셔널. per_output·combined일 때 적용 변수명 (없으면 signals.outputs)
      "states":       string[]  // 옵셔널. per_state일 때
      "required":     boolean
    }
  ],
  "topologySignature": {
    // ★ 회로 위상 시그니처 — circuit_theory/electronics에서 필수
    // branches는 직렬 chain 단위 (vertical leg 또는 top rail R 1개씩)
    "subjectKey": "digital_logic" | "circuit_theory" | "electronics",
    "family":      string,
    "features": {
      "hasSwitch":          boolean,
      "hasDependentSource": boolean,
      "hasGround":          boolean,
      "hasSupermesh":       boolean,
      "hasMesh":            boolean,
      "hasStateTransition": boolean,
      "meshCount":          number   // 원본 mesh 개수 (supermesh면 ≥2)
    },
    "branches": [
      // 각 branch.role enum:
      //   voltage_source_leg / current_source_leg / dependent_source_leg
      //   switching_leg / load_leg
      //   shared_supermesh_branch / mesh_only_branch
      //   top_rail_resistor / bottom_rail_wire
      //
      // 한 branch에 직렬로 여러 component가 있으면 components 배열에 모두 (예: SW+R+I 직렬 vertical leg)
      //
      // ★ betweenNodes: mesh ≥ 3 또는 평행 가지 있을 때 **반드시** 명시.
      //   - horizontal: ["좌측node", "우측node"]
      //   - vertical:   ["상단node", "GND"]
      //   - 같은 노드 쌍에 여러 branch면 자동으로 평행 가지 (mesh +1).
      //   - 미지정 시 branches 순서대로 자동 배치 (3-mesh 이하 단순 ladder에만 OK).
      { "role": "voltage_source_leg",   "components": [{ "type": "V", "value": "10V" }], "betweenNodes": ["n_left", "GND"] },
      { "role": "dependent_source_leg", "components": [{ "type": "VCVS", "value": "0.2V2" }], "betweenNodes": ["n_left", "GND"] },
      { "role": "switching_leg",        "components": [
        { "type": "SW" }, { "type": "R", "value": "10Ω" }, { "type": "I", "value": "1A" }
      ], "betweenNodes": ["n_mid", "GND"] },
      { "role": "top_rail_resistor",    "components": [{ "type": "R", "value": "10Ω" }], "betweenNodes": ["n_left", "n_mid"] },
      { "role": "top_rail_resistor",    "components": [{ "type": "R", "value": "10Ω" }], "betweenNodes": ["n_mid", "n_right"] },
      { "role": "mesh_only_branch",     "components": [{ "type": "I", "value": "0.5A" }], "betweenNodes": ["n_mid", "n_right"] }
      // ↑ 마지막 두 branch는 n_mid·n_right 사이에 평행 가지 → 한 mesh 추가
    ]
  },
  "structureSignature": {
    // universal — 모든 과목 공통
    "subjectKey": "digital_logic" | "circuit_theory" | "electronics",
    "family":      "kmap_sop" | "supermesh" | "bjt_amplifier" | ...,  // TopicKey와 동일
    "signals":     { "inputs": ["A","B","C"], "outputs": ["X","Y"] },
    "figureRequirements": [
      { "role": "kmap", "diagramType": "kmap", "scope": "per_output", "targets": ["X","Y"], "required": true },
      { "role": "implementation_circuit", "diagramType": "logic_network", "scope": "combined", "targets": ["X","Y"], "required": true },
      { "role": "main_circuit", "diagramType": "analog_netlist", "scope": "single", "required": true },
      { "role": "equivalent_circuit", "diagramType": "analog_mesh_network", "scope": "per_state", "states": ["switch_open","switch_closed"], "overlays": ["supermesh_boundary"], "required": false }
    ],
    "componentCounts":  { "R": 5, "V": 1, "I": 1, "VCVS": 1, "SW": 1 },   // analog일 때
    "gateCounts":       { "NOT": 3, "AND": 4, "OR": 2 },                  // digital일 때
    "requiredFeatures": {
      "hasSwitch":          boolean,   // 스위치 포함 (analog)
      "hasDependentSource": boolean,   // 종속전원 (analog)
      "hasSupermesh":       boolean,   // supermesh 해석 (analog)
      "hasMesh":            boolean,   // mesh 해석 (analog)
      "hasKmap":            boolean,   // 카르노맵 (digital)
      "hasWaveform":        boolean,   // 파형 (digital/analog)
      "hasBlankGate":       boolean,   // ⓐⓑ 빈칸 (digital)
      "hasStateTransition": boolean    // FSM·플립플롭 등 (digital/analog)
    },
    "topologyHints": {
      "meshCount":   number,  // analog mesh 개수
      "nodeCount":   number,
      "branchCount": number,
      "outputCount": number,
      "inputCount":  number
    },
    // legacy 유지 (호환성)
    "inputCount":              number,
    "outputCount":             number,
    "figureCount":             number,
    "totalComponentCount":     number,
    "totalGateCount":          number,
    "blankCount":              number
  }
}

【규칙】
- JSON 객체 하나만 출력. 코드펜스·설명 텍스트 금지.
- fillInTheBlanks는 정확히 5개.
- relatedConcepts는 5~8개.
- topicKey는 반드시 [유효 TopicKey 목록] 중 하나만. 그 외 값(예: SubjectKey 그대로, 자유 문자열) 금지.
- semantic의 4개 boolean은 이미지에서 판단된 사실 기반.
- signals.outputs는 문제에서 묻는 모든 출력 변수를 빠짐없이 포함 (multi-output이면 ["Y","Z"] 등 모두).
- signals.inputs도 문제에 등장하는 모든 입력 변수를 포함.
- 변수명은 원문 그대로 (예: V_o, Q_D, Z, A 등 대소문자·아래첨자 유지).
- 원본 회로에 ⓐ·ⓑ·㉠·㉡ 같은 빈칸 게이트가 있으면:
  · structureSignature.blankCount = distinct symbol 개수 (예: ⓐ, ⓑ → 2). 같은 symbol을 여러 게이트가 공유하면 하나로 카운트.
  · structureSignature.gateCounts에도 그 빈칸 게이트를 정답 type으로 포함해서 카운트.
  · interpretation에도 "(나) 회로에 ⓐ, ⓑ 두 자리에 들어갈 게이트를 묻는 형식" 명시.
- structureSignature는 반드시 정확히 카운트:
  · 디지털논리: gateCounts (NOT/AND/OR/NAND/NOR/XOR/XNOR 각 종류별 개수)와 totalGateCount, productTermGateCount(SOP의 AND term 수), outputCombinerGateCount(출력 결합 OR 수), sharedTermCount(출력간 공유 product term)
  · 회로이론·전자회로: componentCounts (R/V/I/L/C/SW 등 각 종류별 개수), totalComponentCount
  · 둘 다 inputCount/outputCount/figureCount 필수
  · 빈 게이트(ⓐ·ⓑ 같은 placeholder)도 카운트에 포함 (학생이 채울 자리도 게이트로)
- figureRequirements는 원본에 보이는 모든 figure를 반영:
  · 출력별 K-map(예: X용·Y용 따로) → role="kmap", diagramType="kmap", scope="per_output", targets=["X","Y"]
  · 멀티출력 통합 회로 → role="implementation_circuit", diagramType="logic_network", scope="combined", targets=signals.outputs
  · 스위치 t<0/t>0 등가회로 → role="equivalent_circuit", scope="per_state", states=["before","after"]
  · 단일 회로 → scope="single", required=true
- required=true가 디폴트. 누락 가능한 보조 figure만 false.
- 모든 한국어. 단, 공식·기호·키 값은 원문 그대로.
- 추측 금지. 이미지에 없는 정보는 만들지 않는다.

【annotation 추출 — circuit_theory/electronics 회로 한정】
원본 회로 이미지에 다음 요소가 있으면 JSON에 별도 필드로 반드시 추출 (interpretation에만 적지 마라 — 코드가 이걸 읽어 generator에 전달):

  "nodeAnnotations": [
    { "node": "<node_id>", "label": "a", "style": "terminal_dot" },
    { "node": "<node_id>", "label": "b", "style": "terminal_dot" }
  ],
  "loadPlaceholders": [
    { "betweenNodes": ["<node_a>", "<node_b>"], "label": "R_L", "emphasize": true }
  ]

- 단자 라벨 (a, b, x, y 등) — 회로 위에 ● 표시 + 알파벳으로 표시된 측정점/등가 단자. 발견되면 nodeAnnotations 배열에 entry 추가, style="terminal_dot".
- 부하 placeholder (R_L, Z_L 등) — 비어 있는 점선 박스나 "?" 자리. 발견되면 loadPlaceholders 배열에 entry 추가, emphasize=true. 두 단자 node id를 betweenNodes에 명시.
- ★ 노드 전압 라벨 (V_1, V_2, V_3, V_o, V_x 등) — 회로 다이어그램에 명시된 측정 노드 라벨. 발견되면 nodeAnnotations 배열에 entry 추가, label은 정확한 라벨 그대로 ("V_1" 또는 "V_3" 등), style="label_only". 학생이 풀어야 할 query의 핵심이므로 누락 금지.
  · 라벨 번호가 V_1, V_3 같이 띄엄띄엄이어도 모두 추출 (V_2 없는 게 정상일 수 있음).
  · 노드의 attach 정보는 topologySignature.branches와 정합: V_n은 보통 어떤 vertical leg 또는 horizontal 위치의 top node.
  · 가변 저항이 vertical로 매달려 있고 그 top node가 V_1이면, nodeAnnotations에 {node:"<해당 node id>", label:"V_1", style:"label_only"} 추가.
- 가변 저항 (variable R, R 조정 문제) — 점선 박스가 없어도 "R" 라벨만 있는 vertical R이 있고 문제 본문에 "R 조정"·"가변" 언급이 있으면, loadPlaceholders에 {betweenNodes:[<top>, <bot>], label:"R", emphasize:true} 추가.
- "단자 a-b를 개방"·"R_L에 최대 전력 전달"·"V_ab를 구하시오" 같은 문제 유형 — 단자/부하 추출이 핵심. interpretation에도 명시.
- 위 두 필드는 풀이의 정답 단자/부하 위치 결정에 핵심 — 빠뜨리지 마라.

【topologySignature 추출 가이드 — circuit_theory/electronics 회로 한정】
회로의 visual 구조를 다음 두 패턴 중 어느 쪽인지 먼저 판별하고 branches를 추출:

  (1) Ladder topology (단순 mesh 1개):
      top rail에 R 직렬, vertical leg 2개(좌·우)에서 V/I source가 ground로 떨어짐.
      branches = [voltage_source_leg, current_source_leg, top_rail_resistor × N]
      meshCount = 1, hasSupermesh = false

  (2) Supermesh / multi-leg topology (mesh ≥ 2):
      top rail R 위에 vertical leg가 2개 초과로 박혀있음.
      각 vertical leg는 단일 source뿐만 아니라 SW + R + I 같은 직렬 chain일 수도 있음 (이 chain이 한 통째로 한 leg).
      그런 leg가 SW + R + I 형태면 role = "switching_leg", components = [{type:SW},{type:R},{type:I}].
      두 mesh가 공유하는 vertical chain (SW+R+I)이 supermesh를 만듦.
      meshCount ≥ 2, hasSupermesh = true (점선 표시 등으로 명시되면)

★ 헷갈리기 쉬운 case ★
  - Vertical에 SW만 보고 "switching_leg" components=[SW] 라고 하면 안 됨. 그 SW와 ground 사이에 다른 component가 있는지 (R, I 등) 반드시 트레이스해서 직렬 chain 전체를 한 branch로 묶을 것.
  - ★ V_source가 vertical인지 horizontal인지 신중히 판별 (Thevenin/dc_resistive 문제에선 horizontal V가 흔함):
    · **horizontal V (top rail series)**: V 기호가 두 R 사이 또는 두 top node 사이의 **가로 wire** 안에 끼어 있고, +/- 마크가 좌우(left/right)에 표시. 예: ─[R]─⊕V─[R]─. 이 V는 role="mesh_only_branch"로 분류하고 components=[{type:"V", value:"7V"}].
    · **vertical V (leg)**: V 기호가 top node와 GND를 잇는 **세로 wire** 안에 있고, +/- 마크가 상하(top/bottom)에 표시. role="voltage_source_leg".
    · Thevenin 문제(테브난 등가회로)는 보통 top rail에 V가 하나 끼어 있고 + vertical legs로 V/I 추가가 일반적 패턴. "horizontal V는 드물다"고 가정하지 말 것.
    · 판별 핵심: V 원 모양(○+-)이 가로 wire(─○─)에 있는지, 세로 wire(│○│)에 있는지 회로 그림 wire 방향으로 확인.
  - dependent source(VCVS/VCCS 등)도 V/I와 같은 방식으로 leg/branch 분류.

【few-shot — supermesh 8번 패턴 예시】
원본이 다음과 같은 회로:
  top rail: ─10Ω─ V1node ─10Ω─ V2node ─10Ω─
  V1node에서 GND로: 10V (왼쪽), 0.2V2 dep (병렬, 오른쪽)
  V2node에서 GND로: SW + 10Ω + 1A (직렬 chain, supermesh의 공유 가지)

→ 올바른 topologySignature.branches:
  [
    { "role": "voltage_source_leg",   "components":[{"type":"V","value":"10V"}] },
    { "role": "dependent_source_leg", "components":[{"type":"VCVS","value":"0.2V2"}] },
    { "role": "switching_leg",        "components":[{"type":"SW"},{"type":"R","value":"10Ω"},{"type":"I","value":"1A"}] },
    { "role": "top_rail_resistor",    "components":[{"type":"R","value":"10Ω"}] },
    { "role": "top_rail_resistor",    "components":[{"type":"R","value":"10Ω"}] },
    { "role": "top_rail_resistor",    "components":[{"type":"R","value":"10Ω"}] }
  ]
  features: { hasSwitch:true, hasDependentSource:true, hasGround:true, hasSupermesh:true, hasMesh:true, meshCount:2 }

→ 잘못된 추출 (절대 금지):
  - SW를 별도 leg로 빼고 R,I를 다른 leg로: GPT가 직렬 chain을 끊는 건 흔한 실수. 한 vertical chain은 한 branch.
  - dep source를 top_rail_resistor로 분류: dep는 source류 → dependent_source_leg.
  - supermesh를 평탄화해서 ladder처럼 branches 6개로 만들고 hasSupermesh=false로 처리: topology_extracted 단계에서 mesh 수를 잘못 잡으면 이후 generation·validation 모두 망가짐.

【few-shot — 6번 horizontal V (Thevenin·max_power) 패턴 예시】
원본이 다음과 같은 회로 (임용 6번):
  top rail: ─3kΩ─ ●V1 ─⊕7V─ ●V2 ─3kΩ─ ●a (단자 a)
  V1node에서 GND로: 5V (좌측 vertical V), 2mA (vertical I)
  V2node에서 GND로: 2mA (vertical I), 6kΩ (vertical R)
  단자 a-b 사이: R_L (점선 박스 부하)
  → 7V는 top rail 위 두 R 사이에 horizontal 끼임! V1·V2 vertical과 다름.

→ 올바른 topologySignature.branches:
  [
    { "role": "voltage_source_leg",   "components":[{"type":"V","value":"5V"}] },     // 좌측 vertical 5V
    { "role": "top_rail_resistor",    "components":[{"type":"R","value":"3kΩ"}] },    // 첫째 top rail R
    { "role": "mesh_only_branch",     "components":[{"type":"V","value":"7V"}] },     // ★ horizontal 7V! mesh_only_branch
    { "role": "top_rail_resistor",    "components":[{"type":"R","value":"3kΩ"}] },    // 둘째 top rail R
    { "role": "current_source_leg",   "components":[{"type":"I","value":"2mA"}] },    // 첫째 vertical I
    { "role": "current_source_leg",   "components":[{"type":"I","value":"2mA"}] },    // 둘째 vertical I
    { "role": "load_leg",             "components":[{"type":"R","value":"6kΩ"}] }     // vertical 부하 R
  ]
  + nodeAnnotations: [{node:"<단자 a node>",label:"a",style:"terminal_dot"},{node:"GND",label:"b",style:"terminal_dot"}]
  + loadPlaceholders: [{betweenNodes:["<a>","GND"],label:"R_L",emphasize:true}]

→ 잘못된 추출 (절대 금지):
  - 7V를 voltage_source_leg(vertical V)로 분류: 두 R 사이 top rail에 끼인 V는 vertical이 아니다. mesh_only_branch가 올바름.
  - 6kΩ vertical R을 top_rail_resistor로: vertical leg면 load_leg.
  - 단자 a/b·R_L 누락: nodeAnnotations·loadPlaceholders 필드에 반드시 명시.

【electronics OPAMP 회로 추출 — 절대 규칙】
- OPAMP component는 R/V/I와 동일하게 componentInventory에 모두 포함하고, topologySignature.branches에도 명시한다.
- OPAMP가 회로에 K개 있으면 inventory에 "OPAMP" K번, branches에도 K개 별도 entry.
- 단일 OPAMP / 2단 cascade / instrumentation amp / 차동입력 amp 등은 OPAMP 개수와 입력 연결로 식별 가능 → analyze가 정확히 카운트해야 generator가 올바른 archetype 선택.
- structureSignature.componentCounts.OPAMP에도 카운트 명시.
- interpretation 텍스트에 "OPAMP K단", "cascade", "두 단 OPAMP" 등 구조 묘사를 한 문장 포함시켜 키워드 기반 dispatch도 가능하게.

【few-shot — 2-OPAMP cascade 5번 패턴 예시】
원본이 다음과 같은 회로(임용 5번 (가)):
  V_2 ─R1(1kΩ)─ U1(+/-) ─ U1.out ─R(1kΩ)─ V_1 (와 R(1kΩ) 통해 GND)
  U1.out ─ U2(+/-) ─ V_o, feedback R_f(4kΩ)
  → OPAMP 2개 직렬 (U1 → U2), 입력 V_1·V_2, 출력 V_o.

→ 올바른 componentInventory:
  [{type:"OPAMP"},{type:"OPAMP"},{type:"R"},{type:"R"},{type:"R"},{type:"R"},{type:"R"},{type:"V"},{type:"V"}]

→ 올바른 structureSignature.componentCounts:
  { OPAMP: 2, R: 5, V: 2 }

→ interpretation 예: "OPAMP 두 단을 직렬 cascade한 회로로 두 입력 V_1·V_2로부터 V_o 출력 도출."

【★ digital_logic 다중-K-map / 다중-함수 추출 절대 규칙】

K-map 문제를 분석할 때 ★ K-map 개수와 차원을 정확히 카운트 ★:

(1) K-map 차원 = 변수 개수 결정
  - 2x2 → 2-변수 (A, B)
  - 2x4 → 3-변수 (A, B, C)
  - 4x4 → 4-변수 (A, B, C, D)
  - 4x8 → 5-변수 (A, B, C, D, E)

  ★ 4x4 K-map은 4-변수다 ★ — 3-변수로 줄여 보지 말 것.
  행 라벨이 AB(00,01,11,10) + 열 라벨이 CD(00,01,11,10)이면 4-변수.

(2) K-map 개수 = 함수 개수
  - 원본에 K-map이 4개 그려져 있으면 → 함수 4개 (f_1, f_2, f_3, f_4)
  - K-map이 2개면 → 함수 2개 (F, G 또는 X, Y)
  - 절대 임의로 줄이지 말 것 (4개 → 2개로 축소 금지).

(3) signals 추출
  - inputs: 모든 K-map에 공통으로 사용된 변수 (예: [A, B, C, D])
  - outputs: 함수 이름 = K-map title (예: [f_1, f_2, f_3, f_4] 또는 [Z] if 통합 출력)
  - 만약 통합 출력 Z가 OR/AND로 결합되면 outputs에는 Z만 두고 interpretation에 "f_1, f_2, ... → Z 결합" 명시.

(4) interpretation에 ★ 함수 이름과 minterm 표기 명시 ★
  - "f_1 = Σm(1,2,3,7,9)" 형식으로 각 함수 적기.
  - K-map 4개·변수 4개·결합 게이트 OR/AND를 명확히 설명.
  - "각 함수의 최소합" / "f_1, f_2, ..." / "Σm(...)" 표기 보존.

(5) ★ intermediateSignals 추출 — multi-stage gate network 보존 ★
  signals.intermediateSignals에 ★ 게이트 사이 wire 이름 명시 ★ 하라:
  - 회로에 명시된 중간 출력(X, Y 등)이 있으면 ["X","Y"] 등으로.
  - 원본의 multi-stage 구조 절대 평탄화하지 말 것 (예: f_1·f_2·f_3·f_4를
    하나의 OR로 직접 묶는 식으로 단순화 금지).
  - 회로가 (f_1 ∧ f_2) → X, (f_3 ∨ f_4) → Y, (X ⊕ Y) → Z 같이 stage가
    있으면 X, Y를 intermediateSignals에 넣고 outputs는 [Z].
  - 명시 라벨이 없어도 multi-stage 구조면 자동 라벨(X1, X2, ...) 부여.

  ★ 절대 금지 ★: f_1·f_2·f_3·f_4를 하나의 OR/AND 게이트에 직접 연결한
  단순 형태로 환원 (원본 회로의 multi-stage 구조 손실).

★ 잘못된 추출 (절대 금지) ★:
  - 4-변수 K-map(4x4)을 3-변수(2x4)로 잘못 읽기 — 행/열 라벨 무시
  - 4개 함수(f_1..f_4)를 2개 출력(F, G)으로 축소
  - Σm 표기를 임의로 제거
  - 4-변수 문제를 combinational_gate(3-var) 형식으로 단순화

(이 케이스는 분류기가 universal_digital path로 라우팅하여 multi-K-map +
결합 회로 layout이 자동 적용된다.)

【digital_logic MUX 등가구현 — 절대 추출 규칙】
원본 figure에 사다리꼴 box (좌측에 I_0·I_1·I_2·I_3, 하단에 S_0·S_1, 우측에 F) 또는 "MUX"/"멀티플렉서" 라벨이 있는 figure가 보이면, 이 문제는 MUX 등가구현 형식(임용 5번 형식)이다. 반드시:
- topic 또는 interpretation에 "MUX" 또는 "멀티플렉서"라는 정확한 단어를 포함시킬 것. (예: "조합논리회로를 4×1 MUX로 등가구현")
- relatedConcepts 배열에 다음 단어를 모두 명시: ["멀티플렉서", "MUX", "선택선", "S_0", "S_1", "I_0", "I_1", "POS", "SOP"] (최소 5개 이상)
- topicKey는 "combinational_gate" 사용 (별도 mux topicKey 없음)
- figureRequirements에는 (가) implementation_circuit + (나) MUX figure 두 개 모두 명시: {role:"main_circuit", diagramType:"logic_network", scope:"single", required:true}, {role:"implementation_circuit", diagramType:"mux_diagram", scope:"single", required:true}
- 학생 채울 빈칸이 MUX 입력에 표시(㉠, ㉡ 등)되어 있으면 fillInTheBlanks에 marker와 함께 명시.

→ 잘못된 추출 (절대 금지):
- MUX 모양(사다리꼴+I·S·F 핀)을 보고도 topic에 "조합논리회로 구현"이라고만 적고 "MUX" 단어 누락
- relatedConcepts에 "AND·OR·NOT" 같은 일반 단어만 적고 "멀티플렉서"·"선택선" 단어 누락
- (나) 두 번째 figure를 누락하고 단일 figure로 처리

【★ 절대 규칙: semantic node = role-based 식별】
topologySignature.branches의 모든 node id는 ★ semantic role을 가지는 노드 ★ 여야 한다.

semantic role (정확히 4가지):
  - ground:        GND 노드. 회로의 0V 기준.
  - source_plus:   V/I 소스의 비-GND 단자 (V의 +단자 / I의 입력측).
  - main_unknown:  주 측정 노드. 가변 R 또는 R_L(부하 placeholder)이 매달려 학생이 풀어야 할 핵심 노드.
  - right_unknown: 보조 측정 노드. 고정 R load가 매달리거나 또 다른 측정 라벨이 있는 노드.

★ 절대 만들지 말 것 ★:
  - 위 4 role 중 어느 것에도 해당하지 않는 노드 (junction/intermediate/anonymous)
  - 같은 두 role 노드 사이의 직렬 chain을 위한 중간 노드
  - 두 horizontal R이 연결되어 보여도 그 사이가 어떤 role도 아니면 별도 node 만들지 말 것
    → 같은 두 role 노드 사이 1개 R로 통합 (값이 다르면 직렬 합산 또는 평행 합산은 회로해석상 부적절,
       이 경우 분석이 모호한 거니 주의)

bend point·lane point·virtual point 같은 routing artifact는 ★ 분석 결과에 포함되지 않는다 ★.
시각적 분기점은 renderer가 layout 시 별도로 처리.

role 부여 방법 — 각 추출한 node에 대해 nodeAnnotations에 role 명시:
  [
    { node: "<id_a>", label: "<원본 라벨 또는 V_s>", style: "label_only", role: "source_plus" },
    { node: "<id_b>", label: "<원본 라벨>",          style: "label_only", role: "main_unknown" },
    { node: "<id_c>", label: "<원본 라벨>",          style: "label_only", role: "right_unknown" },
    { node: "GND",    label: "GND",                  style: "label_only", role: "ground" }
  ]

★★ source_plus role 무조건 부여 — 누락 절대 금지 ★★
원본 figure에서 V 소스의 +단자 노드에 라벨이 없어도 (대부분의 imyong DC 문제에서 그렇다)
nodeAnnotations에 ★ 반드시 ★ 한 entry 추가하라:
  { node: "<V·+ 단자 node id>", label: "V_s", style: "label_only", role: "source_plus" }

- node id는 voltage_source_leg의 betweenNodes[0]과 일치시킬 것.
- label은 원본에 표기가 없으면 "V_s" 또는 그냥 빈 문자열 가능 — role 부여가 핵심.
- 이 entry 누락 시 layout/repair 단계가 V 소스를 식별 못 해 figure가 망가짐.

표준 형식 — 2-node Nodal DC (가장 흔한 universal_dc 케이스):
  semantic node 정확히 4개 + role 모두 부여.
  branches:
    V (source):       source_plus ↔ ground
    R_VAR (가변):     main_unknown ↔ ground
    R (load):         right_unknown ↔ ground
    parallel(R + I):  main_unknown ↔ right_unknown
    R (top):          source_plus ↔ main_unknown (≥ 1개)

판별 기준: figure에서 명시 라벨(V_1·V_2·V_3·V_o·a·b 등)이 보이는 위치 + V 소스 +단자만 semantic.
horizontal R 두 개가 직렬로 보여도 그 사이가 어떤 role도 부여할 만한 회로상 특징이 없으면
같은 두 role 노드 사이 1개 R로 통합 추출.

【★ 절대 규칙: dangling node 금지 — node degree ≥ 2】
topologySignature.branches에서 ★ 모든 non-ground node id는 최소 2개의 branch에 등장해야 한다 ★.
한 component(branch)에만 등장하는 node는 floating pin이고, validator가 "netlist_dangling_node" /
"analog_circuit_open" rule로 reject한다. 회로 figure가 생성되지 않고 사용자에게 노출되지 않는다.

이 규칙은 위 "semantic role" 규칙의 따름정리:
  - 모든 node는 4 role 중 하나여야 한다 → role 있는 노드는 자연히 회로에 묶여 degree ≥ 2.
  - role도 없고 degree=1인 노드는 phantom — 추출 자체가 잘못.

★ 흔한 실수 케이스: 위아래로 쌓인(stacked) 두 R을 직렬 + 중간 junction으로 잘못 추출 ★

  원본 회로에서 같은 x 위치 범위에 두 R이 위아래로 나란히 그려져 있다면:
  → 이는 ★ 같은 두 노드 사이의 평행 가지(parallel branch) ★. 직렬 아님.
  → 시각: 양 끝이 같은 vertical wire에 연결되고 가운데에 R 두 개가 stack.

  잘못된 추출 ✗:
    branches = [
      { role:"top_rail_resistor", components:[{type:"R",value:"20Ω"}], betweenNodes:["A","n_mid"] },
      { role:"top_rail_resistor", components:[{type:"R",value:"20Ω"}], betweenNodes:["n_mid","B"] }
    ]
    → 두 R을 직렬로 보고 중간에 n_mid 만듦. n_mid는 어디에도 라벨 없는 phantom.

  올바른 추출 ✓:
    branches = [
      { role:"top_rail_resistor", components:[{type:"R",value:"20Ω"}], betweenNodes:["A","B"] },
      { role:"top_rail_resistor", components:[{type:"R",value:"20Ω"}], betweenNodes:["A","B"] }
    ]
    → 같은 betweenNodes로 두 entry. 자동으로 평행 가지(mesh +1)로 처리.

  판별: 두 R의 좌·우 끝점이 같은 vertical wire(또는 같은 node label)에 연결되어 있는가?
    YES → 평행 (같은 betweenNodes)
    NO  → 직렬 (다른 betweenNodes, 단 중간 노드는 명시 라벨이 있어야 함)

★ 흔한 실수 케이스: ㄱ-자(L-shape) R을 horizontal + vertical 두 branch로 이중 추출 ★

  원본 회로에서 가장 우측 측정 노드(role: right_unknown)에서 우측·아래로 ㄱ-자로 꺾여
  GND에 떨어지는 R이 종종 있다. 이 R은 ★ 물리적으로 1개 ★.

  잘못된 추출 ✗ (validator가 reject함):
    branches = [
      { role:"top_rail_resistor", components:[{type:"R",value:"10Ω"}], betweenNodes:["right_unknown 노드", "n_right"] },
      { role:"load_leg",          components:[{type:"R",value:"10Ω"}], betweenNodes:["right_unknown 노드", "GND"] }
    ]
    → 같은 ㄱ-자 R을 두 번 추출. n_right는 어디에도 다른 연결 없는 phantom.

  올바른 추출 ✓:
    branches = [
      { role:"load_leg", components:[{type:"R",value:"10Ω"}], betweenNodes:["right_unknown 노드", "GND"] }
    ]
    → ㄱ-자 R 하나만 load_leg로. n_right 같은 phantom 노드 생성 X.

  판별: 우측 끝 R 다음에 ★ 명시 단자 a/b ●표시나 V 라벨이 있는가? ★
    YES → 그 노드는 측정점 → nodeAnnotations에 role 부여 가능 → 정당.
    NO  → ㄱ-자로 GND에 닿는 단일 R → load_leg 하나로만 추출.

좌·우 모든 끝 column에 동일 적용. role 부여 불가능한 노드 = phantom = 만들지 말 것.

【circuit_theory Multi-step DC + 가변 R — 절대 추출 규칙】
회로에 (a) DC 전원(V·I)이 있고 (b) C/L이 없으며 (c) 다음 중 하나가 있으면 "Multi-step DC + 가변 R" 형식이다:
- 회로에 가변 R 표시(점선 박스 또는 "R"만 단독 라벨된 vertical R)
- 본문에 [단계 1]…[단계 2]…[단계 3] 같은 다단계 풀이 절차
- 본문에 "R을 조정하여 V_x = N V 되도록" 같은 inverse 패턴

이 케이스는 archetype-free path(universal_dc)로 처리되므로 추출 정확도가 핵심:

(1) topologySignature.branches 빠짐없이 추출
   - top_rail_resistor: 상단 가로 R 각각을 1 branch
   - voltage_source_leg: 수직 V 소스 leg
   - current_source_leg: 수직 I 소스 leg
   - load_leg: 수직 R leg (가변 R도 load_leg). 가변 R 식별 후 별도 loadPlaceholders entry 추가.
   - V·I·R 개수가 누락 없이 componentInventory에도 정확히 카운트.
(2) nodeAnnotations에 모든 V_n / V_x 라벨 추출
   - 회로의 각 측정 노드 label("V_1", "V_3" 등)을 정확히 (style="label_only").
   - 띄엄띄엄(V_1, V_3) 정상 — V_2 없어도 둘 다 추출.
(3) loadPlaceholders에 가변 R 추가
   - {betweenNodes:[top_node, GND], label:"R", emphasize:true}
(4) fillInTheBlanks에 [단계 N] 라벨된 step 5개 (각 단계 + 알려진 조건)
(5) interpretation에 "가변", "R 조정", "V_x = N V 되도록" 같은 키워드 명시.

【few-shot — 임용 10번 패턴 (2 전원: V_s + I_s, 5R + 가변 R, 3단계 query)】
원본 회로:
  top rail: 20Ω - V_1 - 20Ω - (중간) - 10Ω - V_3
  V_1에서 GND로: 가변 R (vertical, "R" 라벨)
  V_3에서 GND로: 10Ω (vertical)
  20V 수직 전압원이 top rail 좌측 끝
  0.5A 수평 전류원이 (중간)→V_3 방향으로 top rail에 끼어있음

→ 올바른 topologySignature.branches (role-based, ★ node id는 회로별로 달라도 됨, role이 본질 ★):
  node ids 예: n_a(source_plus), n_b(main_unknown), n_c(right_unknown), GND.
  [
    { "role":"top_rail_resistor", "components":[{"type":"R","value":"20Ω"}], "betweenNodes":["n_a","n_b"] },
    { "role":"top_rail_resistor", "components":[{"type":"R","value":"10Ω"}], "betweenNodes":["n_b","n_c"] },
    { "role":"mesh_only_branch",  "components":[{"type":"I","value":"0.5A"}], "betweenNodes":["n_b","n_c"] },
    { "role":"voltage_source_leg","components":[{"type":"V","value":"20V"}], "betweenNodes":["n_a","GND"] },
    { "role":"load_leg",          "components":[{"type":"R","value":"R"}],   "betweenNodes":["n_b","GND"] },
    { "role":"load_leg",          "components":[{"type":"R","value":"10Ω"}], "betweenNodes":["n_c","GND"] }
  ]
  features: { hasGround:true, hasMesh:true, meshCount:3 }

→ 올바른 nodeAnnotations (★ role 부여 필수 ★):
  [
    { "node":"n_a", "label":"V_s",  "style":"label_only", "role":"source_plus" },
    { "node":"n_b", "label":"V_1",  "style":"label_only", "role":"main_unknown" },
    { "node":"n_c", "label":"V_3",  "style":"label_only", "role":"right_unknown" },
    { "node":"GND", "label":"GND",  "style":"label_only", "role":"ground" }
  ]
  - label은 원본 figure에 보이는 그대로 (V_1, V_3 등 sparse 명명 OK).
  - role은 회로 구조상의 역할(★ 라벨과 무관 ★).

→ 올바른 loadPlaceholders:
  [{ "betweenNodes":["n_b","GND"], "label":"R", "emphasize":true }]

→ interpretation 예: "20V 직류 전원과 0.5A 전류원, 5개 저항(가변 R 포함)이 있는 회로. [단계 1] R=10Ω일 때 V_1·V_3 도출. [단계 2] 소비 전력 P_total. [단계 3] V_3=3.8V 되도록 R 조정 → R 값과 V_1."

→ 잘못된 추출 (절대 금지):
- "R" 단독 라벨 vertical R을 일반 저항으로 처리 (loadPlaceholders 누락)
- V_1·V_3 라벨이 보이는데 nodeAnnotations에 등록 안 함
- "0.5A" 전류원을 vertical source_leg로 추출 (원본이 horizontal mesh_only_branch면)
- 다단계 step이 있는데 fillInTheBlanks에 [단계 N] 라벨 누락
- C/L 없는 순수 DC인데 topicKey를 transient_rc·rlc_response 같은 걸로 잘못 지정
- ★ V_3 우측 끝의 10Ω을 horizontal top_rail_resistor + 별도 vertical load_leg로 이중 추출:
  같은 컴포넌트(ㄱ-자로 꺾여 vertical로 GND에 떨어지는 R)를 한 번만 추출. n_right 같은
  단자 라벨이 명시된 게 아니면 phantom 노드 만들지 말 것. (dangling node 금지 규칙)

【topologySignature.branches.betweenNodes — 4-mesh 이상 회로 정확 재현용】
회로의 mesh 개수가 3개 이상이거나 평행 branch가 있으면 **반드시 betweenNodes 필드 명시**.
미지정 시 branches가 순차 ladder로 배치되어 mesh 개수가 줄어 원본과 다른 회로로 생성된다.

표기:
  { "role":"top_rail_resistor", "components":[{"type":"R","value":"20Ω"}], "betweenNodes":["n_left","n_v1"] }
  { "role":"mesh_only_branch",  "components":[{"type":"I","value":"0.5A"}], "betweenNodes":["n_v1","n_v3"] }
  { "role":"top_rail_resistor", "components":[{"type":"R","value":"20Ω"}], "betweenNodes":["n_v1","n_v3"] }  ← 위와 평행 branch!

node id 컨벤션: GPT가 의미 있게 부여 (예: "n_left", "n_v1", "n_v3" 또는 "n0", "n1", "n2"). 단 GND/ground/0은 모두 ground로 인식됨.

【few-shot — 4-mesh 회로 (임용 10번 형식)】
원본 회로:
  top rail: 20Ω - V_1 - 20Ω(평행 가지 1) || I=0.5A(평행 가지 2) - V_3 - 10Ω(top R)
  여기서 V_1과 V_3 사이에 두 평행 가지 (20Ω + I_s) 가 동시에 존재 → 4 mesh.
  vertical: V_s(20V)@n_left, R(가변)@V_1, 10Ω@V_3.

→ 올바른 topologySignature.branches:
[
  { "role":"top_rail_resistor", "components":[{"type":"R","value":"20Ω"}], "betweenNodes":["n_left","n_v1"] },
  { "role":"top_rail_resistor", "components":[{"type":"R","value":"20Ω"}], "betweenNodes":["n_v1","n_v3"] },
  { "role":"mesh_only_branch",  "components":[{"type":"I","value":"0.5A"}], "betweenNodes":["n_v1","n_v3"] },
  { "role":"top_rail_resistor", "components":[{"type":"R","value":"10Ω"}], "betweenNodes":["n_v3","n_right"] },
  { "role":"voltage_source_leg","components":[{"type":"V","value":"20V"}], "betweenNodes":["n_left","GND"] },
  { "role":"load_leg",          "components":[{"type":"R","value":"R"}],   "betweenNodes":["n_v1","GND"] },
  { "role":"load_leg",          "components":[{"type":"R","value":"10Ω"}], "betweenNodes":["n_v3","GND"] }
]
nodeAnnotations:
[
  { "node":"n_v1", "label":"V_1", "style":"label_only" },
  { "node":"n_v3", "label":"V_3", "style":"label_only" }
]
features: { hasGround:true, hasMesh:true, meshCount:4 }

→ 잘못된 추출 (절대 금지):
- betweenNodes 누락 → branches 순차 배치 → mesh 개수 부족 (3 mesh가 되어 원본과 다른 직사각형 회로 생성)
- meshCount 잘못 추출 (실제 4인데 2·3으로)
- 평행 가지가 있는데 한쪽만 추출 (예: 20Ω 평행을 일렬로 직렬 배치)
- node id를 GPT가 임의로 바꿔서 nodeAnnotations와 branches가 다른 이름 쓰는 경우 (반드시 동일 node id 사용)`;
}

function isValidAnalysis(x: unknown, subject: SubjectKey): x is AnalysisResult {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.topic !== "string" || typeof o.interpretation !== "string") return false;
  if (!Array.isArray(o.relatedConcepts) || !o.relatedConcepts.every((c) => typeof c === "string")) return false;
  if (!Array.isArray(o.fillInTheBlanks)) return false;
  if (!o.fillInTheBlanks.every(
    (b) => b && typeof b === "object" &&
      typeof (b as Record<string, unknown>).sentence === "string" &&
      typeof (b as Record<string, unknown>).answer === "string"
  )) return false;
  // optional topicKey: 있으면 subject의 토픽 목록 안에 있어야 함.
  // ★ invalid topicKey (cross-subject 등)는 reject 대신 silently clear — analyze 통과시켜
  //   classify가 키워드 기반 fallback으로 결정. 이 reject로 인해 generate가 GPT free path로
  //   빠져 사용자 "GPT 회로 생성 금지" contract를 우회하던 결함 해결.
  if (o.topicKey !== undefined) {
    if (typeof o.topicKey !== "string") {
      delete o.topicKey;
    } else {
      const allowed = TOPICS_BY_SUBJECT[subject] as readonly string[];
      if (!allowed.includes(o.topicKey)) {
        delete o.topicKey;
      }
    }
  }
  // optional semantic: 있으면 4-flag boolean 객체여야 함
  if (o.semantic !== undefined) {
    const s = o.semantic as Record<string, unknown>;
    const flags = ["hasStateTransition", "hasEquivalentTransformation", "hasWaveformEvolution", "requiresMultiFigure"];
    if (!s || typeof s !== "object") return false;
    if (!flags.every((k) => typeof s[k] === "boolean")) return false;
  }
  // optional signals: 있으면 inputs/outputs 모두 string[]
  if (o.signals !== undefined) {
    const s = o.signals as Record<string, unknown>;
    if (!s || typeof s !== "object") return false;
    if (!Array.isArray(s.inputs) || !s.inputs.every((x) => typeof x === "string")) return false;
    if (!Array.isArray(s.outputs) || !s.outputs.every((x) => typeof x === "string")) return false;
  }
  // optional structureSignature: 있으면 inputCount/outputCount/figureCount는 number
  if (o.structureSignature !== undefined) {
    const s = o.structureSignature as Record<string, unknown>;
    if (!s || typeof s !== "object") return false;
    if (typeof s.inputCount !== "number") return false;
    if (typeof s.outputCount !== "number") return false;
    if (typeof s.figureCount !== "number") return false;
    // 나머지는 옵셔널이므로 패스
  }
  // optional figureRequirements: 있으면 각 항목 shape 체크
  if (o.figureRequirements !== undefined) {
    if (!Array.isArray(o.figureRequirements)) return false;
    const validRoles = ["kmap","truth_table","implementation_circuit","waveform","state_diagram","equivalent_circuit","main_circuit"];
    const validTypes = ["kmap","truth_table","logic_network","waveform","analog_netlist","concept_diagram"];
    const validScopes = ["per_output","combined","per_state","single"];
    for (const r of o.figureRequirements) {
      if (!r || typeof r !== "object") return false;
      const rr = r as Record<string, unknown>;
      if (typeof rr.role !== "string" || !validRoles.includes(rr.role)) return false;
      if (typeof rr.diagramType !== "string" || !validTypes.includes(rr.diagramType)) return false;
      if (typeof rr.scope !== "string" || !validScopes.includes(rr.scope)) return false;
      if (typeof rr.required !== "boolean") return false;
    }
  }
  return true;
}

/**
 * 이미지 + 과목으로 임용 문제를 분석.
 * @throws AnalyzeError — 응답 파싱/스키마 실패 시
 */
export async function analyzeImage(args: {
  image: string;       // base64 (data: prefix 없음)
  subject: SubjectKey;
}): Promise<AnalysisResult> {
  const { image, subject } = args;
  const openai = getOpenAI();
  const prompt = buildPrompt(subject);

  log.info("요청", { subject, imageBytes: image.length });

  // Phase 2: Structured Outputs (json_schema strict) — 핵심 필드 schema 강제.
  // GPT가 topologySignature.branches·nodeAnnotations·loadPlaceholders 같은
  // 중요 필드를 누락하던 문제 해결. strict mode 제약 때문에 nullable은 ["type","null"].
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" } },
        { type: "text", text: prompt },
      ],
    }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ImageAnalysis",
        strict: true,
        schema: buildAnalysisSchema(subject),
      },
    },
    max_tokens: 2200,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new AnalyzeError("JSON 파싱 실패", { cause: e });
  }
  if (!isValidAnalysis(parsed, subject)) {
    log.error("스키마 불일치", { sample: JSON.stringify(parsed).slice(0, 300) });
    throw new AnalyzeError("스키마 불일치 (topicKey가 유효 목록을 벗어났을 수 있음)");
  }

  // 빈칸 5개 보정
  if (parsed.fillInTheBlanks.length !== 5) {
    log.warn("빈칸 개수 5 아님 — 트리밍/패딩", { got: parsed.fillInTheBlanks.length });
    parsed.fillInTheBlanks = parsed.fillInTheBlanks.slice(0, 5);
    while (parsed.fillInTheBlanks.length < 5) {
      parsed.fillInTheBlanks.push({ sentence: "(추가 빈칸 미생성)", answer: "" });
    }
  }

  // ★ topologySignature가 있으면 envelope를 server-side에서 derive
  if (parsed.topologySignature && isValidTopologySignature(parsed.topologySignature)) {
    parsed.structuralEnvelope = buildStructuralEnvelope(parsed.topologySignature);
    log.info("topology_extracted", {
      family: parsed.topologySignature.family,
      features: parsed.topologySignature.features,
      branches: parsed.topologySignature.branches.map((b) => ({
        role: b.role,
        components: b.components.map((c) => c.value !== undefined ? `${c.type}(${c.value})` : c.type),
      })),
    });
    log.info("envelope_derived", {
      branchCount: parsed.topologySignature.branches.length,
      meshCount: parsed.topologySignature.features.meshCount,
      requiredFeatures: parsed.structuralEnvelope.requiredFeatures,
      requiredBranchRoles: parsed.structuralEnvelope.requiredBranchRoles,
    });
  } else if (parsed.topologySignature) {
    log.warn("topologySignature 형태 불량 — envelope 생략");
    delete parsed.topologySignature;
  } else {
    log.warn("topologySignature 누락 — exam_similar 모드에서 topology 보존 불가");
  }

  log.info("완료", { topic: parsed.topic, concepts: parsed.relatedConcepts.length });
  return parsed;
}

function isValidTopologySignature(x: unknown): x is TopologySignature {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.subjectKey !== "string" || typeof o.family !== "string") return false;
  if (!o.features || typeof o.features !== "object") return false;
  if (!Array.isArray(o.branches)) return false;
  for (const b of o.branches) {
    if (!b || typeof b !== "object") return false;
    const br = b as Record<string, unknown>;
    if (typeof br.role !== "string") return false;
    if (!Array.isArray(br.components)) return false;
    for (const c of br.components) {
      if (!c || typeof c !== "object") return false;
      if (typeof (c as Record<string, unknown>).type !== "string") return false;
    }
  }
  return true;
}

export class AnalyzeError extends Error {
  constructor(message: string, opts?: ErrorOptions) {
    super(message, opts);
    this.name = "AnalyzeError";
  }
}
