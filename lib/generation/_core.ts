import { randomUUID } from "node:crypto";
import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SUBJECT_HINT, SUBJECT_GUIDE, SYSTEM_PROMPT } from "@/lib/prompts";
import { resolveRules } from "@/lib/rules";
import { expandFigureRequirements } from "@/lib/analysis/figureRequirements";
import {
  GENERATION_MODE_LABEL,
  SUBJECT_LABEL,
  TOPICS_BY_SUBJECT,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type GenerationPolicy,
  type SemanticStructure,
  type SubjectKey,
  type TopicKey,
} from "@/types";
import { validateFigures, validateProblem, type ValidationIssue } from "@/lib/validators";
import { validateFigureRequirements } from "@/lib/validators/validateFigureRequirements";
import { validateStructureSignature } from "@/lib/validators/validateStructureSignature";
import { validateByStructureSignature } from "@/lib/validators/validateByStructureSignature";
import { validateStructuralEnvelope } from "@/lib/validators/validateStructuralEnvelope";
import { validateTopologyPreserved } from "@/lib/validators/validateTopologyPreserved";
import { validateAnswerSolution } from "@/lib/validators/validateAnswerSolution";
import { generateStrictAnalogProblems, shouldUseStrictPipeline } from "./strictAnalogPipeline";
import { autoCloseAnalogDangling } from "./autoCloseAnalogDangling";
import {
  normalizeAnalogProblems,
  isTerminalAnalogFamily,
  terminalAnalogRepair,
  validateTerminalAnalogNetwork,
} from "./analogNormalizer";
import { repairProblemsBySignature } from "./repairBySignature";
import { resolvePolicy } from "./resolvePolicy";

const log = createLogger("lib/generation/_core");

/** validator 룰 중 재생성을 트리거하는 critical 규칙들 */
const CRITICAL_RULES = new Set<string>([
  // validateProblem
  "missing_figure_variant",
  "missing_topology",
  "figure_reference_without_renderable",
  // analog_netlist
  "netlist_renderable",
  "netlist_dangling_node",
  "netlist_missing",
  // logic_network
  "logic_network_invalid",
  "logic_network_missing",
  // kmap
  "kmap_invalid",
  "kmap_shape",
  // multi-output 보존
  "multi_output_lost",
  // figure requirements (per_output kmap 등)
  "figure_requirement_missing",
  // 변수명 임의변경 금지
  "signal_name_changed",
  // 회로 구조 보존
  "structure_signature_mismatch",
  // 새 envelope/topology 보존
  "structural_envelope_violation",
  "topology_not_preserved",
  // answer/solution 품질
  "answer_empty",
  "answer_placeholder",
  "answer_no_digit",
  "answer_too_abstract",
  "solution_too_short",
  "solution_placeholder",
  "solution_no_digit",
  // terminal analog (Thevenin/Norton/dc_resistive) 자동 보정 실패
  "terminal_analog_repair_failed",
]);

/** 한 attempt = GPT 1회 호출 + JSON 파싱 + 스키마 검증 */
const MAX_ATTEMPTS = 3;

/**
 * 모드 정책 → GPT 지시문 (자연어). exam_similar/exam_variant 분기.
 */
function buildPolicyDirective(policy: GenerationPolicy): string {
  if (policy.mode === "exam_similar") {
    return [
      `[모드: ${GENERATION_MODE_LABEL[policy.mode]} (${policy.mode})]`,
      "- 원본 문제의 회로 토폴로지(노드 연결·소자 종류·소자 위치·소자 개수)를 그대로 유지.",
      "- 문항 구조(질문 형식·구하는 미지수·조건 항목 수)도 원본과 동일.",
      "- 소자 값(저항·전압·전류·커패시터·인덕터 등의 수치)만 새로 설정.",
      "- 소자 종류 교체·추가·제거 금지. 위치 변경 금지.",
      "- 입력·출력 변수명(A,B,C,X,Y,Z 등)은 원본 그대로 유지. 임의 rename 금지 (C→D 같은 변경 금지).",
      "- 디지털논리: K-map의 cell 값(0/1)은 새로 설정 가능. 단, 변수 개수·이름·차원은 원본 그대로.",
    ].join("\n");
  }
  return [
    `[모드: ${GENERATION_MODE_LABEL[policy.mode]} (${policy.mode})]`,
    "- 원본 문제의 핵심 구조와 해석 원리(같은 family) 동일 유지.",
    "- 소자 값(수치)은 자유롭게 새로 설정.",
    "- 소자 종류는 1~2개까지만 다른 종류로 변경 가능.",
    "- 회로 골격이 유지되도록 변경 범위는 최소한으로.",
    "- 입력·출력 변수명은 원본 그대로 유지. 변수 개수도 원본과 동일 (multi-output이면 그대로 multi-output).",
  ].join("\n");
}

