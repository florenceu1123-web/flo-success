import type { SemanticStructure, TopicKey, FigureRole } from "@/types";
import type { RuleSet } from "./types";

/**
 * 디지털논리회로 RuleSet 결정.
 * 1차 stub: kmap 토픽이면 kmap+implementation, waveform 토픽이면 waveform 강제.
 */
export function resolveDigitalRules(args: {
  topicKey?: TopicKey;
  semantic: SemanticStructure;
}): RuleSet {
  const required: FigureRole[] = [];
  if (args.topicKey === "kmap_sop" || args.topicKey === "kmap_pos") {
    required.push("kmap", "implementation_circuit");
  }
  if (args.topicKey === "flipflop_counter") {
    required.push("kmap", "implementation_circuit");
  }
  if (args.topicKey === "combinational_gate") {
    required.push("kmap", "implementation_circuit");
  }
  if (args.topicKey === "fsm") {
    required.push("implementation_circuit");   // state_diagram은 trigger 기반으로 추가
  }
  if (args.topicKey === "waveform_analysis" || args.semantic.hasWaveformEvolution) {
    required.push("waveform");
  }
  return {
    subject: "digital_logic",
    topicKey: args.topicKey,
    semantic: args.semantic,
    requiredFigureRoles: dedupe(required),
  };
}

function dedupe<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}
