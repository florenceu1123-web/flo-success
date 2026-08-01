import type { SemanticStructure, TopicKey, FigureRole } from "@/types";
import type { RuleSet } from "./types";

/**
 * 통신 RuleSet 결정.
 *
 * 통신은 회로가 아니라 신호·변조·정보이론 공식 문제다. 회로 figure(netlist) 요구가 없고
 * 파형·스펙트럼·블록도(comm_diagram)는 보조 figure라 필수 role로 강제하지 않는다(requiredFigureRoles=[]).
 * validator의 missing_topology는 비-회로 subject(communications는 isCircuitSubject 아님)에 면제된다.
 *
 * semantic 4-flag은 모두 false(공식·계산 문제 — 상태천이·과도·등가변환·다중figure 없음).
 */
export function resolveCommunicationsRules(args: {
  topicKey?: TopicKey;
  semantic: SemanticStructure;
}): RuleSet {
  const required: FigureRole[] = [];
  return {
    subject: "communications",
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
