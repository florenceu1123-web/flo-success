// src/lib/analysis/detectImyong10Archetype.ts
//
// IMYONG_10_DC_NODAL archetype detector.
//   임용 10번 형식: V 소스 + I 소스 + 5R + 가변 R, 2-source nodal DC 회로.
//   2-node V_1·V_2 voltage 계산 + 가변 R 조정으로 목표 전압 만들기.
//
// 정책 (CLAUDE.md "Circuit Generation Architecture Principle"):
//   detector는 archetype 라벨만 결정. layout 정보 출력 금지.
//   결과 null이면 fallback (universal_dc 등)로 라우팅.

import type { AnalogArchetype } from "@/lib/analog/archetypeRegistry";

/** detector 입력 — JSON.stringify된 analysis 전체 + 외부 텍스트(문제 본문·해석 절차). */
export type Imyong10DetectInput = {
  /** analysis 전체 JSON (또는 stringify된 문자열) */
  analysis: unknown;
  /** 외부 텍스트 — topic·interpretation·conditions·relatedConcepts 등 */
  extraText?: readonly string[];
  /** componentInventory 카운트 (type → count) */
  inventoryCounts: {
    V?: number;
    I?: number;
    R?: number;
    L?: number;
    C?: number;
    SW?: number;
  };
};

/**
 * IMYONG_10_DC_NODAL 검출 — 임계 미달 시 null.
 *
 *   필수 조건 (하나라도 위반 시 즉시 null):
 *     - DC-only (L·C 없음)
 *     - V 소스 ≥1 AND I 소스 ≥1 (2-source)
 *     - R ≥ 4 (5R 가정이나 누락 가능성 대비 4까지 허용)
 *     - SW 없음
 *
 *   scoring (필수 통과 후 soft signal 합산, ≥5 → 매칭):
 *     R count 5~6 ........................ +3 (정확한 sweet spot)
 *     "가변 저항" / "variable" 키워드 .... +2
 *     V_1·V_2 node label 패턴 ............ +2
 *     "V_n = 숫자" 목표값 ................. +2
 *     "임용" / "10번" 키워드 .............. +2
 *     "병렬" / "parallel" 키워드 .......... +1
 */
export function detectImyong10Archetype(input: Imyong10DetectInput): AnalogArchetype | null {
  const { inventoryCounts } = input;

  // ── 필수 조건 검증 ──
  const hasL = (inventoryCounts.L ?? 0) > 0;
  const hasC = (inventoryCounts.C ?? 0) > 0;
  if (hasL || hasC) return null; // DC only

  const hasV = (inventoryCounts.V ?? 0) >= 1;
  const hasI = (inventoryCounts.I ?? 0) >= 1;
  if (!hasV || !hasI) return null; // 2-source 필수

  const rCount = inventoryCounts.R ?? 0;
  if (rCount < 4) return null;

  const hasSW = (inventoryCounts.SW ?? 0) > 0;
  if (hasSW) return null; // switching circuit은 별개 archetype

  // ── Scoring (soft signal) ──
  const jsonText = JSON.stringify(input.analysis ?? {});
  const text = [jsonText, ...(input.extraText ?? [])].join(" ").toLowerCase();

  let score = 0;

  // R count sweet spot
  if (rCount === 5 || rCount === 6) score += 3;
  else if (rCount === 4 || rCount === 7) score += 1;

  // 가변 R indicator
  if (text.includes("가변") || text.includes("variable r") || /\br_var\b/.test(text)) {
    score += 2;
  }

  // V_1 · V_2 node labels
  if (/v[_]?1/.test(text) && /v[_]?2/.test(text)) {
    score += 2;
  }

  // Target voltage query — "V_2 = 3.8V" 같은 패턴
  if (/v[_]?[1234]\s*[=:]\s*[\d.]+/.test(text) || /목표\s*전압|target\s*voltage/.test(text)) {
    score += 2;
  }

  // 임용 / 10번 키워드 — 명시적 출처 표기
  if (text.includes("임용") || text.includes("10번") || text.includes("imyong")) {
    score += 2;
  }

  // 병렬 R 구조 — left source의 parallel feed
  if (text.includes("병렬") || text.includes("parallel")) {
    score += 1;
  }

  return score >= 5 ? "IMYONG_10_DC_NODAL" : null;
}

/**
 * AnalysisResult-like 구조에서 inventoryCounts 추출 helper.
 *   componentInventory가 비어 있으면 모두 0.
 */
export function countInventoryByType(
  inventory: ReadonlyArray<{ type: string }> | undefined,
): Imyong10DetectInput["inventoryCounts"] {
  const counts: Imyong10DetectInput["inventoryCounts"] = {};
  for (const item of inventory ?? []) {
    const t = item.type.toUpperCase() as keyof Imyong10DetectInput["inventoryCounts"];
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}
