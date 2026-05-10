import type { AnalysisResult, FigureRequirement } from "@/types";

export type ExpandedFigureRequirement = FigureRequirement & {
  /** per_output expansion 결과 — 단일 출력 이름 또는 combined 시 배열 */
  target?: string | string[];
  label?: string;
};

/**
 * analysis에 figureRequirements가 없을 때 signals + topicKey로 합리적 default 합성.
 *  - 디지털논리 + outputs ≥ 1: per_output K-map + combined logic_network
 *  - 회로이론·전자회로: single main_circuit (basic)
 */
export function synthesizeDefaultRequirements(analysis: AnalysisResult): FigureRequirement[] {
  const outputs = analysis.signals?.outputs ?? [];
  const isDigital = analysis.subjectKey === "digital_logic"
    || analysis.topicKey === "kmap_sop"
    || analysis.topicKey === "kmap_pos"
    || analysis.topicKey === "combinational_gate"
    || analysis.topicKey === "fsm";

  if (isDigital && outputs.length > 0) {
    return [
      { role: "kmap", diagramType: "kmap", scope: "per_output", targets: outputs, required: true },
      { role: "implementation_circuit", diagramType: "logic_network", scope: "combined", targets: outputs, required: true },
    ];
  }
  return [
    { role: "main_circuit", diagramType: "analog_netlist", scope: "single", required: true },
  ];
}

/**
 * scope=per_output / combined / per_state / single을 실제 figure 단위로 펼친다.
 *  - per_output: targets ?? signals.outputs 각 출력별 1개
 *  - combined: targets 전체를 1개 figure에 묶음 (target은 배열)
 *  - per_state: 각 state별 1개 (TODO: state expansion — 추후 spec 필요시)
 *  - single: 그대로 1개
 */
export function expandFigureRequirements(analysis: AnalysisResult): ExpandedFigureRequirement[] {
  const expanded: ExpandedFigureRequirement[] = [];
  const reqs = analysis.figureRequirements?.length
    ? analysis.figureRequirements
    : synthesizeDefaultRequirements(analysis);

  for (const req of reqs) {
    if (req.scope === "per_output") {
      const targets = req.targets ?? analysis.signals?.outputs ?? [];
      for (const output of targets) {
        expanded.push({
          ...req,
          target: output,
          label: `${output} ${labelForRole(req.role)}`,
        });
      }
      continue;
    }

    if (req.scope === "combined") {
      expanded.push({
        ...req,
        target: req.targets ?? analysis.signals?.outputs ?? [],
        label: labelForRole(req.role),
      });
      continue;
    }

    expanded.push(req);
  }

  return expanded;
}

export function labelForRole(role: string): string {
  switch (role) {
    case "kmap":                   return "K-map";
    case "implementation_circuit": return "구현 회로";
    case "main_circuit":           return "회로도";
    case "equivalent_circuit":     return "등가회로";
    case "waveform":               return "파형";
    case "state_diagram":          return "상태 천이도";
    case "truth_table":            return "진리표";
    default:                       return role;
  }
}
