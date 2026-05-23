// src/lib/analysis/detectAnalogArchetype.ts
//
// analysis → AnalogArchetype detect. 키워드·구조 시그니처 기반.
// pipeline: analyze → detectAnalogArchetype → generateCircuit dispatch.

import type { AnalogArchetype } from "@/lib/analog/archetypeRegistry";

/** detect 입력에 필요한 analysis 부분만 추출한 shape. */
export type AnalogDetectInput = {
  text: string;          // topic + interpretation + relatedConcepts join
  hasR: boolean;         // componentInventory에 R 존재
  hasC: boolean;         // componentInventory에 C 존재
  hasOpAmp: boolean;     // componentInventory에 OPAMP 존재
};

/**
 * AnalogArchetype 검출 — 매칭 안 되면 null.
 *
 *   WIEN_BRIDGE_OSCILLATOR: RC 망 + 피드백 + β(s) + 발진 키워드 동시
 *   RC_PHASE_SHIFT_OSCILLATOR: RC 망 + 위상 천이 + 발진 키워드
 *   NONINVERTING_AMP: 비반전 + 피드백 R 키워드 (오실레이터 아님)
 *   VOLTAGE_FOLLOWER: 전압 추종기 / unity-gain 키워드
 */
export function detectAnalogArchetype(input: AnalogDetectInput): AnalogArchetype | null {
  if (!input.hasOpAmp) return null;

  const hasRCNetwork = input.hasR && input.hasC;
  const hasFeedbackLoop = matchesAny(input.text, ["피드백", "feedback", "귀환", "발진루프"]);
  const mentionsBetaS = matchesAny(input.text, ["β(s)", "베타(s)", "beta(s)", "B(s)"]);
  const mentionsOscillation = matchesAny(input.text, [
    "발진", "오실레이터", "oscillator", "Barkhausen", "정현파", "1-Kβ", "1 - Kβ", "특성방정식",
  ]);
  const mentionsPhaseShift = matchesAny(input.text, ["위상 천이", "위상천이", "phase-shift", "phase shift"]);
  const mentionsNonInverting = matchesAny(input.text, ["비반전", "non-inverting", "noninverting"]);
  const mentionsInverting = matchesAny(input.text, ["반전 증폭", "반전증폭", "inverting amp"]);
  const mentionsVoltageFollower = matchesAny(input.text, [
    "전압 추종기", "전압추종기", "voltage follower", "voltage_follower", "unity gain", "단위이득",
  ]);
  const mentionsActiveFilter = matchesAny(input.text, [
    "능동 필터", "능동필터", "active filter", "저역통과 필터", "고역통과 필터", "대역통과 필터",
    "low-pass filter", "high-pass filter", "band-pass filter", "차단주파수", "cutoff frequency",
  ]);

  if (
    hasRCNetwork &&
    hasFeedbackLoop &&
    mentionsBetaS &&
    mentionsOscillation
  ) {
    return "WIEN_BRIDGE_OSCILLATOR";
  }

  if (hasRCNetwork && mentionsPhaseShift && mentionsOscillation) {
    return "RC_PHASE_SHIFT_OSCILLATOR";
  }

  // ACTIVE_FILTER는 RC망 + 필터 키워드 (발진 키워드 없음 — oscillator와 명확 구분).
  if (hasRCNetwork && mentionsActiveFilter && !mentionsOscillation) {
    return "ACTIVE_FILTER";
  }

  if (mentionsVoltageFollower) {
    return "VOLTAGE_FOLLOWER";
  }

  if (mentionsNonInverting) {
    return "NONINVERTING_AMP";
  }

  if (mentionsInverting) {
    return "INVERTING_AMP";
  }

  return null;
}

function matchesAny(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}
