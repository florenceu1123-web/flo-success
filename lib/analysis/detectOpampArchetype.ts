// src/lib/analysis/detectOpampArchetype.ts
//
// OPAMP 회로의 archetype을 구조·키워드 점수로 판정.
// 키워드 감지 ❌ / 구조 기반 archetype scoring ✅ (β(s)·Barkhausen 텍스트 없이도 잡아야 함).
//
// 정책: archetype 불확실(uncertain) — 어떤 archetype도 충분히 점수 못 받음 → null 반환.
//        호출부에서 throw 처리 (free OPAMP generation 금지).

import type { AnalogArchetype } from "@/lib/analog/archetypeRegistry";

/**
 * 분석 결과를 받아 OPAMP archetype 판정. 결정 임계 미달 시 null.
 *
 *   scoring rule:
 *     wien:
 *       RC 회로망(+2) · 피드백(+2) · 발진(+3) · 루프(+2) · 조건/특성방정식(+1) · β/Barkhausen(+3)
 *       총합 ≥ 4 → WIEN_BRIDGE_OSCILLATOR (β/Barkhausen 키워드 없어도 구조만으로 매칭 가능)
 *     inverting:    "반전"·"inverting" (+3)
 *     nonInverting: "비반전"·"non-inverting" (+3)
 *     follower:     "팔로워"·"voltage follower"·"buffer" (+3)
 *
 *   wien score가 4 미만이면 top score archetype을 선택하되 ≥3 미달이면 null (uncertain).
 *
 *   ★ scoring 대상은 analysis 전체 JSON + 외부 텍스트(문제 본문·해석 절차) 모두 포함.
 *     interpretation 단일 필드만 보면 GPT가 단어를 다르게 적었을 때 놓침.
 */
export function detectOpampArchetype(
  analysis: unknown,
  extraText: readonly string[] = [],
): AnalogArchetype | null {
  // 전체 JSON + 외부 텍스트 합쳐서 한 덩어리로 lowercase 검색.
  const jsonText = JSON.stringify(analysis ?? {});
  const text = [jsonText, ...extraText].join(" ").toLowerCase();

  const score = {
    wien: 0,
    inverting: 0,
    nonInverting: 0,
    follower: 0,
  };

  // Wien Bridge 구조 시그니처
  if (text.includes("rc") || text.includes("rc 회로망")) score.wien += 2;
  if (text.includes("feedback") || text.includes("피드백") || text.includes("되먹임")) score.wien += 2;
  if (text.includes("발진") || text.includes("oscillat")) score.wien += 3;
  if (text.includes("루프") || text.includes("loop")) score.wien += 2;
  if (text.includes("조건") || text.includes("특성방정식")) score.wien += 1;
  if (text.includes("β") || text.includes("beta") || text.includes("barkhausen")) score.wien += 3;

  // 단순 OPAMP archetype 키워드
  if (text.includes("반전") || text.includes("inverting")) score.inverting += 3;
  if (text.includes("비반전") || text.includes("non-inverting")) score.nonInverting += 3;
  if (text.includes("팔로워") || text.includes("voltage follower") || text.includes("buffer")) {
    score.follower += 3;
  }

  // Wien Bridge 우선 — 구조 시그니처 합산이 임계 이상이면 다른 archetype보다 우선.
  if (score.wien >= 4) return "WIEN_BRIDGE_OSCILLATOR";

  const entries = Object.entries(score).sort((a, b) => b[1] - a[1]) as Array<[keyof typeof score, number]>;
  const [topKey, topScore] = entries[0];
  if (topScore < 3) return null; // archetype uncertain

  return KEY_TO_ARCHETYPE[topKey];
}

const KEY_TO_ARCHETYPE: Record<"wien" | "inverting" | "nonInverting" | "follower", AnalogArchetype> = {
  wien: "WIEN_BRIDGE_OSCILLATOR",
  inverting: "INVERTING_AMP",
  nonInverting: "NONINVERTING_AMP",
  follower: "VOLTAGE_FOLLOWER",
};
