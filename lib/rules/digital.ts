import type { CircuitType, CircuitTypeParams, SemanticStructure, TopicKey, FigureRole } from "@/types";
import type { RuleSet } from "./types";

/**
 * 디지털논리회로 RuleSet 결정.
 * circuitType이 주어지면 그것을 우선 사용 (flipflop_mixed_app 같은 specialized family).
 */
export function resolveDigitalRules(args: {
  topicKey?: TopicKey;
  semantic: SemanticStructure;
  circuitType?: CircuitType;
  circuitTypeParams?: CircuitTypeParams;
}): RuleSet {
  const required: FigureRole[] = [];
  // ff_with_waveform: 단일 FF + 조합부 + 파형 (임용 8번 형식) — implementation_circuit + waveform
  if (args.circuitType === "ff_with_waveform") {
    required.push("implementation_circuit", "waveform");
  } else if (args.circuitType === "sequential_dff_generic") {
    // 임용 12번 형식: D-FF 다중비트(Q1Q0) 순서논리 + 입력 파형 — kmap 없음.
    //   (단계3의 "최소 AND/OR 게이트 재구성"은 풀이 산출물이지 figure 아님 → kmap 요구 금지.)
    //   generic 파이프라인 emit: implementation_circuit(logic_network) + input_waveform.
    required.push("implementation_circuit", "input_waveform");
  } else if (args.circuitType === "flipflop_mixed_app") {
    required.push("implementation_circuit", "truth_table", "waveform");
  } else if (args.circuitType === "tff_state_table_blank") {
    // 임용 7번 정보과 — (가) T-FF 2개 회로 + (나) 상태표(빈칸). K-map은 풀이 [단계 3] 산출물.
    required.push("implementation_circuit", "truth_table");
  } else if (args.circuitType === "mux_implementation") {
    // (가) 조합논리회로 + (나) MUX 두 figure. kmap·waveform 없음.
    required.push("main_circuit", "implementation_circuit");
  } else if (args.circuitType === "kmap_sop" && args.circuitTypeParams?.truthTableBlank) {
    // 임용 5번 정보과 — (가) 진리표 + (나) 간략화된 조합논리회로. kmap은 풀이 [단계 1] 산출물.
    required.push("truth_table", "implementation_circuit");
  } else if (
    args.circuitType === "fsm" &&
    (args.circuitTypeParams?.ffTypes ?? []).includes("JK") &&
    args.circuitTypeParams?.hasStateTable
  ) {
    // 임용 9번 전자 (JK 상태표 형식) — (가) 상태도 + (나) 상태표(빈칸 ㉠~㉥).
    // 원본에 구현 회로 figure가 없음 — implementation_circuit 요구 금지.
    required.push("state_diagram", "truth_table");
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
