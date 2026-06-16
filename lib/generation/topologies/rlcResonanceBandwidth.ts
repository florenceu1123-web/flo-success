import type {
  GenerationMode,
  RlcResonanceBandwidthCircuitDiagram,
  RlcResonanceBandwidthDualCircuitDiagram,
} from "@/types";
import { makeRand, pick, round3 } from "./_helpers";

/**
 * 직렬 RLC 공진 + 대역폭 (임용 11번 회로이론) — 전용 archetype.
 *
 *  원본: 직렬 RLC 회로. v(t)=Vp·cos(ω₀t) 인가, 공진주파수 ω₀ 주어짐.
 *    토폴로지: v(t) → R → 마디 a → [C₁ ∥ C₂] → 마디 b → L → 복귀.  (C_eq = C₁+C₂)
 *    3단계:
 *      [1] 공진시 인덕턴스 L 도출 + 마디 a–b 전압 V_ab(페이저).
 *      [2] 대역폭 β₁ = R/L [rad/s].
 *      [3] R→R₂로 바꿨을 때 β₂ = R₂/L, 비 β₁/β₂ (= R/R₂).
 *
 *  ★ generic universal_ac 쿼리추론은 "공진주파수·C 찾기"라는 엉뚱한 generic 문제를 만들어
 *    대역폭·L도출·V_ab 구조를 잃음 → 전용 결정론 archetype 필수.
 *
 *  닫힌형:
 *    C_eq = C₁ + C₂.  L = 1/(ω₀²·C_eq).
 *    공진시 Z=R → I = Vp/R ∠0°.  X = ω₀L = 1/(ω₀C_eq).
 *    V_ab = I·(1/(jω₀C_eq)) = (Vp/R)·X ∠−90°  (크기 = Vp·X/R = Vp·Q, Q=X/R).
 *    β = R/L.   β₁/β₂ = R/R₂.
 *
 *  값(수치)만 다른 결정론 생성. GPT 호출 없음.
 */

export type RlcResonanceBandwidthGeneration = {
  values: {
    omega0: number;   // rad/s
    R: number;        // Ω
    C1_uF: number;
    C2_uF: number;
    Ceq_uF: number;
    Vpeak: number;    // V
    R2: number;       // Ω (단계3)
  };
  answer: {
    L_mH: number;     // mH
    X: number;        // ω₀L = 1/(ω₀C_eq) (Ω)
    Imag: number;     // 공진 전류 크기 Vp/R (A, peak)
    VabMag: number;   // |V_ab| (V)
    VabPhase: number; // −90 (deg)
    beta1: number;    // R/L (rad/s)
    beta2: number;    // R2/L (rad/s)
    ratio: number;    // β₁/β₂ = R/R₂
  };
  circuitDiagram: RlcResonanceBandwidthCircuitDiagram;
};

type ParamSet = { omega0: number; C1_uF: number; C2_uF: number; R: number; Vpeak: number; R2: number };

// ── 규칙 기반 값 구성 (예시 목록 아님) ───────────────────────────────
//   1차값을 독립적으로 고르고, 공진/대역폭 규칙으로 의존값을 계산한다.
//   깔끔함은 규칙 제약으로 보장: X=ω₀L 정수, C_eq=1/(ω₀²L)는 0.5µF 배수·≤12, I 정수, R₂∈nice.
const L_CHOICES = [1, 2, 2.5, 4, 5];        // mH
const OMEGA_CHOICES = [5e3, 1e4, 2e4];      // rad/s
const R_CHOICES = [4, 5, 8, 10];            // Ω
const I_CHOICES = [2, 3];                   // 공진 전류 peak (A) → Vp=R·I
const RATIO_CHOICES = [4, 5, 8, 10];        // β₁/β₂ = R/R₂
const NICE_R2 = new Set([0.5, 1, 2]);

const isHalfStep = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9; // 0.5 배수?

/** 규칙 제약을 모두 만족하는 (1차값) 조합을 런타임 enumerate. 원본 튜플은 제외. */
function buildRuleSpace(): ParamSet[] {
  const out: ParamSet[] = [];
  for (const L_mH of L_CHOICES)
    for (const omega0 of OMEGA_CHOICES) {
      const X = (omega0 * L_mH) / 1000;                 // ω₀L (Ω) — 정수여야 V_ab 깔끔
      if (!Number.isInteger(X)) continue;
      const Ceq = 1e9 / (omega0 * omega0 * L_mH);        // µF (= 1/(ω₀²L))
      if (!isHalfStep(Ceq) || Ceq < 1 || Ceq > 12) continue;
      // C_eq 분할: 0.5 배수 두 양수, c1≥c2 (중복 제거)
      for (let c2 = 0.5; c2 <= Ceq / 2 + 1e-9; c2 += 0.5) {
        const c1 = Ceq - c2;
        if (c1 < c2 - 1e-9) break;
        for (const R of R_CHOICES)
          for (const I of I_CHOICES)
            for (const ratio of RATIO_CHOICES) {
              const R2 = R / ratio;
              if (!NICE_R2.has(R2)) continue;
              const Vpeak = R * I;
              // 원본 튜플 제외 (예시 생성 금지)
              const isOriginal = omega0 === 1e4 && Math.abs(c1 - 3.5) < 1e-9 && Math.abs(c2 - 1.5) < 1e-9 && R === 5 && Vpeak === 10 && R2 === 0.5;
              if (isOriginal) continue;
              out.push({ omega0, C1_uF: c1, C2_uF: c2, R, Vpeak, R2 });
            }
      }
    }
  return out;
}

const RULE_SPACE = buildRuleSpace();

