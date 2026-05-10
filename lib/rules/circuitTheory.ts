import type { SemanticStructure, TopicKey, FigureRole } from "@/types";
import type { RuleSet } from "./types";

/**
 * 회로이론 RuleSet 결정 — equivalent vs state 분리.
 *  - equivalent_circuit: 진짜 테브난·노턴·소스변환 케이스에서만 (TopicKey가 명시적으로 그쪽인 경우)
 *  - state_before/after: 스위치 상태 변화 (switching_circuit, hasStateTransition)
 *  - 둘이 동시에 자동 추가되는 일 없음
 *
 *  ※ semantic.hasEquivalentTransformation만으로는 equivalent_circuit을 강제하지 않는다.
 *     analyze가 switched circuit을 잘못 hasEquivalentTransformation=true로 분류하는 케이스를 회피.
 */
export function resolveCircuitTheoryRules(args: {
  topicKey?: TopicKey;
  semantic: SemanticStructure;
}): RuleSet {
  const required: FigureRole[] = ["original_circuit"];

  const isStateBased =
    args.semantic.hasStateTransition ||
    args.topicKey === "switching_circuit";

  // 명시적 등가변환 TopicKey만 — supermesh/supernode/switching은 등가가 아님
  const isEquivalentBased =
    args.topicKey === "dependent_source" || // 종속전원 등가
    (args.semantic.hasEquivalentTransformation && !isStateBased);

  if (isStateBased) {
    required.push("state_before", "state_after");
  } else if (isEquivalentBased) {
    required.push("equivalent_circuit");
  }

  if (args.semantic.hasWaveformEvolution) required.push("waveform");

  return {
    subject: "circuit_theory",
    topicKey: args.topicKey,
    semantic: args.semantic,
    requiredFigureRoles: Array.from(new Set(required)),
  };
}
