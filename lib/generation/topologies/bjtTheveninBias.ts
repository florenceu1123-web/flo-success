import type { BjtTheveninBiasCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * BJT 직류 바이어스 — **베이스 점선망을 테브난 등가로 변환** → I_B·V_B → V_CE 조건의 R_C
 * (임용 10번 전자회로) 전용 archetype. GPT 없음(닫힌형).
 *
 *  (가) 고정 토폴로지 (원본 확대 확인):
 *   · 트랜지스터는 **NPN**, 베이스가 아래(마디 V_B) — 이미터가 왼쪽 rail, 컬렉터가 오른쪽 rail.
 *   · 이미터측: 이미터 — R_E — (−) V_EE (+) — 접지  → **V_E = −V_EE + I_E·R_E** (음전원 바이어스)
 *   · 베이스측 점선망: [R₁ + V₁] ∥ [R₂ + V₂] (V₁은 음, V₂는 양)  → (나)에서 R_T + V_T로 치환
 *   · 컬렉터측: 컬렉터 — (R_p ∥ R_C) — 마디 M — (R_M ∥ 전류원 I_S↑) — 접지
 *
 * ★ 물리(닫힌형). ★ 원본 단서 **"β_DC + 1은 β_DC로 계산한다"** → I_E = I_C = β·I_B로 둔다.
 *   [1] **R_T = R₁∥R₂**, **V_T = (V₁/R₁ + V₂/R₂)·R_T**
 *   [2] 베이스 루프 V_T − I_B·R_T = V_BE + V_E, V_E = −V_EE + β·I_B·R_E 이므로
 *       **I_B = (V_T + V_EE − V_BE)/(R_T + β·R_E)**, **V_B = V_T − I_B·R_T**
 *   [3] V_E = −V_EE + β·I_B·R_E, **V_C = V_E + V_CE**, I_C = β·I_B.
 *       마디 M의 KCL: I_S = V_M/R_M + I_C → **V_M = R_M(I_S − I_C)**.
 *       (R_p ∥ R_C) = (V_M − V_C)/I_C → **R_C = R_p·R_par/(R_p − R_par)**
 *  원본 검산(V_EE=8·R_E=0.82k / R₁=R₂=2k·V₁=−8·V₂=+10 / R_p=1k·R_M=0.1k·I_S=100mA·V_CE=3.8V):
 *   R_T=1kΩ·V_T=1V → I_B = 8.3/83 = 0.1mA = **100µA**, V_B = **0.9V**,
 *   V_E = −8+10·0.82 = 0.2V → V_C = 4V, I_C = 10mA, V_M = 0.1(100−10) = 9V,
 *   R_par = (9−4)/10 = 0.5kΩ → **R_C = 1kΩ**.
 *
 * ★ 왜 전용 archetype인가: 실측에서 generic `bjt_bias`(임용 7번 — 저항률 ρ로 저항 구하기)가 잡아
 *   전혀 다른 문제가 생성됐다. 이 유형은 **(가)→(나) 테브난 등가 변환**과 **음전원 이미터 바이어스**,
 *   **전류원이 있는 컬렉터망**이 핵심이라 그 archetype으로 재현 불가.
 *
 * ★ 값은 규칙 열거 + 필터 — 원본 튜플 제외.
 */

export type BjtTheveninBiasGeneration = {
  values: {
    Vee: number; Re: number;              // 이미터측 [V]·[kΩ]
    R1: number; V1: number; R2: number; V2: number;   // 베이스 점선망
    Rp: number; Rm: number; Is: number;   // 컬렉터측 [kΩ]·[kΩ]·[mA]
    Vce: number; Rc: number;              // 목표 V_CE [V] / 정답 R_C [kΩ]
    beta: number; Vbe: number;
  };
  answer: {
    Rt: number; Vt: number;               // [단계 1]
    Ib: number; IbUa: number; Vb: number; // [단계 2] (I_B는 mA와 µA 둘 다)
    Ve: number; Vc: number; Ic: number; Vm: number; Rpar: number;
    Rc: number;                           // [단계 3] 유사
    Vce: number;                          // [단계 3] 변형(구하는 양 교환)
  };
  circuitDiagram: BjtTheveninBiasCircuitDiagram;   // (가) 원본
  equivDiagram: BjtTheveninBiasCircuitDiagram;     // (나) 테브난 등가
};

type Family = {
  Vee: number; Re: number; R1: number; V1: number; R2: number; V2: number;
  Rp: number; Rm: number; Is: number; Vce: number;
};

const BETA = 100, VBE = 0.7;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// 원본 튜플 (참조·검증 전용, 생성 풀 제외).
const ORIGINAL: Family = {
  Vee: 8, Re: 0.82, R1: 2, V1: -8, R2: 2, V2: 10,
  Rp: 1, Rm: 0.1, Is: 100, Vce: 3.8,
};

function solve(f: Family): BjtTheveninBiasGeneration {
  const { Vee, Re, R1, V1, R2, V2, Rp, Rm, Is, Vce } = f;
  const Rt = (R1 * R2) / (R1 + R2);
  const Vt = (V1 / R1 + V2 / R2) * Rt;
  const Ib = (Vt + Vee - VBE) / (Rt + BETA * Re);     // [mA]
  const Vb = Vt - Ib * Rt;
  const Ic = BETA * Ib;                                // I_E = I_C = βI_B (원본 단서)
  const Ve = -Vee + Ic * Re;
  const Vc = Ve + Vce;
  const Vm = Rm * (Is - Ic);
  const Rpar = (Vm - Vc) / Ic;
  const Rc = (Rp * Rpar) / (Rp - Rpar);

  const mk = (variant: "original" | "thevenin"): BjtTheveninBiasCircuitDiagram => ({
    variant,
    reLabel: `${Re * 1000}Ω`,
    veeLabel: `${Vee}V`,
    r1Label: `${R1}kΩ`, v1Label: `${Math.abs(V1)}V`, v1TopSign: V1 < 0 ? "-" : "+",
    r2Label: `${R2}kΩ`, v2Label: `${Math.abs(V2)}V`, v2TopSign: V2 < 0 ? "-" : "+",
    rtLabel: "R_T", vtLabel: "V_T",
    rpLabel: `${Rp}kΩ`, rcLabel: "R_C",
    rmLabel: `${Rm}kΩ`, isLabel: `${Is}mA`,
  });

  return {
    values: { Vee, Re, R1, V1, R2, V2, Rp, Rm, Is, Vce, Rc: r3(Rc), beta: BETA, Vbe: VBE },
    answer: {
      Rt: r3(Rt), Vt: r3(Vt),
      Ib: r3(Ib), IbUa: Math.round(Ib * 1000), Vb: r3(Vb),
      Ve: r3(Ve), Vc: r3(Vc), Ic: r3(Ic), Vm: r3(Vm), Rpar: r3(Rpar),
      Rc: r3(Rc), Vce,
    },
    circuitDiagram: mk("original"),
    equivDiagram: mk("thevenin"),
  };
}

/**
 * 규칙 열거 + 필터 (특정 예시 hardcode 금지).
 *   · R_T·V_T가 깔끔(V_T 정수 또는 0.5 배수)
 *   · I_B가 **정수 µA**(20~300), V_B가 소수 첫째 자리로 떨어짐
 *   · I_C < I_S (전류원이 컬렉터 전류를 감당해야 마디 M 전압이 양수)
 *   · R_par < R_p 이어야 R_C > 0, R_C는 0.5[kΩ] 배수(≤ 10)
 *   · 원본 튜플 제외
 */
function buildSpace(): Family[] {
  const out: Family[] = [];
  const isMul = (x: number, step: number) => Math.abs(x / step - Math.round(x / step)) < 1e-6;
  for (const Vee of [5, 6, 8, 10, 12])
    for (const Re of [0.5, 0.68, 0.82, 1])
      for (const Rb of [2, 4, 5, 10])                    // R₁ = R₂ (원본 구조 — 두 가지가 대칭)
        for (const V1 of [-4, -5, -6, -8, -10])
          for (const V2 of [4, 5, 6, 8, 10, 12]) {
            const Rt = Rb / 2, Vt = (V1 + V2) / 2;
            if (!isMul(Vt, 0.5)) continue;
            const Ib = (Vt + Vee - VBE) / (Rt + BETA * Re);
            const ua = Ib * 1000;
            if (!Number.isInteger(Math.round(ua * 100) / 100) || Math.abs(ua - Math.round(ua)) > 1e-6) continue;
            if (ua < 20 || ua > 300) continue;
            const Vb = Vt - Ib * Rt;
            if (!isMul(Math.round(Vb * 1000) / 1000, 0.1)) continue;
            const Ic = BETA * Ib;
            for (const Rp of [1, 2])
              for (const Rm of [0.1, 0.2, 0.5])
                for (const Is of [50, 100, 200])
                  for (const Vce of [2, 2.5, 3, 3.8, 4, 5]) {
                    if (Ic >= Is) continue;
                    const Ve = -Vee + Ic * Re, Vc = Ve + Vce;
                    const Vm = Rm * (Is - Ic);
                    const Rpar = (Vm - Vc) / Ic;
                    if (Rpar <= 0 || Rpar >= Rp) continue;
                    const Rc = (Rp * Rpar) / (Rp - Rpar);
                    if (!isMul(Math.round(Rc * 1000) / 1000, 0.5)) continue;
                    // ★ R_C가 0에 가까우면 r3 반올림으로 "0kΩ"가 되어 저항이 사라진다 — 0.5[kΩ] 이상만.
                    if (Rc < 0.5 || Rc > 10) continue;
                    const f: Family = { Vee, Re, R1: Rb, V1, R2: Rb, V2, Rp, Rm, Is, Vce };
                    if (
                      Vee === ORIGINAL.Vee && Re === ORIGINAL.Re && Rb === ORIGINAL.R1 &&
                      V1 === ORIGINAL.V1 && V2 === ORIGINAL.V2 && Rp === ORIGINAL.Rp &&
                      Rm === ORIGINAL.Rm && Is === ORIGINAL.Is && Vce === ORIGINAL.Vce
                    ) continue;                            // 원본 튜플 제외
                    out.push(f);
                    if (out.length > 4000) return out;
                  }
          }
  return out;
}
const SPACE = buildSpace();

/**
 * exam_similar = 원본 구조 — [3]에서 **V_CE 목표를 만족하는 R_C**를 구한다.
 * exam_variant = **구하는 양 교환** — [3]에서 **R_C가 주어지고 V_CE**를 구한다. 회로·절차는 동일.
 * 값 풀은 절반씩 나눠 두 모드가 서로 다른 수치를 쓴다.
 */
export function generateBjtTheveninBias(args: { seed?: number; mode: GenerationMode }): BjtTheveninBiasGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const half = Math.floor(SPACE.length / 2);
  const pool = SPACE.length < 8 ? SPACE : args.mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return solve(pick(pool.length ? pool : SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalBjtTheveninBiasForVerify(): BjtTheveninBiasGeneration {
  return solve(ORIGINAL);
}
/** 스모크용 — 생성 풀 크기. */
export function __bjtTheveninBiasPoolSize(): number { return SPACE.length; }
