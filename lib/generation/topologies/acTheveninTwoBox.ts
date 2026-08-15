import type { AcTheveninTwoBoxCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 점선 박스 2개(전압원망 a-b + 전류원망 c-d)가 **병렬로** 부하 R_L을 구동 → 테브난 합성 +
 * 순저항 최대평균전력 (임용 10번 회로이론) 전용 archetype. GPT 없음(복소 닫힌형).
 *
 *  (가) 고정 토폴로지 (원본 그대로):
 *   위 박스: V_s∠0° — R₁ — 마디 m — jX_L1 — **단자 a**,  마디 m ↓ −jX_C1 ↓ 접지(**단자 b**)
 *   아래 박스: I_s∠0° ↑ 마디 f,  f ↓ (R₂ ∥ jX_L2) ↓ 접지(**단자 d**),  f — −jX_C2 — **단자 c**
 *   우측: **a–c 접속, b–d 접속** — 두 회로망이 같은 단자쌍에서 **병렬로** 부하 R_L을 구동한다.
 *   ★ 원본 이미지를 확대해 확인한 배선이다(단자 a에서 나온 도선이 R_L 위쪽과 c로, R_L 아래쪽이
 *     b와 d로 이어진다). 처음엔 직렬로 읽었으나 b–c 접속은 존재하지 않는다.
 *
 * ★ 물리(닫힌형):
 *   Z₁ = jX_L1 + (R₁ ∥ −jX_C1),   V₁ = V_s·(−jX_C1)/(R₁ − jX_C1)   ← 위 박스(a-b)
 *   Z₂ = −jX_C2 + (R₂ ∥ jX_L2),   V₂ = I_s·(R₂ ∥ jX_L2)            ← 아래 박스(c-d)
 *   병렬이므로 **Z_th = Z₁ ∥ Z₂**, **V_th = (V₁/Z₁ + V₂/Z₂)·Z_th**(전원 변환 후 합성).
 *   순저항 부하의 최대전력: **R_L = |Z_th|**,  P_max = |V_th|²·R_L /((R_th+R_L)² + X_th²)
 *   (Z_th가 순저항이면 R_L = R_th, P = |V_th|²/(4R_th).)
 *  원본 검산(V_s=1·R₁=100·X_C1=100·X_L1=50 / I_s=0.01·R₂=100·X_L2=100·X_C2=50):
 *   R₁∥−jX_C1 = 50−j50 → **Z₁ = 50Ω**, V₁ = 0.5−j0.5
 *   R₂∥jX_L2 = 50+j50 → **Z₂ = 50Ω**, V₂ = 0.5+j0.5
 *   → **Z_th = 25Ω(순저항), V_th = 0.5∠0°V, R_L = 25Ω, P_max = 2.5[mW]**
 *
 * ★ 기존 `theveninMaxPower`(같은 임용 10번을 병렬로 모델링)와 결합 방식은 같지만 **토폴로지·발문이
 *   다르다** — 이 원본은 **점선 박스 2개 + 단자쌍 2개(a-b·c-d)**라 단계 1·2가 박스별로 나뉜다.
 *   실측에서 그 archetype이 잡아 단자쌍 하나짜리 회로로 변질됐고 풀이의 Z_th 계산도 틀렸다.
 *
 * ★ 값은 규칙 열거 + 필터 — 원본 튜플 제외.
 */

type Cx = { re: number; im: number };
const cx = {
  add: (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im }),
  mul: (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a: Cx, b: Cx): Cx => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  abs: (a: Cx): number => Math.hypot(a.re, a.im),
};
const par = (a: Cx, b: Cx): Cx => cx.div(cx.mul(a, b), cx.add(a, b));
const r3 = (x: number) => Math.round(x * 1000) / 1000;
function zText(z: Cx): string {
  const re = r3(z.re), im = r3(z.im);
  if (Math.abs(im) < 1e-9) return `${re}`;
  if (Math.abs(re) < 1e-9) return `${im < 0 ? "−" : ""}j${Math.abs(im)}`;
  return `${re} ${im < 0 ? "−" : "+"} j${Math.abs(im)}`;
}
/**
 * 페이저 극형식 표기. ★ 이 유형은 설계상 위상이 0°·±45°라 크기가 k√2인 경우가 많다 —
 * 소수(1.061)로 두면 route의 전역 분수 변환기가 **35/33** 같은 값으로 뭉갠다(실측).
 * k√2로 인수분해되면 그렇게 적는다.
 */
