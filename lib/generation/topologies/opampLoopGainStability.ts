import type { GenerationMode, OpampLoopGainCircuitDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * OPAMP 루프이득 L(s)=V_r/V_t + 특성방정식 좌반평면 안정도 (임용 12번 전자회로) 전용 archetype.
 *
 *  (가) 원 회로 — 부귀환 분압(R_a: V⁻→접지, R_f: V⁻→출력) + **정귀환 경로**(R_p: V⁺→출력),
 *       입력 V_s가 R_S를 거쳐 V⁺에 인가.
 *  (나) **입력 V_s 제거 + 귀환 루프 절단** 후 V_t를 인가해 V_r을 얻는 회로 → 루프이득 측정 회로.
 *
 *  〈해석 절차〉
 *   [1] V⁻ = R_a/(R_a+R_f)·V_t,  V⁺ = R_S/(R_S+R_p)·V_t
 *   [2] L(s) = V_r/V_t = A(s)·(V⁺−V⁻)/V_t = (A₀ω₀/s)·k,  k = R_S/(R_S+R_p) − R_a/(R_a+R_f)
 *       특성방정식 0 = 1 − L(s) → **s = A₀ω₀·k**
 *   [3] 근이 **좌반평면**(Re s < 0) ⇔ k < 0 ⇔ R_S·R_f < R_a·R_p ⇔ **R_S < (R_a/R_f)·R_p**
 *       원본(R_a=R_f=R_p=R) → **R_S < R**.
 *
 *  ★ 형제 archetype과 다르다: `opamp_finite_gain_block`(임용 11번)은 A(s)=A₀ω₀/(s+ω₀) + 블록도로 V⁻[mV],
 *    `opamp_positive_feedback`(임용 6번)은 SW step 응답의 상수 K, `opamp_finite_gain_offset`(임용 9번)은
 *    출력단 오프셋 V_B. 여기는 **루프 절단 + 루프이득 + 특성방정식 근의 위치(안정도)** 로 저항 부등식을 구한다.
 *
 *  ★ 값은 전부 **기호**(R의 배수)다 — 원본에 수치가 없다. 생성 다양성은 저항 배수 (a, f, p)로 낸다.
 */

export type OpampLoopGainGeneration = {
  values: {
    a: number;  // R_a = a·R (V⁻ ↔ 접지)
    f: number;  // R_f = f·R (V⁻ ↔ 출력)
    p: number;  // R_p = p·R (V⁺ ↔ 출력)
    /** 변형: V_s+R_S 가지가 **반전 단자** 쪽 (부등호 방향이 반대가 된다) */
    invertingSource: boolean;
  };
  answer: {
    betaText: string;    // 분압비 R_a/(R_a+R_f) 기호식
    ratioText: string;   // (R_a/R_f)·R_p 를 R의 배수로 (예: "2R", "R/2")
    ineqText: string;    // 최종 부등식 (예: "R_S < 2R")
    kText: string;       // k = V⁺/V_t − V⁻/V_t 기호식
    rootText: string;    // 특성방정식 근
  };
  labels: { ra: string; rf: string; rp: string };
  circuitA: OpampLoopGainCircuitDiagram;  // (가)
  circuitB: OpampLoopGainCircuitDiagram;  // (나)
};

/** n을 R의 배수 라벨로 ("R" · "2R" · "R/2" · "3R/2"). */
function mulR(n: number, d = 1): string {
  const g = gcd(Math.round(n), Math.round(d)) || 1;
  const nn = Math.round(n) / g, dd = Math.round(d) / g;
  if (dd === 1) return nn === 1 ? "R" : `${nn}R`;
  return nn === 1 ? `R/${dd}` : `${nn}R/${dd}`;
}
function gcd(x: number, y: number): number { return y ? gcd(y, x % y) : Math.abs(x); }
function frac(n: number, d: number): string {
  const g = gcd(n, d) || 1;
  const nn = n / g, dd = d / g;
  return dd === 1 ? `${nn}` : `\\dfrac{${nn}}{${dd}}`;
}

/**
 * 규칙 열거 + 필터 — 저항 배수 (a, f, p).
 *   · 분압비 a/(a+f)가 지저분하지 않게 a+f ≤ 6
 *   · 최종 비 (a/f)·p 가 깔끔(정수 또는 1/2 배수)하고 1/2 ~ 4 범위
 *   · ★ 원본 튜플 (1,1,1) 제외
 */
function buildSpace(): Array<{ a: number; f: number; p: number }> {
  const out: Array<{ a: number; f: number; p: number }> = [];
  for (const a of [1, 2, 3, 4]) {
    for (const f of [1, 2, 3, 4]) {
      if (a + f > 6) continue;
      for (const p of [1, 2, 3, 4]) {
        // ★ 원본과 도출량이 완전히 같은 조합 제외 — a=f면 분압비가 1/2(원본과 동일)이고
        //   p=1이면 최종 부등식도 R_S<R로 원본과 같아진다(저항 라벨만 다른 사실상 같은 문제).
        if (a === f && p === 1) continue;
        const ratio = (a * p) / f;
        if (ratio < 0.5 || ratio > 4) continue;
        if (Math.abs(ratio * 2 - Math.round(ratio * 2)) > 1e-9) continue;  // 0.5 배수만
        out.push({ a, f, p });
      }
    }
  }
  return out;
}
const SPACE = buildSpace();

export function generateOpampLoopGainStability(args: { seed?: number; mode: GenerationMode }): OpampLoopGainGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 3; i++) rand();
  const invertingSource = args.mode === "exam_variant";
  const half = Math.ceil(SPACE.length / 2);
  const pool = invertingSource ? SPACE.slice(half) : SPACE.slice(0, half);
  const v = pick(pool.length ? pool : SPACE, rand);

  const labels = { ra: mulR(v.a), rf: mulR(v.f), rp: mulR(v.p) };
  const betaText = frac(v.a, v.a + v.f);
  const ratioText = mulR(v.a * v.p, v.f);
  // 정귀환 경로가 어느 단자에 붙느냐로 부등호 방향이 뒤집힌다.
  const ineqText = invertingSource ? `R_S > ${ratioText}` : `R_S < ${ratioText}`;
  const divider = `\\dfrac{R_S}{R_S + ${labels.rp}}`;
  const kText = invertingSource
    ? `${betaText} - ${divider}`
    : `${divider} - ${betaText}`;
  const rootText = `s = A_0\\omega_0\\left(${kText}\\right)`;

  const base = {
    raLabel: labels.ra, rfLabel: labels.rf, rpLabel: labels.rp, rsLabel: "R_S",
    asLabel: "A(s)", invertingSource,
  };

  return {
    values: { ...v, invertingSource },
    answer: { betaText, ratioText, ineqText, kText, rootText },
    labels,
    circuitA: { ...base, variant: "original", outLabel: "V_out", sourceLabel: "V_s" },
    circuitB: { ...base, variant: "loop_broken", outLabel: "V_r", driveLabel: "V_t" },
  };
}
