import type { SemanticStructure, TopicKey, FigureRole } from "@/types";
import type { RuleSet } from "./types";

/**
 * 전자회로 RuleSet 결정.
 * 1차 stub: 등가변환·상태천이 플래그에 따라 figure 강제.
 */
export function resolveElectronicsRules(args: {
  topicKey?: TopicKey;
  semantic: SemanticStructure;
}): RuleSet {
  const required: FigureRole[] = ["original_circuit"];
  if (args.semantic.hasEquivalentTransformation) required.push("equivalent_circuit");
  if (args.semantic.hasStateTransition) required.push("state_before", "state_after");
  if (args.semantic.hasWaveformEvolution) required.push("waveform");
  return {
    subject: "electronics",
    topicKey: args.topicKey,
    semantic: args.semantic,
    requiredFigureRoles: Array.from(new Set(required)),
  };
}
