/**
 * 2-OPAMP cascade generator (임용 10번 형식).
 *
 *  Topology:
 *    V_i (AC source) → R_1 → V⁻(U_1)
 *    V⁻(U_1) → R_3 → V_o (U_1 output)  [feedback]
 *    V⁺(U_1) → GND
 *    V_o → R_4 → V⁻(U_2)
 *    V⁻(U_2) → R_5 → V_s (U_2 output)  [feedback]
 *    V⁺(U_2) → GND
 *    R_2, R_6: 보조 bias R (V⁻ → GND) — 이상 OPAMP에서는 분석에 영향 없음, 도면 표기용
 *
 *  학생 단계:
 *    [단계 1] V_s/V_o = -R_5/R_4  (U_2 단계 gain)
 *    [단계 2] V_o/V_i = -R_3/R_1  (U_1 단계 gain)
 *    [단계 3] V_s/V_i = (V_s/V_o)·(V_o/V_i) = (R_3·R_5)/(R_1·R_4)  (총 cascade gain)
 */

import type { CircuitTypeParams, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

export type OpampCascadeGeneration = {
  values: {
    R_1: number;  // V_i → V⁻(U_1) (kΩ)
    R_2: number;  // V⁻(U_1) → GND (kΩ, 도면용)
    R_3: number;  // V⁻(U_1) → V_o feedback (kΩ)
    R_4: number;  // V_o → V⁻(U_2) (kΩ)
    R_5: number;  // V⁻(U_2) → V_s feedback (kΩ)
    R_6: number;  // V⁻(U_2) → GND (kΩ, 도면용)
  };
  answer: {
    /** [단계 1] V_s/V_o = -R_5/R_4 */
    Vs_over_Vo: number;
    /** [단계 2] V_o/V_i = -R_3/R_1 */
    Vo_over_Vi: number;
    /** [단계 3] V_s/V_i = (R_3·R_5)/(R_1·R_4) */
    Vs_over_Vi: number;
  };
};

function trunc3(x: number): number {
  return Math.trunc(x * 1000) / 1000;
}

export function generateOpampCascade(args: {
  params?: CircuitTypeParams;
  seed?: number;
  mode?: GenerationMode;
}): OpampCascadeGeneration {
  const rand = makeRand(args.seed);

  // 변형 수치 — 원본 임용 10번: R_1=10, R_2=10, R_3=90, R_4=20, R_5=90, R_6=10 (kΩ)
  const R_1 = pick([10, 20], rand);
  const R_2 = pick([10, 20], rand);
  const R_3 = pick([90, 100, 80], rand);
  const R_4 = pick([10, 20, 30], rand);
  const R_5 = pick([60, 80, 90], rand);
  const R_6 = pick([10, 20], rand);

  const Vs_over_Vo_raw = -R_5 / R_4;
  const Vo_over_Vi_raw = -R_3 / R_1;
  const Vs_over_Vi_raw = (R_3 * R_5) / (R_1 * R_4);

  return {
    values: { R_1, R_2, R_3, R_4, R_5, R_6 },
    answer: {
      Vs_over_Vo: trunc3(Vs_over_Vo_raw),
      Vo_over_Vi: trunc3(Vo_over_Vi_raw),
      Vs_over_Vi: trunc3(Vs_over_Vi_raw),
    },
  };
}