/** 사용자 prompt(텍스트 부분) 빌드. system은 별도. */
function buildUserPrompt(args: {
  subject: SubjectKey;
  policy: GenerationPolicy;
  count: number;
  analysis?: AnalysisResult | null;
  topicKey?: TopicKey;
  semantic: SemanticStructure;
}): string {
  const { subject, policy, count, analysis, topicKey, semantic } = args;
  const ruleSet = resolveRules({ subject, topicKey, semantic });
  const expandedReqs = analysis ? expandFigureRequirements(analysis) : [];
  const reqLines = expandedReqs
    .map((r) => `  - role=${r.role}, diagramType=${r.diagramType}, scope=${r.scope}${
      r.target !== undefined ? `, target=${Array.isArray(r.target) ? r.target.join("+") : r.target}` : ""
    }${r.label ? `, label="${r.label}"` : ""}${r.required ? "" : ", required=false"}`)
    .join("\n");

  // ★ 별도 vision 호출로 추출한 component inventory — type별 개수 floor를 강제
  const inventory = analysis?.componentInventory;
  const inventoryBlock = inventory && inventory.length > 0
    ? (() => {
        const counts: Record<string, number> = {};
        for (const c of inventory) {
          const t = (c.type ?? "").toUpperCase();
          counts[t] = (counts[t] ?? 0) + 1;
        }
        return `[★ ORIGINAL_COMPONENT_INVENTORY — vision 추출. 다음 type별 count 이상으로 반드시 포함]\n` +
          `  ${JSON.stringify(counts)}\n` +
          `  · 각 type별 개수 floor — 부족하면 critical fail.\n` +
          `  · 예: R:3, V:2, I:2 → 생성 회로에 R 3개·V 2개·I 2개 이상.\n` +
          `  · 원본 inventory: ${JSON.stringify(inventory.map((c) => c.value ? `${c.id}(${c.type},${c.value})` : `${c.id}(${c.type})`))}\n`;
      })()
    : "";

  const ssig = analysis?.structureSignature;
  const ssigBlock = ssig
    ? `[원본 구조 시그니처 — STRUCTURE_PRESERVATION_CONTRACT (${policy.mode === "exam_similar" ? "정확 일치" : "±1 허용"})]\n` +
      `  inputCount: ${ssig.inputCount}\n` +
      `  outputCount: ${ssig.outputCount}\n` +
      `  figureCount: ${ssig.figureCount}\n` +
      (ssig.gateCounts ? `  gateCounts: ${JSON.stringify(ssig.gateCounts)}\n` : "") +
      (ssig.totalGateCount !== undefined ? `  totalGateCount: ${ssig.totalGateCount}\n` : "") +
      (ssig.componentCounts ? `  componentCounts: ${JSON.stringify(ssig.componentCounts)}\n` : "") +
      (ssig.totalComponentCount !== undefined ? `  totalComponentCount: ${ssig.totalComponentCount}\n` : "") +
      ((ssig as { productTermGateCount?: number }).productTermGateCount !== undefined
        ? `  productTermGateCount: ${(ssig as { productTermGateCount?: number }).productTermGateCount}\n`
        : "") +
      ((ssig as { outputCombinerGateCount?: number }).outputCombinerGateCount !== undefined
        ? `  outputCombinerGateCount: ${(ssig as { outputCombinerGateCount?: number }).outputCombinerGateCount}\n`
        : "") +
      (ssig.blankCount !== undefined && ssig.blankCount > 0
        ? `  blankCount: ${ssig.blankCount}\n  · ★ 원본에 학생이 푸는 빈칸이 ${ssig.blankCount}개 있음 → logic_network.blanks 배열에 distinct symbol ${ssig.blankCount}개 (예: ⓐ, ⓑ) 필수 생성. blanks 누락 시 retry.\n  · 각 blank: { symbol:"ⓐ", gateIds:["G_x"], answer:"AND" } 형식. gates 배열의 해당 게이트 type은 정답 그대로 채워두되, 시각적으로는 빈칸으로 가려짐.\n`
        : "") +
      `  · 위 카운트를 그대로 보존. 게이트 종류·개수·계층 구조 단순화 금지.\n`
    : "";

  // ★ topologySignature/structuralEnvelope 블록 — mode별 분기
  const topoBlock = (() => {
    if (!analysis) return "";
    if (policy.mode === "exam_similar" && analysis.topologySignature) {
      const ts = analysis.topologySignature;
      const branchLines = ts.branches
        .map((b, i) => `    ${i + 1}. role="${b.role}" components=${
          b.components.map((c) => c.value !== undefined ? `${c.type}(${c.value})` : c.type).join(" → ")
        }`)
        .join("\n");
      return `[★ TOPOLOGY_PRESERVATION_CONTRACT — exam_similar 모드]
원본 회로의 위상을 정확히 보존. branch 개수·role·components 모두 일치.
- features: ${JSON.stringify(ts.features)}
- branches (총 ${ts.branches.length}개):
${branchLines}
※ 위 branch 목록과 동일한 구성·role·개수로 생성. 값(value)만 새로 설정.
※ **각 branch의 role을 정확히 보존** — 원본 목록의 role을 그대로 유지. role을 바꿔서 위치를 옮기지 마라:
   · voltage_source_leg, current_source_leg, dependent_source_leg, switching_leg, load_leg → vertical (top↔ground). horizontal로 옮기지 마라.
   · top_rail_resistor → top rail (두 top node 사이). vertical leg로 옮기지 마라.
   · mesh_only_branch → top rail에 있는 V/I (두 non-ground node 사이의 horizontal source). vertical leg로 옮기지 마라.
※ 즉 원본의 role이 vertical 종류면 vertical로, horizontal 종류면 horizontal로 그대로 두라. 둘 사이 변환 금지.

[★ branch → netlist pin/node 변환 규칙 — dangling 방지]
- 각 branch의 components는 직렬 chain. chain의 양 끝 단자는 반드시 다른 branch와 공유되는 node에 연결.
  · vertical leg(*_source_leg, switching_leg, load_leg): 한 끝 = top node, 다른 끝 = ground. ground 노드는 "GND" 문자열 또는 netlist.ground로 명시.
  · top_rail_resistor: 양 끝 모두 top node (서로 다른 두 노드).
  · shared_supermesh_branch: 양 끝 모두 top node, 두 mesh가 공유.
- 같은 top node에 vertical leg이 여러 개 붙을 수 있음 (예: voltage_source_leg + dependent_source_leg가 같은 top node에서 GND로 병렬).
- 모든 node id는 반드시 ≥2개의 pin과 연결 (degree ≥ 2). 직렬 chain 중간 node도 두 component pin이 만남으로써 degree=2 충족.
- 잘못된 예: V1 component pins=[{node:"n1"}] (한 pin만 있음) → V는 2-단자 소자, pins 길이=2 필수.
- 잘못된 예: V1 pins=[{node:"n1"},{node:"n2"}], 다른 어떤 component도 n1·n2에 연결 안 함 → 양 node가 dangling.
- 올바른 예: V1 pins=[{node:"top_left"},{node:"GND"}], R1 pins=[{node:"top_left"},{node:"V1_node"}] → top_left가 V1과 R1 모두에 등장 (degree=2), GND는 다른 vertical leg과 공유.

[★ state 두 그림 모두 동일 component 셋 보존]
- features.hasSwitch=true이면 state_before AND state_after 두 figure 모두 SW component 포함 (열림/닫힘 state만 다름).
- state_before figure: SW.state="open"
- state_after figure: SW.state="closed"
- 한쪽에만 SW가 있고 다른 쪽엔 없는 경우 critical fail.
- dep source/V source/I source도 마찬가지 — 두 그림 모두 같은 component 셋.
`;
    }
    if (policy.mode === "exam_variant" && analysis.structuralEnvelope) {
      const env = analysis.structuralEnvelope;
      const reqRoleCounts: Record<string, number> = {};
      for (const r of env.requiredBranchRoles) reqRoleCounts[r] = (reqRoleCounts[r] ?? 0) + 1;
      return `[★ STRUCTURAL_ENVELOPE_CONTRACT — exam_variant 모드]
원본 구조의 envelope 안에서 자유 변형. 다음 제약을 반드시 만족:
- requiredFeatures (true인 항목은 모두 보존): ${JSON.stringify(env.requiredFeatures)}
- countRange:
    branches: ${env.countRange.minBranches ?? "?"} ~ ${env.countRange.maxBranches ?? "?"}
    components: ${env.countRange.minComponents ?? "?"} ~ ${env.countRange.maxComponents ?? "?"}
    meshes: ${env.countRange.minMeshes ?? "?"} ~ ${env.countRange.maxMeshes ?? "?"}
- requiredBranchRoles (각 role 최소 등장 횟수): ${JSON.stringify(reqRoleCounts)}
- allowedComponentTypes (이 type들만 사용): ${env.allowedComponentTypes.join(", ")}
- forbiddenSimplifications (절대 금지):
${env.forbiddenSimplifications.map((s) => `    - ${s}`).join("\n")}
※ 위 envelope 어기면 즉시 critical fail · retry.
※ state 그림이 둘이면 (state_before, state_after) 각 figure에 모든 required feature(SW/dep 등) 독립적으로 포함. 한쪽에만 있으면 fail.
`;
    }
    return "";
  })();

  const analysisCtx = analysis
    ? `\n[원본 분석 컨텍스트]\n주제: ${analysis.topic}\n해석: ${analysis.interpretation}\n관련개념: ${analysis.relatedConcepts.join(", ")}\n${
        analysis.signals
          ? `[원본 신호 — 절대 보존]\n  inputs:  ${JSON.stringify(analysis.signals.inputs)}\n  outputs: ${JSON.stringify(analysis.signals.outputs)}\n`
          : ""
      }${inventoryBlock}${topoBlock}${ssigBlock}${
        expandedReqs.length > 0
          ? `[필수 figure 목록 — 모두 생성 (FIGURE_REQUIREMENT_CONTRACT)]\n${reqLines}\n  · 위 목록의 각 항목당 figureVariants에 figure 1개씩 생성.\n  · target이 명시된 경우 figure.label에 target 변수명 포함하거나 fig.diagram.output로 연관.\n  · scope="per_output"을 단일 figure로 축소 금지. scope="combined"를 단일 출력으로 축소 금지.\n`
          : ""
      }`
    : "";

  const topicEnum = (TOPICS_BY_SUBJECT[subject] as readonly TopicKey[]).join(" | ");
  const topicDirective = topicKey
    ? `[topicKey 강제값] 모든 문제의 topicKey는 반드시 "${topicKey}"로 고정. 다른 값 금지.`
    : `[유효 TopicKey 목록] 모든 문제의 topicKey는 다음 중 하나여야 함: ${topicEnum}`;

  return `첨부된 임용 기출 문제 이미지를 바탕으로 새 문제를 ${count}개 생성하세요.

[과목] ${SUBJECT_LABEL[subject]} (${subject})
[과목 힌트] ${SUBJECT_HINT[subject]}
${SUBJECT_GUIDE[subject]}
${analysisCtx}
${buildPolicyDirective(policy)}

${topicDirective}

[필수 figure roles]
${ruleSet.requiredFigureRoles.length > 0 ? ruleSet.requiredFigureRoles.map((r) => `- ${r}`).join("\n") : "- (자동 추정)"}

[SemanticStructure]
${JSON.stringify(semantic)}

【출력 JSON 형식】
{
  "problems": [
    {
      "content":    string,         // 문제 본문 (한국어)
      "conditions": string[],
      "question":   string,         // 실제 질문 한 문장 (예시·괄호 안내 금지)
      "answer":     string,         // 정답값만. 접두사 라벨 금지
      "solution":   string,         // 단계별 풀이 (\\n 사용)
      "topicKey":   string,         // 원본과 동일한 family. 변경 금지
      "figureVariants": [
        {
          "id":          string,    // 문제 내 고유 ID (예: "fig1", "fig_state_before")
          "label":       string,    // 캡션 (예: "원본 회로", "t<0 상태")
          "role":        string,    // original_circuit | equivalent_circuit | implementation_circuit | state_before | state_after | kmap | waveform | truth_table | concept_diagram
          "diagramType": string,    // netlist | schematic | waveform | kmap | truth_table | concept_diagram (이 6개 enum만 허용)
          "diagram":     object     // diagramType별 데이터 (아래 페이로드 참고)
        }
      ]
    }
  ]
}

【diagram 페이로드 — diagramType별 권장 shape】
- analog_netlist (전자회로·회로이론 — diagramType="analog_netlist"):
  {
    "components": [
      {
        "id": "R1",
        "type": "R" | "C" | "L" | "V" | "I" | "SW"
              | "VCCS" | "VCVS" | "CCCS" | "CCVS"
              | "D" | "BJT" | "MOSFET" | "OPAMP" | "GND",   // 위 enum 외 금지
        "value": "10Ω" | 10 | undefined,
        "state": "open" | "closed" (SW 전용),
        "gain":  "0.2" | 0.2 (dependent source 전용),
        "control": "V2" 등 (dependent source 전용),
        "pins": [
          {
            "id": "p1",
            "node": "n1",
            "side": "left" | "right" | "top" | "bottom",   // ← 물리적 위치 (renderer가 좌표 계산에 사용)
            "role": "positive" | "negative" | "input" | "output" | "control"
                  | "gate" | "drain" | "source"
                  | "base" | "collector" | "emitter"
                  | "non_inverting" | "inverting"          // ← semantic 역할 (선택)
          }
        ]
      }
    ],
    "ground": "GND" (있을 경우),
    "nodeAnnotations": [
      // 회로 위 단자 라벨 (Thevenin a/b, 측정점 등)
      { "node": "n_ab_top",  "label": "a", "style": "terminal_dot" },
      { "node": "n_ab_bot",  "label": "b", "style": "terminal_dot" }
    ],
    "loadPlaceholders": [
      // 학생이 풀어야 할 미지 부하 (R_L 등) — 두 node 사이에 점선 박스로 그려짐
      { "betweenNodes": ["n_ab_top", "n_ab_bot"], "label": "R_L", "emphasize": true }
    ],
    "measurementMarks": [
      // 측정 표시 (V_ab 같은 단자간 전압)
      { "kind": "voltage", "refs": ["n_ab_top", "n_ab_bot"], "label": "V_ab" }
    ]
  }
  ★ Thevenin 등가/최대전력 전달 같은 단자 a-b 문제에서는 nodeAnnotations에 a/b 단자 표시 + (필요시) loadPlaceholders에 R_L 박스 필수.
  ★ side와 role은 절대 혼동 금지 ★
  - side는 component box의 어느 면(좌·우·상·하)에서 pin이 나오는지 — left/right/top/bottom 4개만.
  - role은 그 pin의 의미(+, -, gate 등) — semantic. role은 옵셔널.
  - 잘못된 예: { "side": "positive" }                        ← positive는 role 값임
  - 올바른 예: { "side": "left", "role": "positive" }
  - 잘못된 예: { "side": "base" }                            ← base는 role 값임
  - 올바른 예: { "side": "left", "role": "base" }
  · 같은 node id를 가진 pin들은 자동으로 같은 전기적 net으로 연결됨
  · 모든 pin은 반드시 node를 가져야 함 (dangling 금지)
  · bipole(R/C/L/V/I/SW/VCCS/VCVS/CCCS/CCVS/D)는 pins 길이 = 2 (보통 left + right)
  · BJT/MOSFET = 3, OPAMP = 3 (V+, V-, Vout)
- logic_network (디지털논리 — diagramType="logic_network"):
  {
    "inputs":  ["A","B","C"],
    "outputs": ["F"],
    "gates": [
      {
        "id": "G1",
        "type": "NOT" | "AND" | "OR" | "NAND" | "NOR" | "XOR" | "XNOR",
        "inputs": ["A","B"],   // 다른 gate.output 또는 diagram.inputs 참조
        "output": "n1"          // 이 gate가 만들어내는 신호명
      }
    ]
  }
  · AND/OR/NOT 등 게이트는 절대 analog_netlist의 component로 출력 금지.
  · inputs·outputs는 terminal이라 degree 1이어도 정상 (analog dangling 검사 미적용).
  · 모든 gate.inputs는 반드시 source(diagram.inputs 또는 다른 gate.output)에 연결.
  · 보수 신호(A', ¬A 등)는 NOT 게이트로 명시적으로 만들어야 함. inputs 안에 "A'" 같은 표기 직접 사용 금지. 예:
      { id:"G_notA", type:"NOT", inputs:["A"], output:"A_n" }
      { id:"G1",     type:"AND", inputs:["A_n","B"], output:"n1" }
  · ★ 모든 gate는 반드시 4개 필드 (id, type, inputs, output) 모두 포함. 하나라도 누락 금지.
  · gate.id는 unique 문자열 (예: "G1", "G_and1", "G_notA"). 같은 id 중복 금지.
  · gate.inputs는 string[] (≥1), gate.output은 string (≠빈 문자열).
- kmap (카르노맵 — diagramType="kmap"):
  {
    "title": "F(A,B,C)",
    "variables": ["A","B","C"],
    "rowVars": ["A"],         // 변수 분할: 1+2 (3변수) 또는 2+2 (4변수)
    "colVars": ["B","C"],
    "rowOrder": ["0","1"],
    "colOrder": ["00","01","11","10"],   // gray code
    "rows": [
      { "label": "0", "values": [0,1,1,0] },
      { "label": "1", "values": [1,0,0,1] }
    ]
  }
  · 3변수 → 2x4 = 8 cells, 4변수 → 4x4 = 16 cells.
  · 카르노맵 문제는 반드시 kmap + logic_network 두 figure 모두 출력.
  · figure.label은 의미 있는 한국어로 ("입력 K-map", "최소화 결과", "구현 회로" 등). 절대 "kmap" 같이 diagramType과 동일한 글자 금지.
- truth_table: { variables: string[], rows: [{inputs: number[], output: number|"X"}] }
- waveform:    {
    signals: [{
      name,
      samples: [{t, v}],
      shape?: "linear" | "step" | "square" | "exponential_rise" | "exponential_decay",  // 모양에 따라 보간 다름
      tau?: number   // exponential_* shape에서 시간상수 (옵션)
    }],
    unit?: {time?, value?}
  }
  · ★ 신호 모양 따라 shape 정확히:
    - 사각파/펄스/계단 입력 → shape="square" 또는 "step", samples는 (t, v) 변곡점만 (예: 사각파 (0,0),(0,V),(T/2,V),(T/2,0),(T,0))
    - RC 충전 응답 (0→V_ss 점근) → shape="exponential_rise", samples는 시작·끝 (예: (0,0),(5τ,V_ss)), tau=시간상수
    - RC 방전 응답 (V_0→0 점근) → shape="exponential_decay", tau=시간상수
    - 일반 직선/sloped → shape="linear" (default)
  · linear shape에 사각파를 표현하면 삼각파처럼 보이므로 금지 — 반드시 적절한 shape 선택.

【출력 규칙】
- JSON 객체 하나만 출력. 코드펜스·머리말 금지.
- problems 배열 길이 = 정확히 ${count}.
- 같은 호출 내 ${count}개 문제는 반드시 서로 다른 수치·조건으로 구분.
- requiresMultiFigure=${semantic.requiresMultiFigure}이면 figureVariants는 위 [필수 figure roles] 모두 포함.
- 모든 figure는 diagram을 JSON 객체로만. SVG·circuitikz·LaTeX 직접 출력 금지.
- diagramType은 반드시 위 6개 enum 중 하나. 다른 값(예: "circuit", "image") 금지.
- 본문에 "아래 그림"·"그림과 같이" 등 표현을 쓸 거면 반드시 figureVariants에 해당 figure를 포함할 것.`;
}