function phText(z: Cx): string {
  const m = cx.abs(z);
  const deg = r3((Math.atan2(z.im, z.re) * 180) / Math.PI);
  const k = m / Math.SQRT2;
  const kR = r3(k);
  if (m > 1e-12 && Math.abs(k - kR) < 1e-9 && Math.abs(m - r3(m)) > 1e-12) {
    return `${kR === 1 ? "" : kR}√2∠${deg}°`;   // 1√2가 아니라 √2로
  }
  return `${r3(m)}∠${deg}°`;
}

export type AcTheveninTwoBoxGeneration = {
  values: {
    Vs: number; R1: number; Xc1: number; Xl1: number;
    Is: number; R2: number; Xl2: number; Xc2: number;
  };
  answer: {
    Z1: Cx; Z2: Cx; Zth: Cx; V1: Cx; V2: Cx; Vth: Cx;
    z1Text: string; z2Text: string; zthText: string;
    v1Text: string; v2Text: string; vthText: string;
    RL: number; Pmax: number; pmaxText: string;
  };
  circuitDiagram: AcTheveninTwoBoxCircuitDiagram;
};

type Family = { Vs: number; R1: number; Xc1: number; Xl1: number; Is: number; R2: number; Xl2: number; Xc2: number };

// 원본 튜플 (참조·검증 전용, 생성 풀 제외).
const ORIGINAL: Family = { Vs: 1, R1: 100, Xc1: 100, Xl1: 50, Is: 0.01, R2: 100, Xl2: 100, Xc2: 50 };

function solve(f: Family): AcTheveninTwoBoxGeneration {
  const { Vs, R1, Xc1, Xl1, Is, R2, Xl2, Xc2 } = f;
  const Zp1 = par({ re: R1, im: 0 }, { re: 0, im: -Xc1 });
  const Z1 = cx.add({ re: 0, im: Xl1 }, Zp1);
  const V1 = cx.mul({ re: Vs, im: 0 }, cx.div({ re: 0, im: -Xc1 }, { re: R1, im: -Xc1 }));
  const Zp2 = par({ re: R2, im: 0 }, { re: 0, im: Xl2 });
  const Z2 = cx.add({ re: 0, im: -Xc2 }, Zp2);
  const V2 = cx.mul({ re: Is, im: 0 }, Zp2);

  // ★ 두 회로망은 같은 단자쌍(a=c, b=d)에 **병렬**로 붙는다 — 전원 변환 후 합성.
  const Zth = par(Z1, Z2);
  const Vth = cx.mul(cx.add(cx.div(V1, Z1), cx.div(V2, Z2)), Zth);
  const RL = cx.abs(Zth);
  const den = (Zth.re + RL) ** 2 + Zth.im ** 2;
  const Pmax = (cx.abs(Vth) ** 2 * RL) / den;
  // 1W 미만은 mW로 — 0.3125[W]처럼 반올림이 지저분해지는 표기를 피한다.
  const pmaxText = Pmax < 1 ? `${r3(Pmax * 1000)}[mW]` : `${r3(Pmax)}[W]`;

  const circuitDiagram: AcTheveninTwoBoxCircuitDiagram = {
    vsLabel: `${Vs}∠0°V`, r1Label: `${R1}Ω`, xc1Label: `−j${Xc1}Ω`, xl1Label: `j${Xl1}Ω`,
    isLabel: `${Is}∠0°A`, r2Label: `${R2}Ω`, xl2Label: `j${Xl2}Ω`, xc2Label: `−j${Xc2}Ω`,
    rlLabel: "R_L",
  };

  return {
    values: { Vs, R1, Xc1, Xl1, Is, R2, Xl2, Xc2 },
    answer: {
      Z1, Z2, Zth, V1, V2, Vth,
      z1Text: zText(Z1), z2Text: zText(Z2), zthText: zText(Zth),
      v1Text: phText(V1), v2Text: phText(V2), vthText: phText(Vth),
      RL: r3(RL), Pmax: Math.round(Pmax * 1e9) / 1e9, pmaxText,
    },
    circuitDiagram,
  };
}