function solve(s: ParamSet): RlcResonanceBandwidthGeneration {
  const Ceq_F = (s.C1_uF + s.C2_uF) * 1e-6;
  const L = 1 / (s.omega0 * s.omega0 * Ceq_F); // H
  const X = s.omega0 * L;                       // = 1/(ω₀C_eq)
  const Imag = s.Vpeak / s.R;                   // peak (A)
  const VabMag = Imag * X;                      // V
  const beta1 = s.R / L;
  const beta2 = s.R2 / L;
  const ratio = s.R / s.R2;

  const fmtUF = (v: number) => (Number.isInteger(v) ? `${v}µF` : `${v}µF`);
  const circuitDiagram: RlcResonanceBandwidthCircuitDiagram = {
    rLabel: `${s.R}Ω`,
    c1Label: fmtUF(s.C1_uF),
    c2Label: fmtUF(s.C2_uF),
    lLabel: "L",
    vLabel: `v(t)=${s.Vpeak}cos ω₀t`,
  };

  return {
    values: {
      omega0: s.omega0,
      R: s.R,
      C1_uF: s.C1_uF,
      C2_uF: s.C2_uF,
      Ceq_uF: s.C1_uF + s.C2_uF,
      Vpeak: s.Vpeak,
      R2: s.R2,
    },
    answer: {
      L_mH: round3(L * 1e3),
      X: round3(X),
      Imag: round3(Imag),
      VabMag: round3(VabMag),
      VabPhase: -90,
      beta1: round3(beta1),
      beta2: round3(beta2),
      ratio: round3(ratio),
    },
    circuitDiagram,
  };
}

export function generateRlcResonanceBandwidth(args: {
  seed?: number;
}): RlcResonanceBandwidthGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  // 규칙으로 구성된 전체 공간에서 선택 (예시 목록 아님).
  return solve(pick(RULE_SPACE, rand));
}

// ─── 기출변형 = 쌍대(dual) 병렬 RLC ─────────────────────────────────
//   임피던스 스케일 R₀=1kΩ로 직렬→병렬 변환: 전압원→전류원, 직렬R→병렬R_d=R₀²/R,
//   직렬L→병렬C_d=L/R₀², 직렬C→병렬L_d=C·R₀², V_ab→I_ab=V_ab/R₀.
//   ★ β·β₁/β₂ 보존(직렬 β=R/L = 병렬 β=1/(R_dC_d)), V_ab[V]↔I_ab[mA] 거울. 공진주파수 동일.
const R0 = 1000; // 스케일 저항 (Ω)

export type RlcResonanceBandwidthDualGeneration = {
  values: {
    omega0: number;
    Rd_kohm: number;   // R₀²/R (kΩ)
    R2d_kohm: number;  // R₀²/R2 (kΩ)
    L1_H: number;      // C₁·R₀² (H) — 직렬 인덕터 1 (주어짐)
    L2_H: number;      // C₂·R₀² (H)
    Ld_H: number;      // L₁+L₂
    Ip_mA: number;     // V/R₀ (mA)
  };
  answer: {
    Cd_nF: number;     // 도출 (= 원본 L_mH 거울)
    X: number;         // ω₀·L_d (Ω)
    Iab_mA: number;    // |I_ab| (mA, = 원본 V_ab 거울)
    IabPhase: number;  // −90
    beta1: number;     // 1/(R_d·C_d) = R/L (보존)
    beta2: number;
    ratio: number;     // R/R2 (보존)
  };
  circuitDiagram: RlcResonanceBandwidthDualCircuitDiagram;
};

function solveDual(s: ParamSet): RlcResonanceBandwidthDualGeneration {
  const R0sq = R0 * R0;
  const Rd = R0sq / s.R;                  // Ω
  const R2d = R0sq / s.R2;
  const L1_H = s.C1_uF * 1e-6 * R0sq;     // C·R₀²
  const L2_H = s.C2_uF * 1e-6 * R0sq;
  const Ld_H = L1_H + L2_H;               // = C_eq·R₀²
  const Ip_A = s.Vpeak / R0;              // V/R₀
  const Cd_F = 1 / (s.omega0 * s.omega0 * Ld_H); // 병렬 공진: C_d=1/(ω₀²L_d)
  const X = s.omega0 * Ld_H;              // ω₀L_d
  const Vtank = Ip_A * Rd;                // I·R_d (peak)
  const Iab_A = Vtank / X;                // 인덕터 가지 전류
  const beta1 = 1 / (Rd * Cd_F);
  const beta2 = 1 / (R2d * Cd_F);
  const ratio = beta1 / beta2;

  const kΩ = (ohm: number) => round3(ohm / 1000);
  const circuitDiagram: RlcResonanceBandwidthDualCircuitDiagram = {
    iLabel: `i(t)=${s.Vpeak}cos ω₀t [mA]`,
    rdLabel: `${kΩ(Rd)}kΩ`,
    l1Label: `${round3(L1_H)}H`,
    l2Label: `${round3(L2_H)}H`,
    cdLabel: "C",
  };

  return {
    values: {
      omega0: s.omega0,
      Rd_kohm: kΩ(Rd),
      R2d_kohm: kΩ(R2d),
      L1_H: round3(L1_H),
      L2_H: round3(L2_H),
      Ld_H: round3(Ld_H),
      Ip_mA: round3(Ip_A * 1e3),
    },
    answer: {
      Cd_nF: round3(Cd_F * 1e9),
      X: round3(X),
      Iab_mA: round3(Iab_A * 1e3),
      IabPhase: -90,
      beta1: round3(beta1),
      beta2: round3(beta2),
      ratio: round3(ratio),
    },
    circuitDiagram,
  };
}

export function generateRlcResonanceBandwidthDual(args: { seed?: number }): RlcResonanceBandwidthDualGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  return solveDual(pick(RULE_SPACE, rand));
}
