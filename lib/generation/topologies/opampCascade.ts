/**
 * 2-OPAMP cascade generator (임용 10번 형식) — ★ 전역 피드백 구조 ★.
 *
 *  Topology (opampCascadeRenderer 도면·원본 임용 10번과 일치):
 *    V_i (AC source) → R_1 → V⁻(U_1)
 *    V⁻(U_1) → R_3 → V_o (U_1 output)        [U_1 자체 피드백]
 *    V⁺(U_1) → R_2 → V_s                      [★ 전역 피드백 — U_2 출력이 U_1의 V⁺로]
 *    V⁺(U_1) → R_6 → GND                      [분배 하단]
 *    V_o → R_4 → V⁻(U_2)
 *    V⁻(U_2) → R_5 → V_s (U_2 output)        [U_2 피드백]
 *    V⁺(U_2) → GND
 *
 *  해석 (이상 OPAMP — 원본 해석 절차와 동일 3단계):
 *    [단계 1] U_2 반전증폭 (V⁺(U_2)=GND, 가상접지):
 *             V_s/V_o = −R_5/R_4 = G₂
 *    [단계 2] V⁺(U_1) = V_s·R_6/(R_2+R_6) = k·V_s               (R_2·R_6 전압 분배)
 *             V⁻(U_1) = V_i·R_3/(R_1+R_3) + V_o·R_1/(R_1+R_3)
 *                      = β·V_i + α·V_o                           (중첩 — OPAMP로 전류 유입 없음)
 *    [단계 3] V⁺ = V⁻ (이상 OPAMP 가상 단락):
 *             k·G₂·V_o = β·V_i + α·V_o
 *             → V_o/V_i = β / (k·G₂ − α)
 *             → V_s/V_i = G₂ · (V_o/V_i)
 *
 *  ⚠️ 이전 구현은 R_2·R_6를 "분석에 영향 없는 bias"로 가정하고 단순 cascade
 *     (V_o/V_i = −R_3/R_1)로 계산 — 렌더러 도면(전역 피드백)과 다른 회로를 풀어서
 *     그림·풀이가 불일치했음 (사용자 신고). 전역 피드백 해석으로 교체.
 */

import type { CircuitTypeParams, GenerationMode } from "@/types";
import { makeRand } from "./_helpers";

export type OpampCascadeValues = {
  R_1: number;  // V_i → V⁻(U_1) (kΩ)
  R_2: number;  // V⁺(U_1) → V_s 전역 피드백 (kΩ)
  R_3: number;  // V⁻(U_1) → V_o 피드백 (kΩ)
  R_4: number;  // V_o → V⁻(U_2) (kΩ)
  R_5: number;  // V⁻(U_2) → V_s 피드백 (kΩ)
  R_6: number;  // V⁺(U_1) → GND 분배 하단 (kΩ)
};

export type OpampCascadeGeneration = {
  values: OpampCascadeValues;
  answer: {
    /** [단계 1] V_s/V_o = −R_5/R_4 */
    Vs_over_Vo: number;
    /** [단계 2] V⁺(U_1) = k·V_s 의 k = R_6/(R_2+R_6) */
    vPlusCoef: number;
    /** [단계 2] V⁻(U_1) = β·V_i + α·V_o 의 β = R_3/(R_1+R_3) */
    beta: number;
    /** [단계 2] α = R_1/(R_1+R_3) */
    alpha: number;
    /** [단계 3] V_o/V_i = β/(k·G₂ − α) */
    Vo_over_Vi: number;
    /** [단계 3] V_s/V_i = G₂·(V_o/V_i) */
    Vs_over_Vi: number;
  };
};

