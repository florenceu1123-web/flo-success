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
  // waveform_analysis 타이밍→논리 (임용 8번): 타이밍 도표만 given. 회로·kmap은 학생 도출물(solutionFigures).
  if (args.circuitType === "waveform_analysis" && args.circuitTypeParams?.timingGivenDeriveCircuit) {
    required.push("waveform");
  } else
  // ff_with_waveform: 단일 FF + 조합부 + 파형 (임용 8번 형식) — implementation_circuit + waveform
  if (args.circuitType === "ff_with_waveform") {
    required.push("implementation_circuit", "waveform");
  } else if (args.circuitType === "jk_sync_counter") {
    // JK 동기식 카운터 타이밍 분석 — (가) 회로(logic_network) + (나) 타이밍 도표(waveform).
    //   topicKey가 flipflop_counter여도 kmap "설계" figure는 요구하지 않음(타이밍 "분석"이므로).
    required.push("implementation_circuit", "waveform");
  } else if (args.circuitType === "sequential_dff_generic") {
    // 임용 12번 형식: D-FF 다중비트(Q1Q0) 순서논리 + 입력 파형 — kmap 없음.
    //   (단계3의 "최소 AND/OR 게이트 재구성"은 풀이 산출물이지 figure 아님 → kmap 요구 금지.)
    //   generic 파이프라인 emit: implementation_circuit(logic_network) + input_waveform.
    required.push("implementation_circuit", "input_waveform");
  } else if (args.circuitType === "async_preset_ripple_counter") {
    // 비동기 SET/RESET D-FF 응용회로 — (가) 회로 + (나) 파형(클럭·Q, ㉠·㉡ 구간). kmap·구현회로 요구 없음.
    required.push("main_circuit", "waveform");
  } else if (args.circuitType === "flipflop_mixed_app") {
    required.push("implementation_circuit", "truth_table", "waveform");
  } else if (args.circuitType === "tff_state_table_blank") {
    // 임용 7번 정보과 — (가) T-FF 2개 회로 + (나) 상태표(빈칸). K-map은 풀이 [단계 3] 산출물.
    required.push("implementation_circuit", "truth_table");
  } else if (args.circuitType === "tff3_autonomous_counter") {
    // 임용 11번 — (가) 상태도 + (나) 상태표(㉠·㉡) + (다) T-FF 3개 회로(㉢).
    //   카르노도는 풀이 [단계 2] 산출물이므로 figure로 요구하지 않는다.
    required.push("state_diagram", "truth_table", "implementation_circuit");
  } else if (args.circuitType === "demux_waveform") {
    // 임용 8번 — (가) 디먹스 회로 + (나) 파형. K-map은 요구하지 않는다.
    required.push("implementation_circuit", "waveform");
  } else if (args.circuitType === "number_representation") {
    // 임용 4번 — (가)·(나) 수 표현 고리 그림. 회로 figure가 아니므로 회로 role을 요구하지 않는다.
    required.push("main_circuit");
  } else if (args.circuitType === "mod_n_counter_reset") {
    // 임용 9번 — (가) 상태도 + (나) 카운터 회로. K-map·파형은 요구하지 않는다.
    required.push("state_diagram", "implementation_circuit");
  } else if (args.circuitType === "jk_excitation_sop_pos") {
    // 2025 전기 A-8 — (가) 상태 여기표(빈칸 ㉠~㉣) + (나) JK-FF 2개 + 조합논리 ㉲ 회로.
    //   K-map·파형은 풀이 산출물이므로 요구하지 않는다.
    required.push("truth_table", "implementation_circuit");
  } else if (args.circuitType === "logic_condition_sop") {
    // 동작 조건(말)→최소 SOP (임용 25번). ★그림 없음★ — 조건은 텍스트, 진리표·K-map은 풀이 산출물.
    //   required 없음(figure-less). topicKey=combinational_gate의 kmap/구현회로 요구를 명시적으로 우회.
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