function isValidProblem(x: unknown): x is Omit<GeneratedProblem, "id"> {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (
    typeof o.content !== "string" ||
    !Array.isArray(o.conditions) || !o.conditions.every((c) => typeof c === "string") ||
    typeof o.question !== "string" ||
    typeof o.answer !== "string" ||
    typeof o.solution !== "string"
  ) return false;
  if (o.figureVariants !== undefined) {
    if (!Array.isArray(o.figureVariants)) return false;
    for (const f of o.figureVariants) {
      if (!f || typeof f !== "object") return false;
      const fo = f as Record<string, unknown>;
      if (
        typeof fo.id !== "string" ||
        typeof fo.label !== "string" ||
        typeof fo.role !== "string" ||
        typeof fo.diagramType !== "string"
      ) return false;
      // diagram은 unknown 허용 (renderer가 narrow)
    }
  }
  return true;
}

/**
 * GPT를 1회 호출 → JSON 파싱 → 스키마 검증 → GeneratedProblem[] 반환.
 * critical validation은 호출자(generateProblems)에서 수행.
 */
async function gptCallOnce(args: {
  image: string;
  userPrompt: string;
  count: number;
  retryHint: string;
}): Promise<GeneratedProblem[]> {
  const { image, userPrompt, count, retryHint } = args;
  const openai = getOpenAI();
  const finalPrompt = retryHint ? `${userPrompt}\n\n${retryHint}` : userPrompt;

  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" } },
          { type: "text", text: finalPrompt },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4000,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch (e) {
    throw new GenerateError("JSON 파싱 실패", { cause: e });
  }
  const problems = (parsed as { problems?: unknown }).problems;
  if (!Array.isArray(problems) || !problems.every(isValidProblem)) {
    throw new GenerateError("스키마 불일치");
  }

  return problems.slice(0, count).map((p) => ({ id: randomUUID(), ...p }));
}

