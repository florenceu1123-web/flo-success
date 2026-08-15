import type { OpampSummerTFeedbackCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 2단 OPAMP — 반전 가산기(미지 저항 R₁) → **T형 궤환 반전증폭기** → 부하 전류 I_L
 * (임용 7번 전자회로) 전용 archetype. GPT 없음(닫힌형).
 *
 *  (가) 고정 토폴로지 (원본 그대로, 확대 확인):
 *   1단(반전 가산기): V_a —R_a— 마디 S,  V_b —R₁— 마디 S,  S —R_f— V₁ (궤환),  (+)는 접지
 *   2단(T형 궤환):    V₁ —R_in— 마디 M(=(−)),  M —R_ta— 마디 T,  T —R_tb— 접지,  T —R_tc— 단자 a(V_o)
 *                    (+)는 접지,  단자 a —R_L— 접지 (부하 전류 I_L)
 *
 * ★ 물리(닫힌형):
 *   [1] V₁ = −R_f(V_a/R_a + V_b/R₁)  →  **R₁ = V_b / (−V₁/R_f − V_a/R_a)**
 *   [2] T형 궤환의 등가 궤환저항은 **R_ta + R_tc + R_ta·R_tc/R_tb** 이므로
 *       **V_o = −(R_ta + R_tc + R_ta·R_tc/R_tb)/R_in · V₁**
 *       (유도: 가상접지이므로 I = V₁/R_in이 R_ta로 흘러 V_T = −I·R_ta,
 *        마디 T의 KCL I = V_T/R_tb + (V_T−V_o)/R_tc 를 풀면 위 식이 나온다.)
 *   [3] **I_L = V_o/R_L [mA]** (V[V]·R[kΩ] → mA)
 *  원본 검산(V_a=1V·R_a=1k / V_b=2V·R₁ 미지 / R_f=2k, V₁ 목표 −4V):
 *   R₁ = 2/(4/2 − 1/1) = **2[kΩ]**,  V_o = −(2+4+2·4/2)/4 · (−4) = −(10/4)(−4) = **10[V]**,
 *   R_L=5k → **I_L = 2[mA]**
 *
 * ★ 왜 전용 archetype인가: 실측에서 generic `opamp_cascade_voltage_divider`가 잡아
 *   **전역 되먹임 전달함수(V_o/V_i) 문제**로 통째로 변질됐다 — T형 궤환망(R_ta·R_tb·R_tc)도,
 *   미지 저항 R₁도, 부하 전류 I_L도 남지 않았다.
 *
 * ★ 값은 규칙 열거 + 필터 — 원본 튜플 제외.
 */

export type OpampSummerTFeedbackGeneration = {
  values: {
    Va: number; Ra: number; Vb: number; R1: number; Rf: number;   // 1단 [V]·[kΩ]
    V1: number;                                                    // 1단 출력 목표 [V] (음수)
    Rin: number; Rta: number; Rtb: number; Rtc: number;            // 2단 [kΩ]
    RL: number;                                                    // 부하 [kΩ]
  };
  answer: {
    R1: number;        // [단계 1] 미지 저항 [kΩ] (유사)
    Rf: number;        // [단계 1] 미지 궤환저항 [kΩ] (변형)
    Rfeq: number;      // T형 등가 궤환저항 [kΩ]
    gain: number;      // −V_o/V₁ (양수)
    Vo: number;        // [단계 2] 출력 전압 [V]
    IL: number;        // [단계 3] 부하 전류 [mA]
    RL: number;        // [단계 3] 목표 I_L을 만드는 부하 [kΩ] (변형)
  };
  circuitDiagram: OpampSummerTFeedbackCircuitDiagram;
};

type Family = {
  Va: number; Ra: number; Vb: number; R1: number; Rf: number; V1: number;
  Rin: number; Rta: number; Rtb: number; Rtc: number; RL: number;
};

// 원본 튜플 (참조·검증 전용, 생성 풀 제외).
const ORIGINAL: Family = {
  Va: 1, Ra: 1, Vb: 2, R1: 2, Rf: 2, V1: -4,
  Rin: 4, Rta: 2, Rtb: 2, Rtc: 4, RL: 5,
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;

function solve(f: Family, mode: GenerationMode): OpampSummerTFeedbackGeneration {
  const { Va, Ra, Vb, R1, Rf, V1, Rin, Rta, Rtb, Rtc, RL } = f;
  const Rfeq = Rta + Rtc + (Rta * Rtc) / Rtb;    // T형 등가 궤환저항
  const gain = Rfeq / Rin;                        // |V_o/V₁|
  const Vo = -gain * V1;
  const IL = Vo / RL;                             // [mA]
  const variant = mode === "exam_variant";

  const circuitDiagram: OpampSummerTFeedbackCircuitDiagram = {
    vaLabel: `${Va}V`, vbLabel: `${Vb}V`,
    raLabel: `${Ra}kΩ`,
    // 유사 = R₁이 미지 / 변형 = 궤환저항 R_f가 미지
    r1Label: variant ? `${R1}kΩ` : "R_1",
    rfLabel: variant ? "R_f" : `${Rf}kΩ`,
    v1Label: "V_1",
    rinLabel: `${Rin}kΩ`,
    rtaLabel: `${Rta}kΩ`, rtbLabel: `${Rtb}kΩ`, rtcLabel: `${Rtc}kΩ`,
    // 유사 = R_L이 주어짐(I_L을 구함) / 변형 = R_L이 미지(I_L이 주어짐)
    rlLabel: variant ? "R_L" : `R_L`,
    voLabel: "V_o", ilLabel: "I_L",
  };

  return {
    values: { Va, Ra, Vb, R1, Rf, V1, Rin, Rta, Rtb, Rtc, RL },
    answer: { R1, Rf, Rfeq: r3(Rfeq), gain: r3(gain), Vo: r3(Vo), IL: r3(IL), RL },
    circuitDiagram,
  };
}

/**
 * 규칙 열거 + 필터 (특정 예시 hardcode 금지).
 *   · R₁·R_f 모두 양수이고 0.5[kΩ] 배수(≤ 50)
 *   · T형 등가 궤환저항과 이득이 깔끔 — V_o가 정수, |V_o| ≤ 24
 *   · I_L이 0.5[mA] 배수, 0.5 ≤ |I_L| ≤ 10
 *   · 두 입력이 서로 다른 가지를 이루도록 R_a ≠ R₁ 이거나 V_a ≠ V_b
 *   · 원본 튜플 제외
 */
function buildSpace(): Family[] {
  const out: Family[] = [];
  const nice = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
  for (const Ra of [1, 2, 4, 5])
    for (const Rf of [2, 3, 4, 5, 6, 10])
      for (const Va of [1, 2, 3, 4, 5])
        for (const Vb of [1, 2, 3, 4, 6])
          for (const V1 of [-2, -3, -4, -5, -6, -8, -10]) {
            const denom = -V1 / Rf - Va / Ra;
            if (denom <= 0) continue;
            const R1 = Vb / denom;
            if (!nice(R1) || R1 < 0.5 || R1 > 50) continue;
            if (Ra === R1 && Va === Vb) continue;          // 두 가지가 완전히 같으면 가산의 의미가 약하다
            for (const Rin of [2, 4, 5, 10])
              for (const Rta of [1, 2, 4])
                for (const Rtb of [1, 2, 4])
                  for (const Rtc of [2, 4, 8]) {
                    const Rfeq = Rta + Rtc + (Rta * Rtc) / Rtb;
                    if (!Number.isInteger(Rfeq)) continue;
                    const gain = Rfeq / Rin;
                    if (gain < 1.5 || gain > 8) continue;   // 너무 작거나 큰 이득은 배제
                    const Vo = -gain * V1;
                    if (!Number.isInteger(Vo) || Math.abs(Vo) > 24) continue;
                    for (const RL of [1, 2, 2.5, 4, 5, 10]) {
                      const IL = Vo / RL;
                      if (Math.abs(IL * 2 - Math.round(IL * 2)) > 1e-9) continue;   // I_L은 0.5[mA] 배수 — 답이 9/5처럼 지저분해지지 않게
                      if (Math.abs(IL) < 0.2 || Math.abs(IL) > 10) continue;
                      const f: Family = { Va, Ra, Vb, R1, Rf, V1, Rin, Rta, Rtb, Rtc, RL };
                      if (
                        Va === ORIGINAL.Va && Ra === ORIGINAL.Ra && Vb === ORIGINAL.Vb &&
                        Rf === ORIGINAL.Rf && V1 === ORIGINAL.V1 && Rin === ORIGINAL.Rin &&
                        Rta === ORIGINAL.Rta && Rtb === ORIGINAL.Rtb && Rtc === ORIGINAL.Rtc &&
                        RL === ORIGINAL.RL
                      ) continue;                            // 원본 튜플 제외
                      out.push(f);
                      if (out.length > 4000) return out;     // 열거 상한
                    }
                  }
          }
  return out;
}
const SPACE = buildSpace();

/**
 * exam_similar = 원본 구조 — [1] **R₁**(가산 입력 저항) [2] V_o [3] R_L 주어짐 → **I_L**.
 * exam_variant = **구하는 양 교환** — [1] **R_f**(1단 궤환저항, R₁ 주어짐) [2] V_o
 *                [3] 목표 I_L이 주어짐 → **R_L**. 회로·절차는 동일.
 * 값 풀은 절반씩 나눠 두 모드가 서로 다른 수치를 쓴다.
 */
export function generateOpampSummerTFeedback(args: { seed?: number; mode: GenerationMode }): OpampSummerTFeedbackGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const half = Math.floor(SPACE.length / 2);
  const pool = SPACE.length < 8 ? SPACE : args.mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return solve(pick(pool.length ? pool : SPACE, rand), args.mode);
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalOpampSummerTFeedbackForVerify(): OpampSummerTFeedbackGeneration {
  return solve(ORIGINAL, "exam_similar");
}
/** 스모크용 — 생성 풀 크기. */
export function __opampSummerTFeedbackPoolSize(): number { return SPACE.length; }
