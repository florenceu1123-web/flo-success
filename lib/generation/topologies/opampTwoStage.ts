import type { GenerationMode, OpampTwoStageCircuitDiagram } from "@/types";
import { makeRand, pick, round3 } from "./_helpers";

/**
 * 2단 OPAMP 응용회로 (임용 2번 형식) — 전용 archetype.
 *
 *  구조: V_i → [1단 비반전 ×A1] → V_P → [2단 반전, T자 피드백] → V_o.
 *    1단: V_i가 (+)입력, (−)입력은 Rg1→GND·Rf1 피드백 → V_P = (1+Rf1/Rg1)·V_i = A1·V_i.
 *    2단(★ T-network 반전): V_P → Ra → 마디 N → Rb → op2(−,가상접지), (+)→GND.
 *         피드백: op2(−) → Rf2 → V_o, 그리고 ★ N → Rf3 → V_o ★ (T자).
 *      이득 G2 = V_o/V_P = −1 / [ Ra·( (Rb/Rf2)(1/Ra+1/Rb+1/Rf3) + 1/Rf3 ) ].
 *      원본(Ra=Rb=1k·Rf2=7k·Rf3=10k) → G2=−2.5 → V_P=2V면 V_o=−5V (정답 일치).
 *  문제: V_P 주어질 때 V_i=V_P/A1, V_o=G2·V_P 순서대로 도출.
 *
 *  값(이득·V_P)은 규칙 기반 구성 — 예시 목록 아님. V_i·V_o 깔끔(정수/0.5) 보장. 원본 튜플 제외.
 */

export type OpampTwoStageGeneration = {
  values: {
    A1: number;        // 1단 비반전 이득
    VP: number;        // 주어지는 마디 전압 (V)
    G2: number;        // 2단 T-network 이득 (음수)
    Rg1_k: number; Rf1_k: number;
    Ra_k: number; Rb_k: number; Rf2_k: number; Rf3_k: number; // 2단 (kΩ)
  };
  answer: { Vi: number; Vo: number };
  circuitDiagram: OpampTwoStageCircuitDiagram;
};

/** T자 피드백 반전증폭기 이득 V_o/V_P (저항은 동일 단위, kΩ). */
function stage2Gain(Ra: number, Rb: number, Rf2: number, Rf3: number): number {
  return -1 / (Ra * ((Rb / Rf2) * (1 / Ra + 1 / Rb + 1 / Rf3) + 1 / Rf3));
}

// 2단은 원본 T-network 패밀리(Ra=Rb·Rf2:Rf3=7:10 → G2=−2.5)를 스케일만 달리해 사용.
//   (T-network 이득은 스케일 불변 → 저항 크기는 달라도 G2=−2.5 유지. 값 다양성 + 구조 동일.)
const STAGE2_SCALES = [1, 2]; // ×1 → (1,1,7,10), ×2 → (2,2,14,20)
const A1_CHOICES = [2, 3, 4];
const VP_CHOICES = [2, 3, 4, 6, 8];

type Combo = { A1: number; VP: number; scale: number };

/** 규칙 제약(V_i 양의 정수, V_o 0.5배수, 원본 제외)을 만족하는 조합 enumerate. */
function buildSpace(): Combo[] {
  const out: Combo[] = [];
  for (const A1 of A1_CHOICES)
    for (const VP of VP_CHOICES) {
      if (VP % A1 !== 0) continue;       // V_i = VP/A1 정수
      const Vi = VP / A1;
      if (Vi < 1) continue;
      for (const scale of STAGE2_SCALES) {
        const G2 = stage2Gain(scale, scale, 7 * scale, 10 * scale); // = −2.5
        const Vo = G2 * VP;
        if (Math.abs(Vo * 2 - Math.round(Vo * 2)) > 1e-9) continue; // 0.5 배수
        // 원본 튜플 제외 (A1=2, scale=1, VP=2 → V_i=1·V_o=−5)
        if (A1 === 2 && scale === 1 && VP === 2) continue;
        out.push({ A1, VP, scale });
      }
    }
  return out;
}
const SPACE = buildSpace();

function solve(c: Combo): OpampTwoStageGeneration {
  const Rg1_k = 1, Rf1_k = (c.A1 - 1) * 1;       // A1 = 1+Rf1/Rg1
  const Ra_k = 1 * c.scale, Rb_k = 1 * c.scale;
  const Rf2_k = 7 * c.scale, Rf3_k = 10 * c.scale;
  const G2 = round3(stage2Gain(Ra_k, Rb_k, Rf2_k, Rf3_k));
  const Vi = c.VP / c.A1;
  const Vo = round3(G2 * c.VP);
  return {
    values: { A1: c.A1, VP: c.VP, G2, Rg1_k, Rf1_k, Ra_k, Rb_k, Rf2_k, Rf3_k },
    answer: { Vi, Vo },
    circuitDiagram: {
      viLabel: "v_i",
      rg1Label: `${Rg1_k}kΩ`,
      rf1Label: `${Rf1_k}kΩ`,
      rin2aLabel: `${Ra_k}kΩ`,
      rin2bLabel: `${Rb_k}kΩ`,
      rf2Label: `${Rf2_k}kΩ`,
      rf3Label: `${Rf3_k}kΩ`,
      vpLabel: "V_P",
      voLabel: "V_o",
    },
  };
}

export function generateOpampTwoStage(args: {
  seed?: number;
  mode: GenerationMode;
}): OpampTwoStageGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  // mode로 공간 반분 (유사/변형 분리). 구조·풀이법 동일, 값만 다름.
  const half = Math.floor(SPACE.length / 2);
  const space = args.mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return solve(pick(space.length ? space : SPACE, rand));
}

/** 원본 검증용 (생성 풀에서는 제외된 튜플). */
export function __originalForVerify(): OpampTwoStageGeneration {
  return solve({ A1: 2, VP: 2, scale: 1 });
}