/**
 * 생성 코어 — critical validation 실패 시 최대 MAX_ATTEMPTS회까지 재생성.
 */
export async function generateProblems(args: {
  image: string;
  subject: SubjectKey;
  mode: GenerationMode;
  count: number;
  analysis?: AnalysisResult | null;
  topicKey?: TopicKey;
  semantic?: SemanticStructure;
}): Promise<GeneratedProblem[]> {
  const { image, subject, mode, count, analysis, topicKey } = args;
  const semantic: SemanticStructure = args.semantic ?? {
    hasStateTransition: false,
    hasEquivalentTransformation: false,
    hasWaveformEvolution: false,
    requiresMultiFigure: false,
  };
  // strict pipeline 비활성화 (user 지시: free + repair 방식)
  // 모든 회로/디지털 문제는 free generation → repairBySignature → re-validate.
  void shouldUseStrictPipeline;
  void generateStrictAnalogProblems;

  const policy = resolvePolicy(mode);
  const userPrompt = buildUserPrompt({ subject, policy, count, analysis, topicKey, semantic });
  // trigger text: analysis text를 합쳐 키워드(테브난·노턴·스위치 등) trigger 평가에 사용
  const triggerText = analysis
    ? [analysis.topic, analysis.interpretation, ...(analysis.relatedConcepts ?? [])].join(" ")
    : "";
  const ruleSet = resolveRules({ subject, topicKey, semantic, text: triggerText });

  log.info("generate", { subject, mode, count, hasAnalysis: !!analysis, topicKey });

  let lastResult: GeneratedProblem[] = [];
  let retryHint = "";

  // ── inline helper: 한 problem set에 모든 validator 적용해 critical issues 수집
  // strictMode=true이면 mode와 무관하게 tolerance 0 (repair 후 재검증용)
  const collectCritical = (
    resultSet: GeneratedProblem[],
    strictMode: boolean = false,
  ): ValidationIssue[] => {
    const expectedOutputs = analysis?.signals?.outputs ?? [];
    const effectiveMode: GenerationMode = strictMode ? "exam_similar" : mode;
    const issues: ValidationIssue[] = [];
    for (const p of resultSet) {
      issues.push(...collectIssuesForProblem(p, {
        subject, topicKey, ruleSet, analysis, mode: effectiveMode, expectedOutputs,
      }));
    }
    return issues;
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await gptCallOnce({ image, userPrompt, count, retryHint });
    // post-process: dangling close → analog normalize
    autoCloseAnalogDangling(result);
    normalizeAnalogProblems(result);
    lastResult = result;

    // 1차 validation — mode-based tolerance (exam_similar=0, exam_variant=1)
    let allCritical = collectCritical(result, /*strictMode*/ false);

    // 실패 시 repair → 재validation (tolerance=0 strict)
    // user 파이프라인: free → validate(mode tol) → repair → re-validate(tol=0) → regenerate
    if (allCritical.length > 0 && analysis?.structureSignature) {
      log.info("repair_attempt", { attempt, issues: allCritical.length });
      repairProblemsBySignature(result, analysis.structureSignature);
      autoCloseAnalogDangling(result);
      normalizeAnalogProblems(result);
      allCritical = collectCritical(result, /*strictMode*/ true);
    }

    // ★ terminal analog 계열 (Thevenin/Norton/Rth/Vth/dc_resistive) — terminalAnalogRepair 무조건 통과 필수
    if (isTerminalAnalogFamily(analysis)) {
      log.info("terminal_analog_repair", { attempt });
      const repairedList: GeneratedProblem[] = [];
      const repairFailed: string[] = [];
      for (const p of result) {
        const r = terminalAnalogRepair(p, analysis?.structureSignature);
        repairedList.push(r.candidate);
        if (!r.validation.ok) {
          repairFailed.push(...r.validation.errors);
        }
      }
      result.length = 0;
      result.push(...repairedList);
      // terminalAnalogRepair의 aggressive node-merge가 토폴로지 변경한 뒤 dangling 새로 생길 수 있음 → autoClose 재호출
      autoCloseAnalogDangling(result);
      normalizeAnalogProblems(result);
      lastResult = result;

      if (repairFailed.length > 0) {
        // user 지시: 통과 못 하면 결과 반환 금지 → focused regenerate
        for (const e of repairFailed) {
          allCritical.push({ rule: "terminal_analog_repair_failed", message: e });
        }
      } else {
        // terminal repair pass — 다른 issue도 같이 재확인 (strict tolerance 0)
        allCritical = collectCritical(result, /*strictMode*/ true);
      }
    }

    if (allCritical.length === 0) {
      log.info("done", { mode, returned: result.length, attempts: attempt });
      return result;
    }

    if (attempt === MAX_ATTEMPTS) {
      log.warn("retries_exhausted", { mode, attempts: attempt, criticalCount: allCritical.length });
      break;
    }

    log.warn("retry", { mode, nextAttempt: attempt + 1, criticalCount: allCritical.length });
    retryHint = [
      "【이전 시도에서 발생한 critical 오류 — 반드시 수정하여 재생성】",
      ...allCritical.slice(0, 10).map((i) => `- [${i.rule}] ${i.message}`),
      "특히 회로 완결성: 모든 node id가 ≥2개의 pin과 연결되도록 검산할 것.",
    ].join("\n");
  }

  return cleanOrphanLogicGates(lastResult);
}

