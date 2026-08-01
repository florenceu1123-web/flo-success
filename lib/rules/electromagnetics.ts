import type { SemanticStructure, TopicKey, FigureRole } from "@/types";
import type { RuleSet } from "./types";

/**
 * 전자기학 RuleSet 결정.
 *
 * 전자기학은 회로가 아니므로 회로 figure(netlist) 요구가 없다. 도식(em_field_diagram)은
 * 보조 그림이라 필수 role로 강제하지 않는다(requiredFigureRoles=[]) — validator의
 * missing_topology는 비-회로 subject에 면제(electromagnetics는 isCircuitSubject 아님),
 * missing_figure_variant는 required role이 없으므로 발생하지 않는다.
 *
 * semantic 4-flag은 모두 false(정적 장·공식 문제, 상태천이·과도·등가변환·다중figure 없음).
 */
export function resolveElectromagneticsRules(args: {
  topicKey?: TopicKey;
  semantic: SemanticStructure;
}): RuleSet {
  const required: FigureRole[] = [];
  return {
    subject: "electromagnetics",
    topicKey: args.topicKey,
    semantic: {
      hasStateTransition: false,
      hasEquivalentTransformation: false,
      hasWaveformEvolution: false,
      requiresMultiFigure: false,
    },
    requiredFigureRoles: required,
  };
}
