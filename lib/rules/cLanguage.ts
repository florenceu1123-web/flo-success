import type { SemanticStructure, TopicKey, FigureRole } from "@/types";
import type { RuleSet } from "./types";

/**
 * C언어 RuleSet 결정.
 *
 * C언어는 회로가 아니라 코드 분석·출력 예측 문제다. 회로 figure(netlist) 요구가 없고
 * 지문 코드(code_block)는 보조 figure라 필수 role로 강제하지 않는다(requiredFigureRoles=[]).
 * validator의 missing_topology는 비-회로 subject(c_language는 isCircuitSubject 아님)에 면제,
 * missing_figure_variant는 required role이 없으므로 발생하지 않는다.
 *
 * semantic 4-flag은 모두 false(정적 코드 분석 — 상태천이·과도·등가변환·다중figure 없음).
 */
export function resolveCLanguageRules(args: {
  topicKey?: TopicKey;
  semantic: SemanticStructure;
}): RuleSet {
  const required: FigureRole[] = [];
  return {
    subject: "c_language",
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
