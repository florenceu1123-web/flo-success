import type { SemanticStructure, TopicKey, FigureRole } from "@/types";
import type { RuleSet } from "./types";

/**
 * 교육학(교직) RuleSet 결정.
 *
 * 교육학은 회로가 아니라 교육 이론·논술형 문제다. 회로 figure(netlist)도, 파형·코드 figure도
 * 요구하지 않는다(requiredFigureRoles=[]). validator의 missing_topology는 비-회로 subject
 * (pedagogy는 isCircuitSubject 아님)에 면제된다.
 *
 * semantic 4-flag은 모두 false(개념·서술형 — 상태천이·과도·등가변환·다중figure 없음).
 */
export function resolvePedagogyRules(args: {
  topicKey?: TopicKey;
  semantic: SemanticStructure;
}): RuleSet {
  const required: FigureRole[] = [];
  return {
    subject: "pedagogy",
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
