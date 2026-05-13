/**
 * Series RLC step response 솔버.
 *
 *  회로: V_step(u(t)) → R → L → C → GND.
 *  초기조건: V_C(0) = 0, I_L(0) = 0.
 *
 *  ODE: LC·V_C'' + RC·V_C' + V_C = V_step
 *  특성근: s = -α ± √(α² - ω₀²), α = R/(2L), ω₀ = 1/√(LC)
 *  ζ = α/ω₀ (감쇠비)
 *
 *  3가지 case:
 *   - over (ζ>1):  s1, s2 real distinct
 *       V_C(t) = V_step · [1 + (s2·e^(s1·t) - s1·e^(s2·t)) / (s1 - s2)]
 *   - critical (ζ=1): double root s = -α
 *       V_C(t) = V_step · [1 - (1 + α·t)·e^(-α·t)]
 *   - under (ζ<1): complex roots, ω_d = √(ω₀² - α²)
 *       V_C(t) = V_step · [1 - e^(-α·t)·(cos(ω_d·t) + (α/ω_d)·sin(ω_d·t))]
 */

export type RlcDamping = "overdamped" | "critically_damped" | "underdamped";

export type RlcSolverResult = {
  alpha: number;       // R/(2L)  [rad/s]
  omega0: number;      // 1/√(LC) [rad/s]
  zeta: number;        // α / ω₀
  damping: RlcDamping;
  /** 부족감쇠 전용 — 진동 각주파수 */
  omegaD?: number;
  /** 과감쇠 전용 — 두 실근 */
  s1?: number;
  s2?: number;
  /** 정상상태 V_C (step 입력에선 V_step) */
  Vinf: number;
  /** t (초)에서 V_C 값 */
  Vc: (tSec: number) => number;
  /** waveform 표시용 권장 시간 끝 (초) */
  tEndSec: number;
};

const EPSILON_ZETA = 1e-3;

export function solveRlcStepResponse(args: {
  /** Step 입력 전압 (V) */
  V: number;
  /** 직렬 저항 (Ω) */
  R: number;
  /** 인덕턴스 (H) */
  L: number;
  /** 캐패시턴스 (F) */
  C: number;
}): RlcSolverResult {
  const { V, R, L, C } = args;
  if (R <= 0 || L <= 0 || C <= 0) throw new Error("R, L, C는 양수여야 함");
  if (V === 0) throw new Error("V_step은 0이 아니어야 함");

  const alpha = R / (2 * L);
  const omega0 = 1 / Math.sqrt(L * C);
  const zeta = alpha / omega0;

  let damping: RlcDamping;
  if (Math.abs(zeta - 1) < EPSILON_ZETA) damping = "critically_damped";
  else if (zeta > 1) damping = "overdamped";
  else damping = "underdamped";

  // case별 Vc(t) function + t_end 권장
  let Vc: (t: number) => number;
  let tEndSec: number;
  let omegaD: number | undefined;
  let s1: number | undefined;
  let s2: number | undefined;

  if (damping === "overdamped") {
    const disc = Math.sqrt(alpha * alpha - omega0 * omega0);
    s1 = -alpha + disc;   // less negative (slow decay)
    s2 = -alpha - disc;   // more negative (fast decay)
    Vc = (t: number) =>
      V * (1 + ((s2 as number) * Math.exp((s1 as number) * t) - (s1 as number) * Math.exp((s2 as number) * t))
              / ((s1 as number) - (s2 as number)));
    tEndSec = 5 / Math.abs(s1);   // 느린 root 기준 5τ
  } else if (damping === "critically_damped") {
    Vc = (t: number) => V * (1 - (1 + alpha * t) * Math.exp(-alpha * t));
    tEndSec = 6 / alpha;
  } else {
    omegaD = Math.sqrt(omega0 * omega0 - alpha * alpha);
    const wd = omegaD;
    Vc = (t: number) =>
      V * (1 - Math.exp(-alpha * t) * (Math.cos(wd * t) + (alpha / wd) * Math.sin(wd * t)));
    // 진동 + 감쇠 envelope. 8/α (envelope 감쇠) 와 3·T_d (3주기) 중 큰 쪽
    const T_d = (2 * Math.PI) / omegaD;
    tEndSec = Math.max(8 / alpha, 3 * T_d);
  }

  return {
    alpha,
    omega0,
    zeta,
    damping,
    omegaD,
    s1,
    s2,
    Vinf: V,
    Vc,
    tEndSec,
  };
}

/**
 * V_C(t) 곡선 sampling — waveform figure 용.
 *  반환 sample의 t는 초 단위 (호출자가 ms로 변환).
 */
export function sampleVc(rlc: RlcSolverResult, nSamples: number = 80): Array<{ t: number; v: number }> {
  const dt = rlc.tEndSec / nSamples;
  const samples: Array<{ t: number; v: number }> = [];
  for (let i = 0; i <= nSamples; i++) {
    const t = i * dt;
    samples.push({ t, v: rlc.Vc(t) });
  }
  return samples;
}
