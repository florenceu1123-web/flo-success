import type { CircuitType, FigureRole, SemanticStructure, SubjectKey, TopicKey } from "@/types";
import { resolveDigitalRules } from "./digital";
import { resolveElectronicsRules } from "./electronics";
import { resolveCircuitTheoryRules } from "./circuitTheory";
import { resolveRequiredFigureRoles } from "./roleTriggers";
import type { RuleSet } from "./types";

export type { RuleSet } from "./types";
export { resolveRequiredFigureRoles } from "./roleTriggers";

/**
 * Pipeline 3단계: subject 분기로 적합한 rules 모듈 호출.
 * 이후 trigger 기반 `resolveRequiredFigureRoles`로 requiredFigureRoles를 덮어쓴다.
 *  - text가 제공되면 키워드(테브난·노턴·스위치 등) trigger도 평가
 *  - text 없으면 semantic + topicKey만으로 trigger 평가
 */
export function resolveRules(args: {
  subject: SubjectKey;
  topicKey?: TopicKey;
  semantic: SemanticStructure;
  text?: string;
  circuitType?: CircuitType;
}): RuleSet {
  let base: RuleSet;
  switch (args.subject) {
    case "digital_logic":   base = resolveDigitalRules(args); break;
    case "electronics":     base = resolveElectronicsRules(args); break;
    case "circuit_theory":  base = resolveCircuitTheoryRules(args); break;
    case "mixed_signal":
      // 복합형: 전자회로 베이스 규칙 사용 (OPAMP·비교기 분석 + 디지털 출력 파형 포함).
      //   counter_dac_comparator 등 고유 archetype은 후속 단계에서 별도 처리.
      base = resolveElectronicsRules(args);
      break;
  }

  // trigger 기반으로 requiredFigureRoles 재평가 — semantic flag만으로 자동 추가 방지
  const triggered = resolveRequiredFigureRoles({
    subjectKey: args.subject,
    topicKey: args.topicKey,
    text: args.text ?? "",
    semantic: args.semantic,
  });

  // 도메인별 base requiredFigureRoles 중 trigger 통과 못 한 항목 제거 + trigger 결과 합집합
  // 단, kmap/implementation_circuit 같은 디지털 전용 role은 base에서 그대로 유지
  const baseSet = new Set<FigureRole>(base.requiredFigureRoles);
  const triggeredSet = new Set<FigureRole>(triggered);
  // analog 모호 role(state·equivalent)은 trigger에 의해서만 결정
  const analogControlled: FigureRole[] = ["state_before", "state_after", "equivalent_circuit"];
  for (const r of analogControlled) {
    if (!triggeredSet.has(r)) baseSet.delete(r);
  }
  for (const r of triggered) baseSet.add(r);

  // 규칙 #9: ruleSet.subject는 항상 원본 subject 유지 (mixed_signal이 electronics base를 차용해도 라벨은 mixed_signal).
  return {
    ...base,
    subject: args.subject,
    requiredFigureRoles: [...baseSet],
  };
}