/**
 * 단일 problem에 대해 모든 critical validator를 적용하여 issues 수집.
 * (free → validate → repair → re-validate 파이프라인의 두 검증 호출에서 공유)
 */
function collectIssuesForProblem(
  p: GeneratedProblem,
  ctx: {
    subject: SubjectKey;
    topicKey?: TopicKey;
    ruleSet: ReturnType<typeof resolveRules>;
    analysis: AnalysisResult | null | undefined;
    mode: GenerationMode;
    expectedOutputs: string[];
  },
): ValidationIssue[] {
  const { subject, topicKey, ruleSet, analysis, mode, expectedOutputs } = ctx;
  const issues: ValidationIssue[] = [];

  const pv = validateProblem({ problem: p, expected: { subject, topicKey, ruleSet } });
  const fv = validateFigures(p.figureVariants ?? []);
  for (const issue of [...pv.issues, ...fv.issues]) {
    if (CRITICAL_RULES.has(issue.rule)) issues.push(issue);
  }

  if (analysis && (analysis.figureRequirements?.length || analysis.signals?.outputs?.length)) {
    const v = validateFigureRequirements(analysis, p);
    for (const e of v.errors) {
      issues.push({ rule: "figure_requirement_missing", message: e });
    }
  }

  if (analysis?.structureSignature) {
    const v = validateStructureSignature(analysis, p, mode);
    for (const e of v.errors) {
      issues.push({ rule: "structure_signature_mismatch", message: e });
    }
    if (analysis.structureSignature.subjectKey) {
      const v2 = validateByStructureSignature(analysis.structureSignature, p, mode);
      for (const e of v2.errors) {
        issues.push({ rule: "structure_signature_mismatch", message: e });
      }
    }
  }

  if (mode === "exam_similar" && analysis?.topologySignature) {
    const v = validateTopologyPreserved(analysis.topologySignature, p);
    for (const e of v.errors) {
      issues.push({ rule: "topology_not_preserved", message: e });
    }
  }
  if (mode === "exam_variant" && analysis?.structuralEnvelope) {
    const v = validateStructuralEnvelope(analysis.structuralEnvelope, p);
    for (const e of v.errors) {
      issues.push({ rule: "structural_envelope_violation", message: e });
    }
  }

  const ansIssues = validateAnswerSolution({ answer: p.answer, solution: p.solution });
  for (const ai of ansIssues) {
    issues.push({ rule: ai.rule, message: ai.message });
  }

  if (analysis?.signals) {
    const expIns = analysis.signals.inputs ?? [];
    const expOuts = analysis.signals.outputs ?? [];
    const networks = (p.figureVariants ?? []).filter((f) => f.diagramType === "logic_network");
    for (const net of networks) {
      const d = net.diagram as { inputs?: string[]; outputs?: string[] } | null | undefined;
      const gotIns = new Set<string>(Array.isArray(d?.inputs) ? d.inputs : []);
      const gotOuts = new Set<string>(Array.isArray(d?.outputs) ? d.outputs : []);
      const missingIns = expIns.filter((i) => !gotIns.has(i));
      if (missingIns.length > 0) {
        issues.push({
          rule: "signal_name_changed",
          message: `${net.id}: 입력 변수 ${missingIns.join(",")} 누락 (원본 inputs=${expIns.join(",")}). 변수명 임의변경 금지`,
        });
      }
      const missingOuts = expOuts.filter((o) => !gotOuts.has(o));
      if (missingOuts.length > 0) {
        issues.push({
          rule: "signal_name_changed",
          message: `${net.id}: 출력 변수 ${missingOuts.join(",")} 누락 (원본 outputs=${expOuts.join(",")}). 변수명 임의변경 금지`,
        });
      }
    }
  }

  if (expectedOutputs.length > 0) {
    const networks = (p.figureVariants ?? []).filter((f) => f.diagramType === "logic_network");
    for (const net of networks) {
      const d = net.diagram as { outputs?: string[] } | null | undefined;
      const got = new Set<string>(Array.isArray(d?.outputs) ? d.outputs : []);
      const missing = expectedOutputs.filter((o) => !got.has(o));
      if (missing.length > 0) {
        issues.push({
          rule: "multi_output_lost",
          message: `${net.id}: 원본 outputs(${expectedOutputs.join(",")})에서 ${missing.join(",")} 누락`,
        });
      }
    }
  }

  return issues;
}

