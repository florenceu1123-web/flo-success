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
];

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

  // 3. figureVariants 누락 — alias 그룹 단위로 dedup해서 한 번씩만 검사
  const checkedGroups = new Set<string>();
  for (const r of expected.ruleSet.requiredFigureRoles) {
    // state가 required면 main_circuit/original_circuit은 skip (대체 만족)
    if (stateRequired && isMainCircuitRole(r)) continue;

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
  const hasCircuitFigure = figs.some((f) =>
    f.diagramType === "analog_netlist" || f.diagramType === "logic_network",
  );
  // analog 회로는 analog_netlist, 디지털논리는 logic_network — 둘 중 하나는 있어야
  if (isCircuitSubject && figs.length > 0 && !hasCircuitFigure) {
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
  if (expected.ruleSet.semantic.hasWaveformEvolution && !figs.some((f) => f.diagramType === "waveform")) {
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