/**
 * 규칙 열거 + 필터 (특정 예시 hardcode 금지).
 *   ★ 원본의 설계 원리를 규칙으로: R = X_C(위 박스)·R = X_L(아래 박스)이면 병렬부가 R/2(1∓j)가 되고,
 *     직렬 리액턴스를 R/2로 두면 각 박스의 Z가 **순저항 R/2**가 된다 → Z_th가 순저항이라 답이 깔끔.
 *     또 V₁/Z₁ + V₂/Z₂ = (V_s/R₁ + I_s) + j(I_s − V_s/R₁) 이므로 **I_s = V_s/R₁** 이면
 *     V_th가 실수가 된다(원본: I_s=0.01 = 1/100 ✓).
 *   필터: R_L 정수, P_max가 0.1mW 배수, I_s가 깔끔한 값. 원본 튜플 제외.
 */
function buildSpace(): Family[] {
  const out: Family[] = [];
  for (const R1 of [40, 60, 80, 100, 120, 160, 200])
    for (const R2 of [40, 60, 80, 100, 120, 160, 200])
      for (const Vs of [1, 2, 4, 5, 10]) {
        const Is = Vs / R1;                                  // V_th를 실수로 만드는 설계 조건
        if (!Number.isInteger(Math.round(Is * 1e6) / 1e6 * 1e4)) continue;   // I_s가 0.0001 단위로 떨어지게
        const f: Family = { Vs, R1, Xc1: R1, Xl1: R1 / 2, Is: Math.round(Is * 1e6) / 1e6, R2, Xl2: R2, Xc2: R2 / 2 };
        if (!Number.isInteger(f.Xl1) || !Number.isInteger(f.Xc2)) continue;
        const a = solve(f).answer;
        if (!Number.isInteger(a.RL)) continue;
        if (Math.abs(a.Zth.im) > 1e-9) continue;             // 순저항 Z_th (원본과 같은 설계)
        const mW = a.Pmax * 1000;
        if (Math.abs(mW - Math.round(mW)) > 1e-6) continue;   // P_max가 정수[mW] — 답 표기가 깔끔하게
        if (mW < 0.5 || mW > 500) continue;
        if (
          Vs === ORIGINAL.Vs && R1 === ORIGINAL.R1 && R2 === ORIGINAL.R2
        ) continue;                                          // 원본 튜플 제외
        out.push(f);
      }
  return out;
}
const SPACE = buildSpace();

/**
 * 유사·변형 모두 **같은 회로**. 모드는 ★단계에서 묻는 대상★만 교환한다(파이프라인이 사용):
 *   exam_similar = [1] 단자 a-b의 Z(전압원망) · [2] 단자 c-d의 V_th(전류원망)   ← 원본
 *   exam_variant = [1] 단자 c-d의 Z(전류원망) · [2] 단자 a-b의 V_th(전압원망)
 * 값 풀은 절반씩 나눠 두 모드가 서로 다른 수치를 쓴다.
 */
export function generateAcTheveninTwoBox(args: { seed?: number; mode: GenerationMode }): AcTheveninTwoBoxGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const half = Math.floor(SPACE.length / 2);
  const pool = SPACE.length < 8 ? SPACE : args.mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return solve(pick(pool.length ? pool : SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalAcTheveninTwoBoxForVerify(): AcTheveninTwoBoxGeneration {
  return solve(ORIGINAL);
}
/** 스모크용 — 생성 풀 크기. */
export function __acTheveninTwoBoxPoolSize(): number { return SPACE.length; }
