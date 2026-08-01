import type { GenerationMode, OpampRcTOscillatorDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 반전 OPAMP 앞뒤에 **T형 RC망**을 둔 응용 회로 + 그 출력을 입력에 연결한 **사인파 발진기**
 * (임용 9번 형식) 전용 archetype — 결정론 생성, GPT 없음.
 *
 *  (가) 회로:
 *     전방 T : V_in ─[R]─ ① ─[R]─ (가상접지),  ①에서 [2C] 접지
 *     귀환 T : (가상접지) ─[C]─ ③ ─[C]─ V_out, ③에서 [½R] 접지
 *     OPAMP 는 이상적, (+) 단자 접지 → (−) 단자는 가상접지(0 V).
 *  (나) = (가)의 **출력단자와 입력단자를 연결**한 사인파 발진기.
 *
 * ★ 물리(닫힌형, 손계산):
 *   마디 ① KCL: (V_in−V₁)/R = V₁·2sC + V₁/R  →  V₁ = V_in/(2+2sRC)
 *     **I₁ = V₁/R = V_in / [2R(1+sRC)]**
 *   마디 ③ KCL: −sC·V₃ = (V₃−V_out)sC + V₃/(R/2)  →  V₃ = V_out·sRC/[2(1+sRC)]
 *     **I₂ = −sC·V₃ = −s²RC²·V_out / [2(1+sRC)]**
 *   가상접지 KCL(연산증폭기 입력전류 0): I₁ = I₂
 *     →  **H(s) = V_out(s)/V_in(s) = −1/(sRC)²**
 *   (나)는 V_out = V_in 이므로 특성방정식 **1 − H(s) = 0 → (sRC)² = −1 → s = ±j/(RC)**
 *     → 근이 순허수 = 지속 정현 발진, **ω₀ = 1/(RC), f₀ = 1/(2πRC)**
 *
 * ★★ **2C 와 ½R 이라는 계수가 이 회로의 설계점이다.** 일반화해서 ①의 션트를 αC,
 *   ③의 션트를 βR 로 두고 풀면
 *     H(s) = −(1+2sβRC) / [s²βR²C²(2+sαRC)]
 *   이고, 이것이 순수 2중적분기 −1/(sRC)² 로 떨어지는 것은 **α=2, β=1/2 일 때뿐이다**
 *   (상수항 1=2β, s항 2β=αβ). → 값 변형은 R·C 수치로만 하고 계수는 건드리지 않는다.
 *
 * ★ 모드
 *   유사(exam_similar) : 원본과 같은 배치(전방 RC-T / 귀환 CR-T). H(s) = −1/(sRC)².
 *   변형(exam_variant) : 두 T를 **교환**(전방 CR-T / 귀환 RC-T) = 쌍대 회로.
 *     같은 방법으로 풀면 I₁ = s²RC²·V_in/[2(1+sRC)], I₂ = −V_out/[2R(1+sRC)],
 *     **H(s) = −(sRC)²** 이고 발진 주파수는 동일하게 f₀ = 1/(2πRC) 이다(손계산 검증).
 */

export type OpampRcTOscillatorGeneration = {
  /** 전방 T가 RC형(원본)인가, CR형(변형=쌍대)인가 */
  swapped: boolean;
  values: {
    Rk: number;      // R [kΩ]
    Cn: number;      // C [nF]
    /** f₀ = fCoef/π [Hz] — fCoef = 10⁶/(2·R[kΩ]·C[nF]) (정수가 되도록 열거) */
    fCoef: number;
  };
  /** 각 단계 정답 (LaTeX) */
  answer: {
    i1: string;
    i2: string;
    transfer: string;
    charEq: string;
    omega: string;
    freq: string;
    freqNumeric: string;
  };
  diagramGiven: OpampRcTOscillatorDiagram;   // (가)
  diagramOsc: OpampRcTOscillatorDiagram;     // (나)
};

const R_KOHM = [1, 2, 4, 5, 10, 20, 25, 50, 100];
const C_NF = [1, 2, 4, 5, 10, 20, 25, 50, 100];

/** f₀ = 10⁶/(2π·R[kΩ]·C[nF]) [Hz]. 계수 10⁶/(2RC)가 정수인 조합만 쓴다. */
function buildSpace(): Array<{ Rk: number; Cn: number; fCoef: number }> {
  const out: Array<{ Rk: number; Cn: number; fCoef: number }> = [];
  for (const Rk of R_KOHM) {
    for (const Cn of C_NF) {
      const prod = Rk * Cn;
      const coef = 500000 / prod;                 // 10⁶/(2·R·C)
      if (!Number.isInteger(coef)) continue;
      if (coef < 50 || coef > 50000) continue;    // 가청~수십 kHz 범위로 제한
      out.push({ Rk, Cn, fCoef: coef });
    }
  }
  return out;
}
const SPACE = buildSpace();

export function generateOpampRcTOscillator(args: { seed?: number; mode: GenerationMode }): OpampRcTOscillatorGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  if (SPACE.length === 0) throw new Error("opampRcTOscillator: 값 공간이 비었다");
  const { Rk, Cn, fCoef } = pick(SPACE, rand);
  const swapped = args.mode === "exam_variant";

  // ── 각 단계 정답 (LaTeX) ────────────────────────────────────────
  const i1 = swapped
    ? `I_1(s) = \\dfrac{s^{2}RC^{2}}{2(1+sRC)}V_{in}(s)`
    : `I_1(s) = \\dfrac{V_{in}(s)}{2R(1+sRC)}`;
  const i2 = swapped
    ? `I_2(s) = -\\dfrac{V_{out}(s)}{2R(1+sRC)}`
    : `I_2(s) = -\\dfrac{s^{2}RC^{2}}{2(1+sRC)}V_{out}(s)`;
  const transfer = swapped
    ? `\\dfrac{V_{out}(s)}{V_{in}(s)} = -(sRC)^{2}`
    : `\\dfrac{V_{out}(s)}{V_{in}(s)} = -\\dfrac{1}{(sRC)^{2}}`;
  const charEq = swapped
    ? `1 + (sRC)^{2} = 0`
    : `1 + \\dfrac{1}{(sRC)^{2}} = 0 \\;\\Rightarrow\\; (sRC)^{2} + 1 = 0`;

  return {
    swapped,
    values: { Rk, Cn, fCoef },
    answer: {
      i1, i2, transfer, charEq,
      omega: `\\omega_0 = \\dfrac{1}{RC}`,
      freq: `f_0 = \\dfrac{1}{2\\pi RC}`,
      freqNumeric: `\\dfrac{${fCoef}}{\\pi}\\,[\\mathrm{Hz}]`,
    },
    diagramGiven: { swapped, feedbackToInput: false, rLabel: `${Rk}\\,[\\mathrm{k\\Omega}]`, cLabel: `${Cn}\\,[\\mathrm{nF}]`, caption: "(가)" },
    diagramOsc: { swapped, feedbackToInput: true, rLabel: `${Rk}\\,[\\mathrm{k\\Omega}]`, cLabel: `${Cn}\\,[\\mathrm{nF}]`, caption: "(나)" },
  };
}
