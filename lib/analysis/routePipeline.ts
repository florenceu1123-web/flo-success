/**
 * Pipeline Router (2026-06-01, Framework refactor 5단계 — Objective/tags dispatch).
 *
 * circuitType(분류기) + motif tags + learning objective → 최종 dispatch circuitType.
 *
 * 설계 (안전 우선 — 작동 중인 분류를 깨지 않음):
 *  1. opamp 발진기·전달함수 override — 분류기가 Wien bridge를 universal_ac 등으로 오분류해도
 *     tags(opamp + oscillator|transfer_function)면 OPAMP path 강제 (기존 동작 유지).
 *  2. circuitType이 이미 확정돼 있으면 그대로 둔다(분류기 신뢰). 위 override만 예외.
 *  3. circuitType 미확정(undefined)일 때만 objective·tags로 fallback 추론.
 *     · universal_ac/universal_dc는 topologySignature 필수이므로 없으면 추론 안 함(400 회피).
 *
 * archetype 폭증 없이 motif·objective로 분기 — CLAUDE.md "rule-based universal path 우선" 일관.
 */

export type RouteInput = {
  /** 분류기가 정한 circuitType (없으면 undefined). */
  circuitType: string | undefined;
  /** analyze가 생성한 motif·objective tags. */
  tags: string[];
  /** learning objective 플래그 (asks_*). */
  objective?: Record<string, boolean>;
  subjectKey: string;
  /** universal_ac/dc dispatch 전제 — topologySignature 존재 여부. */
  hasTopologySignature: boolean;
};

export type RouteResult = { circuitType: string | undefined; reason: string | null };

export function routePipeline(input: RouteInput): RouteResult {
  const { circuitType, tags, subjectKey, hasTopologySignature } = input;
  const obj = input.objective ?? {};
  const has = (t: string) => tags.includes(t);

  // 1. OPAMP 발진기·전달함수 override (분류기 값 무관, 단 이미 opamp 계열이면 유지).
  if (
    has("opamp") &&
    (has("oscillator") || has("transfer_function")) &&
    circuitType !== "opamp" &&
    circuitType !== "opamp_cascade_voltage_divider"
  ) {
    return { circuitType: "opamp", reason: "tags.opamp + (oscillator|transfer_function) → OPAMP path" };
  }

  // 2. 분류기가 확정한 circuitType이 있으면 신뢰 (override는 위 1번뿐).
  if (circuitType) return { circuitType, reason: null };

  // 3. 미확정 — objective·tags fallback 추론.
  const reactive = has("inductive") || has("capacitive");

  if (subjectKey === "digital_logic") {
    if (obj.asks_logic_minimization) return { circuitType: "kmap_sop", reason: "objective.logic_minimization → kmap_sop" };
  } else if (subjectKey === "electronics") {
    if (obj.asks_region_identification) return { circuitType: "bjt_characteristic_curve", reason: "objective.region_identification → bjt_characteristic_curve" };
  } else if (subjectKey === "circuit_theory") {
    if (obj.asks_max_power_transfer && hasTopologySignature) return { circuitType: "max_power_transfer", reason: "objective.max_power_transfer" };
    if (obj.asks_equivalent_circuit && hasTopologySignature) return { circuitType: "thevenin", reason: "objective.equivalent_circuit → thevenin" };
    // 평균전력·RLC 공진 등 phasor → universal_ac (reactive 소자 + topologySignature 필수).
    if ((obj.asks_average_power || obj.asks_frequency_response || has("rlc")) && reactive && hasTopologySignature) {
      return { circuitType: "universal_ac", reason: "objective.average_power/frequency + reactive → universal_ac" };
    }
    // 과도응답 — inductive→rl_step, capacitive→rc_step.
    if (obj.asks_transient_response) {
      if (has("inductive")) return { circuitType: "rl_step", reason: "objective.transient + inductive → rl_step" };
      if (has("capacitive")) return { circuitType: "rc_step", reason: "objective.transient + capacitive → rc_step" };
    }
    // 순수 저항 DC 다단 — universal_dc (topologySignature 필수).
    if (obj.asks_average_power && !reactive && hasTopologySignature) {
      return { circuitType: "universal_dc", reason: "objective.power + resistive → universal_dc" };
    }
  }

  return { circuitType, reason: null };
}
