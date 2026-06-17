import type { GenerationMode, OpampTwoStageCircuitDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 2단 OPAMP 응용회로 (임용 2번 형식) — 전용 archetype.
 *
 *  구조: V_i → [1단 비반전 증폭 ×A1] → V_P → [2단 반전 증폭 ×(−A2)] → V_o.
 *    1단: V_i가 (+)입력, (−)입력은 Rg1→GND·Rf1 피드백 → V_P = (1+Rf1/Rg1)·V_i = A1·V_i.
 *    2단: V_P → Rin2 → (−)입력, Rf2 피드백, (+)→GND → V_o = −(Rf2/Rin2)·V_P = −A2·V_P.
 *  문제: V_P 값이 주어질 때 V_i = V_P/A1, V_o = −A2·V_P 를 순서대로 도출.
 *
 *  ★ generic opamp/opamp_generic·cascade archetype은 이 "V_P 주어지고 V_i·V_o 도출" 구조를
 *    재현 못 함(다른 문제 생성) → 전용 결정론 archetype.
 *
 *  값(이득·V_P)만 규칙으로 구성 — 예시 목록 아님. 깔끔한 정수 V_i·V_o 보장.
 */

export type OpampTwoStageGeneration = {
  values: {
    A1: number;       // 1단 비반전 이득 (=1+Rf1/Rg1)
    A2: number;       // 2단 반전 이득 크기 (=Rf2/Rin2)
    VP: number;       // 주어지는 마디 전압 V_P (V)
    Rg1_k: number; Rf1_k: number; Rin2_k: number; Rf2_k: number; // kΩ
  };
  answer: { Vi: number; Vo: number };
  circuitDiagram: OpampTwoStageCircuitDiagram;
};

// 규칙 기반 1차값: 비반전 이득 A1, 반전 이득 A2, V_P를 독립 선택 → 저항·정답 계산.
const A1_CHOICES = [2, 3];           // 1+Rf1/Rg1 (Rg1=1k → Rf1=(A1-1)k)
const A2_CHOICES = [2, 3, 4, 5];     // Rf2/Rin2 (Rin2=1k → Rf2=A2·1k)
const GAIN_R_BASE = 1;               // kΩ 기준

/** A1·V_P로 V_i 정수가 되도록 V_P 후보 (V_P = A1·정수). */
function vpChoices(A1: number): number[] {
  return [A1 * 1, A1 * 2]; // V_i = 1 또는 2
}

function solve(A1: number, A2: number, VP: number): OpampTwoStageGeneration {
  const Rg1_k = GAIN_R_BASE;
  const Rf1_k = (A1 - 1) * GAIN_R_BASE;  // A1 = 1 + Rf1/Rg1
  const Rin2_k = GAIN_R_BASE;
  const Rf2_k = A2 * GAIN_R_BASE;        // A2 = Rf2/Rin2
  const Vi = VP / A1;
  const Vo = -A2 * VP;
  return {
    values: { A1, A2, VP, Rg1_k, Rf1_k, Rin2_k, Rf2_k },
    answer: { Vi, Vo },
    circuitDiagram: {
      viLabel: "v_i",
      rg1Label: `${Rg1_k}kΩ`,
      rf1Label: `${Rf1_k}kΩ`,
      rin2Label: `${Rin2_k}kΩ`,
      rf2Label: `${Rf2_k}kΩ`,
      vpLabel: "V_P",
      voLabel: "V_o",
    },
  };
}

/** seed·mode로 이득·V_P를 골라 결정론 생성. */
export function generateOpampTwoStage(args: {
  seed?: number;
  mode: GenerationMode;
}): OpampTwoStageGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  // 유사=A1 작은쪽(2), 변형=A1 큰쪽(3) 선호로 살짝 분리
  const a1Pool = args.mode === "exam_variant" ? [3, 2] : [2, 3];
  const A1 = pick(a1Pool, rand);
  const A2 = pick(A2_CHOICES, rand);
  const VP = pick(vpChoices(A1), rand);
  return solve(A1, A2, VP);
}