/**
 * 모든 problem의 logic_network에서 orphan gate를 iterative하게 제거.
 *  - orphan = output 신호가 다른 gate.inputs/diagram.outputs에 안 쓰이는 gate
 *  - 한 gate 제거하면 그 gate의 input 신호가 또 orphan일 수 있어 stable까지 반복
 *  - blanks도 함께 정리 (제거된 gateId 참조 제거)
 */
function cleanOrphanLogicGates(problems: GeneratedProblem[]): GeneratedProblem[] {
  for (const p of problems) {
    for (const f of p.figureVariants ?? []) {
      if (f.diagramType !== "logic_network") continue;
      const d = f.diagram as {
        inputs?: string[];
        outputs?: string[];
        gates?: Array<{ id: string; output?: string; inputs?: string[] }>;
        blanks?: Array<{ gateIds?: string[] }>;
      } | null | undefined;
      if (!d || !Array.isArray(d.gates)) continue;

      // 우선 malformed gate(id 누락)는 자동 인덱스로 보정
      d.gates = d.gates.map((g, gi) => ({
        ...g,
        id: g.id ?? `gate${gi}`,
      }));

      let changed = true;
      while (changed) {
        changed = false;
        const consumed = new Set<string>(d.outputs ?? []);
        for (const g of d.gates) for (const inp of g.inputs ?? []) consumed.add(inp);
        const before = d.gates.length;
        d.gates = d.gates.filter((g) => !g.output || consumed.has(g.output));
        if (d.gates.length < before) changed = true;
      }

      // blanks의 gateIds 중 사라진 것 제거
      if (Array.isArray(d.blanks)) {
        const aliveIds = new Set(d.gates.map((g) => g.id));
        d.blanks = d.blanks
          .map((b) => ({ ...b, gateIds: (b.gateIds ?? []).filter((id) => aliveIds.has(id)) }))
          .filter((b) => b.gateIds.length > 0) as typeof d.blanks;
      }
    }
  }
  return problems;
}

export class GenerateError extends Error {
  constructor(message: string, opts?: ErrorOptions) {
    super(message, opts);
    this.name = "GenerateError";
  }
}
