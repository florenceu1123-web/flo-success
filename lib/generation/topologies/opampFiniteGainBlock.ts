import type { GenerationMode, OpampFiniteGainCircuitDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 연산증폭기 유한 개방루프 이득 + 블록도 (임용 11번 형식) — 전용 결정론 archetype.
 *
 *  구조 (가): V_in ─ R₁ ─ V⁻(반전입력) ─ R₂ ─ V_out (피드백), V⁺=GND.
 *    개방루프 이득 A(s)=A₀ω₀/(s+ω₀). V_out = A(s)·(V⁺−V⁻) = −A(s)·V⁻.
 *  블록도 (나): V_in→α→Σ→A(s)→V_out, V_out→β→Σ (피드백).
 *
 *  해석 절차 (3단계, 결정론):
 *    [1] 중첩 — V⁻ = α·V_in + β·V_out, R₁·R₂로 α·β 표현.
 *          α = R₂/(R₁+R₂)  (V_out 단락 시 V_in 분배),
 *          β = R₁/(R₁+R₂)  (V_in 단락 시 V_out 분배).
 *    [2] A(s) 대입 — V_out=−A(s)·V⁻ → V⁻(1+β·A(s))=α·V_in
 *          → V⁻ = A_s·V_in,  A_s = α/(1+β·A(s)).
 *    [3] 수치 — DC(s→0, A=A₀): V⁻ = α·V_in/(1+β·A₀) [mV].
 *          (결과는 소수점 이하 둘째 자리에서 반올림하여 첫째 자리까지.)
 *
 *  ★ 유한 이득이라 V⁻은 0(가상접지)이 아닌 작은 유한값 — 이 점이 학습 포인트.
 *  값은 규칙 기반 열거(특정 예시 hardcode 금지). 원본 튜플(1k·99k·10⁵·0.1V) 제외.
 */

export type OpampFiniteGainGeneration = {
  values: {
    R1_k: number;   // R₁ [kΩ]
    R2_k: number;   // R₂ [kΩ]
    A0: number;     // 직류 이득 A₀
    Vin: number;    // 입력 전압 [V]
    alpha: number;  // R₂/(R₁+R₂)
    beta: number;   // R₁/(R₁+R₂)
  };
  answer: {
    Vminus_mV: number; // V⁻ [mV], 소수 첫째 자리 반올림
  };
  circuitDiagram: OpampFiniteGainCircuitDiagram;
};

type Combo = { R1_k: number; R2_k: number; A0: number; Vin: number };

// 분모(R₁+R₂)가 깔끔하고 R₂≫R₁(반전 구성, 큰 폐루프 이득)인 저항쌍.
//   α=R₂/(R₁+R₂)·β=R₁/(R₁+R₂)가 유한소수.
const R_PAIRS: Array<[number, number]> = [
  [1, 99], [2, 98], [5, 95],   // 합 100
  [1, 199], [2, 198], [4, 196], // 합 200
  [1, 49], [2, 48], [5, 45],   // 합 50
  [10, 90], [4, 96],           // 합 100 (다른 비)
];
const A0_CHOICES = [1e5, 2e5, 5e5, 1e6];
const VIN_CHOICES = [0.1, 0.2, 0.5, 1, 2];

/** V⁻[mV] = α·V_in/(1+β·A₀), 소수 첫째 자리 반올림. */
function solveVminusMv(c: Combo): { alpha: number; beta: number; mv: number } {
  const sum = c.R1_k + c.R2_k;
  const alpha = c.R2_k / sum;
  const beta = c.R1_k / sum;
  const vminus = (alpha * c.Vin) / (1 + beta * c.A0); // [V]
  const mv = Math.round(vminus * 1000 * 10) / 10;     // [mV] → 1자리
  return { alpha, beta, mv };
}

/** 규칙 제약(표시 가능한 V⁻ ≥ 0.1mV, 원본 제외)을 만족하는 조합 enumerate. */
function buildSpace(): Combo[] {
  const out: Combo[] = [];
  for (const [R1_k, R2_k] of R_PAIRS)
    for (const A0 of A0_CHOICES)
      for (const Vin of VIN_CHOICES) {
        const c = { R1_k, R2_k, A0, Vin };
        const { mv } = solveVminusMv(c);
        if (mv < 0.1) continue; // 너무 작아 표시 불가
        if (mv > 50) continue;  // 비현실적으로 큼(루프이득 작음) 제외
        // 원본 튜플 제외 (1k·99k·10⁵·0.1V)
        if (R1_k === 1 && R2_k === 99 && A0 === 1e5 && Vin === 0.1) continue;
        out.push(c);
      }
  return out;
}
const SPACE = buildSpace();

function solve(c: Combo): OpampFiniteGainGeneration {
  const { alpha, beta, mv } = solveVminusMv(c);
  return {
    values: { R1_k: c.R1_k, R2_k: c.R2_k, A0: c.A0, Vin: c.Vin, alpha, beta },
    answer: { Vminus_mV: mv },
    circuitDiagram: {
      vinLabel: "V_in",
      r1Label: `R₁`,
      r2Label: `R₂`,
      voutLabel: "V_out",
      asLabel: "A(s)",
    },
  };
}

export function generateOpampFiniteGainBlock(args: {
  seed?: number;
  mode: GenerationMode;
}): OpampFiniteGainGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  // mode로 공간 반분 (유사/변형 분리). 구조·풀이법 동일, 값만 다름.
  const half = Math.floor(SPACE.length / 2);
  const space = args.mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return solve(pick(space.length ? space : SPACE, rand));
}

/** 원본 검증용 (생성 풀에서는 제외된 튜플). */
export function __originalForVerify(): OpampFiniteGainGeneration {
  return solve({ R1_k: 1, R2_k: 99, A0: 1e5, Vin: 0.1 });
}
