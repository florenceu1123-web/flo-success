import type { GenerationMode, OpampFiniteGainOffsetCircuitDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 유한 개방루프 이득 OPAMP + **출력단 오프셋 전압원 V_B** (임용 9번 전자회로) 전용 archetype.
 *
 *  회로: V_in → V⁺, 되먹임 분압(R₁: V⁻–접지, R₂: 출력–V⁻) → V⁻ = β·V_out,
 *        OPAMP 출력 V_D 뒤에 직렬 전압원 V_B → **V_out = V_D − V_B**.
 *
 *  〈해석 절차〉 (원본 3단계)
 *   [1] β = R₁/(R₁+R₂),  V_D = A₀(V_in − βV_out)
 *   [2] V_out = V_D − V_B  ⇒  **V_out = (A₀V_in − V_B)/(1 + A₀β)**
 *   [3] 수치 대입 → V_out(t)
 *
 *  ★ 형제 `opamp_finite_gain_block`(임용 11번)과 다르다 — 그쪽은 **블록도 + A(s)=A₀ω₀/(s+ω₀)**로
 *    V⁻[mV]를 구하고, 이쪽은 **출력단 직렬 전압원 V_B**가 정의적 특징이다(실측 오탈취).
 */

export type OpampFiniteGainOffsetGeneration = {
  values: {
    a0: number; r1k: number; r2k: number; vb: number;
    vinAmp: number; freqHz: number;   // v_in = vinAmp·sin(2π·freqHz·t)
  };
  answer: {
    beta: string;      // β (분수 표기)
    denom: number;     // 1 + A₀β
    gain: number;      // A₀/(1+A₀β)
    offset: number;    // V_B/(1+A₀β)
    voutText: string;  // 최종 v_out(t)
    omegaText: string; // 2000π 같은 각주파수 표기
  };
  circuitDiagram: OpampFiniteGainOffsetCircuitDiagram;
};

function fracText(n: number, d: number): string {
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const k = g(n, d) || 1;
  const nn = n / k, dd = d / k;
  return dd === 1 ? `${nn}` : `${nn}/${dd}`;
}

/** 규칙 열거 + 필터: 이득·오프셋이 깔끔한 조합만. 원본 튜플(100·99k·1k·1V·10V·1kHz) 제외. */
function buildSpace(): Array<OpampFiniteGainOffsetGeneration["values"]> {
  const out: Array<OpampFiniteGainOffsetGeneration["values"]> = [];
  for (const a0 of [50, 100, 200, 500]) {
    for (const [r1k, r2k] of [[99, 1], [9, 1], [4, 1], [19, 1], [49, 1], [9, 3], [8, 2]] as const) {
      const beta = r1k / (r1k + r2k);
      const denom = 1 + a0 * beta;
      if (!Number.isInteger(denom)) continue;
      const gain = a0 / denom;
      if (!Number.isInteger(gain) || gain < 1 || gain > 20) continue;
      for (const vb of [1, 2, 5]) {
        const offset = vb / denom;
        // 오프셋이 소수 둘째 자리까지 딱 떨어지게
        if (Math.abs(offset * 100 - Math.round(offset * 100)) > 1e-9) continue;
        for (const vinAmp of [5, 10, 20]) {
          for (const freqHz of [1000, 2000, 500]) {
            if (a0 === 100 && r1k === 99 && r2k === 1 && vb === 1 && vinAmp === 10 && freqHz === 1000) continue; // ★ 원본 제외
            out.push({ a0, r1k, r2k, vb, vinAmp, freqHz });
          }
        }
      }
    }
  }
  return out;
}
const SPACE = buildSpace();

export function generateOpampFiniteGainOffset(args: { seed?: number; mode: GenerationMode }): OpampFiniteGainOffsetGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 3; i++) rand();
  const variant = args.mode === "exam_variant";
  const half = Math.ceil(SPACE.length / 2);
  const pool = variant ? SPACE.slice(half) : SPACE.slice(0, half);
  const v = pick(pool.length ? pool : SPACE, rand);

  const denom = 1 + v.a0 * (v.r1k / (v.r1k + v.r2k));
  const gain = v.a0 / denom;
  const offset = v.vb / denom;
  const omega = 2 * v.freqHz;                       // ω = 2πf → "2000π" 형태로 표기
  const omegaText = `${omega}\\pi`;
  const voutText = `${gain * v.vinAmp}\\sin(${omegaText} t) - ${offset}`;

  return {
    values: v,
    answer: {
      beta: fracText(v.r1k, v.r1k + v.r2k),
      denom, gain, offset, voutText, omegaText,
    },
    circuitDiagram: {
      r1Label: `R_1 = ${v.r1k}\\,[\\mathrm{k\\Omega}]`,
      r2Label: `R_2 = ${v.r2k}\\,[\\mathrm{k\\Omega}]`,
      vbLabel: `V_B = ${v.vb}\\,[\\mathrm{V}]`,
      vinLabel: `v_{in} = ${v.vinAmp}\\sin(${omegaText} t)\\,[\\mathrm{V}]`,
      a0Label: `A_0 = ${v.a0}`,
    },
  };
}