/** 전역 피드백 회로 풀이 (이상 OPAMP) — 닫힌형 해. */
export function solveOpampCascade(v: OpampCascadeValues): OpampCascadeGeneration["answer"] {
  const G2 = -v.R_5 / v.R_4;
  const k = v.R_6 / (v.R_2 + v.R_6);
  const beta = v.R_3 / (v.R_1 + v.R_3);
  const alpha = v.R_1 / (v.R_1 + v.R_3);
  const Vo_over_Vi = beta / (k * G2 - alpha);
  const Vs_over_Vi = G2 * Vo_over_Vi;
  return {
    Vs_over_Vo: round6(G2),
    vPlusCoef: round6(k),
    beta: round6(beta),
    alpha: round6(alpha),
    Vo_over_Vi: round6(Vo_over_Vi),
    Vs_over_Vi: round6(Vs_over_Vi),
  };
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** 0.5 단위의 깔끔한 수인지 (부동소수점 오차 허용). */
function isNiceHalf(x: number): boolean {
  return Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
}

// ── 값 풀 — 모든 조합을 enumerate하고 답이 깔끔한 조합만 채택 ──
//   (원본 임용 10번 환산값: R_1=10, R_3=90, R_2=90, R_6=10, R_4=10, R_5=20 → V_o/V_i=−3, V_s/V_i=6)
const R1_POOL = [10, 20];
const R3_POOL = [40, 60, 80, 90, 160, 180];
const R2_POOL = [30, 40, 60, 80, 90];
const R6_POOL = [10, 20];
const R4_POOL = [10, 20];
const R5_POOL = [10, 20, 30, 40, 50, 60, 70, 80, 90];

type NiceCombo = { values: OpampCascadeValues; answer: OpampCascadeGeneration["answer"] };

/** 답이 깔끔한(0.5 단위) 조합 전체 enumerate — module-load 시 1회. */
function buildNiceCombos(): NiceCombo[] {
  const out: NiceCombo[] = [];
  for (const R_1 of R1_POOL) {
    for (const R_3 of R3_POOL) {
      for (const R_2 of R2_POOL) {
        for (const R_6 of R6_POOL) {
          for (const R_4 of R4_POOL) {
            for (const R_5 of R5_POOL) {
              const values: OpampCascadeValues = { R_1, R_2, R_3, R_4, R_5, R_6 };
              const answer = solveOpampCascade(values);
              // 채택 기준:
              //  · 단계별 답(V_s/V_o · V_o/V_i · V_s/V_i)이 모두 0.5 단위
              //  · V_o/V_i 크기 1~30 (자명하거나 비현실적이지 않게)
              //  · V_s/V_i 크기 1~50
              if (!isNiceHalf(answer.Vs_over_Vo)) continue;
              if (!isNiceHalf(answer.Vo_over_Vi) || !isNiceHalf(answer.Vs_over_Vi)) continue;
              if (Math.abs(answer.Vo_over_Vi) < 1 || Math.abs(answer.Vo_over_Vi) > 30) continue;
              if (Math.abs(answer.Vs_over_Vi) < 1 || Math.abs(answer.Vs_over_Vi) > 50) continue;
              out.push({ values, answer });
            }
          }
        }
      }
    }
  }
  return out;
}

const NICE_COMBOS: NiceCombo[] = buildNiceCombos();

export function generateOpampCascade(args: {
  params?: CircuitTypeParams;
  seed?: number;
  mode?: GenerationMode;
}): OpampCascadeGeneration {
  const rand = makeRand(args.seed);
  // RNG warm-up — 작은 seed 편향 방지
  for (let i = 0; i < 4; i++) rand();

  if (NICE_COMBOS.length === 0) {
    // 안전망 — 풀 구성이 잘못돼도 원본 환산값으로 폴백 (V_o/V_i=−3, V_s/V_i=6)
    const values: OpampCascadeValues = { R_1: 10, R_2: 90, R_3: 90, R_4: 10, R_5: 20, R_6: 10 };
    return { values, answer: solveOpampCascade(values) };
  }

  const idx = Math.floor(rand() * NICE_COMBOS.length);
  const combo = NICE_COMBOS[idx];
  return { values: { ...combo.values }, answer: { ...combo.answer } };
}
