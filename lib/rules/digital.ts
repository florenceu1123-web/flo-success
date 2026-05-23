import type { CircuitType, SemanticStructure, TopicKey, FigureRole } from "@/types";
import type { RuleSet } from "./types";

/**
 * 디지털논리회로 RuleSet 결정.
 * circuitType이 주어지면 그것을 우선 사용 (flipflop_mixed_app 같은 specialized family).
 */
export function resolveDigitalRules(args: {
  topicKey?: TopicKey;
  semantic: SemanticStructure;
  circuitType?: CircuitType;
}): RuleSet {
  const required: FigureRole[] = [];
  // ff_with_waveform: 단일 FF + 조합부 + 파형 (임용 8번 형식) — implementation_circuit + waveform
  if (args.circuitType === "ff_with_waveform") {
    required.push("implementation_circuit", "waveform");
  } else if (args.circuitType === "flipflop_mixed_app") {
    required.push("implementation_circuit", "truth_table", "waveform");
  } else if (args.circuitType === "mux_implementation") {
    // (가) 조합논리회로 + (나) MUX 두 figure. kmap·waveform 없음.
    required.push("main_circuit", "implementation_circuit");
  } else {
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
