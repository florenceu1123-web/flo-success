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
  "imyong_10_dc_nodal",
];

/** 회로 figure로 간주되는 diagramType — analog 계열 + archetype 전용 fixed-slot. */
const CIRCUIT_FIGURE_TYPES: ReadonlySet<DiagramType> = new Set<DiagramType>([
  "analog_netlist",
  "logic_network",
  "imyong_10_dc_nodal",
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

  // Thevenin-style 문제 검출: original_circuit + equivalent_circuit 두 figure를 가지면
  //   state_before/state_after/waveform 요구를 등가회로 형식으로 대체 만족한 것으로 간주.
  //   (예: thevenin_switched_rc archetype은 (가) 원본 + (나) Thevenin 등가로 스위치 전후 분석)
  const isTheveninStyle =
    (roles.has("original_circuit") || roles.has("main_circuit")) &&
    (roles.has("equivalent_circuit") || roles.has("thevenin_equivalent") || roles.has("norton_equivalent"));

  // 3. figureVariants 누락 — alias 그룹 단위로 dedup해서 한 번씩만 검사
  const checkedGroups = new Set<string>();
  for (const r of expected.ruleSet.requiredFigureRoles) {
    // state가 required면 main_circuit/original_circuit은 skip (대체 만족)
    if (stateRequired && isMainCircuitRole(r)) continue;
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
    // truth_table·waveform도 회로 figure 아님 (보조 figure로 단독 사용 가능)
    f.diagramType === "truth_table" ||
    f.diagramType === "waveform",
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

  return { ok: issues.length === 0, issues };
}
