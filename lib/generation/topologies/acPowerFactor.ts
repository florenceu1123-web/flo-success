import type { AcPowerFactorCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * AC 역률 보정 + 전력 (임용 9번 회로이론) — 전용 archetype.
 *
 *  토폴로지: V_s(∠0°, RMS) ─ 직렬 R₁ ─ 직렬 L(jX_L) ─ 마디 ─ 부하 Z[ R₂ ∥ C(−jX_C) ] ─ 하단.
 *  3단계:
 *    [1] 전원 측 역률 = 1 → Im(Z_in)=0 되는 X_C. (Z_in = R₁ + jX_L + R₂∥(−jX_C))
 *        Z_load = R₂(−jX_C)/(R₂−jX_C), Im(Z_load) = −R₂²X_C/(R₂²+X_C²).
 *        X_L = R₂²X_C/(R₂²+X_C²) → X_L·X_C² − R₂²·X_C + X_L·R₂² = 0.
 *        ★ R₂ = 2X_L 이면 중근 X_C = R₂ (깔끔). 그때 Z_load = R₂/2 − jR₂/2, Z_in = R₁ + R₂/2 (순저항).
 *    [2] P_avg = V_s²/Z_in,  Q = 0 (역률 1).
 *    [3] P_s(피상) = V_s·I = V_s²/Z_in = P_avg.
 *
 *  ★ generic topology-driven은 직렬 R+L·병렬 R∥C(부하 Z 점선박스) 구조를 잃음(실측: L·R 병렬 변질)
 *    → 전용 결정론 archetype.
 *  ★ 값은 규칙 열거+정수 필터(R₂=2X_L → X_C=R₂ 정수·P_avg 정수), 원본 튜플 제외.
 */

export type AcPowerFactorGeneration = {
  values: { Vs: number; R1: number; XL: number; R2: number };
  answer: {
    Xc: number;      // 역률 1 되는 X_C (= R₂)
    Zin: number;     // 순저항 입력 임피던스 = R₁ + R₂/2
    Irms: number;    // V_s/Z_in
    Pavg: number;    // V_s²/Z_in [W]
    Q: number;       // 0 [VAR]
    Ps: number;      // = Pavg [VA]
    ZloadRe: number; // R₂/2
    ZloadIm: number; // −R₂/2
  };
  circuitDiagram: AcPowerFactorCircuitDiagram;
};

type Params = { Vs: number; R1: number; XL: number };
// 원본 튜플 (참조·검증 전용, 생성 풀 제외): V_s=100·R₁=1·X_L=1 (R₂=2) → X_C=2·Z_in=2·P=5000.
const ORIGINAL: Params = { Vs: 100, R1: 1, XL: 1 };

function solve(p: Params): AcPowerFactorGeneration {
  const R2 = 2 * p.XL;          // 중근 조건 → X_C = R₂
  const Xc = R2;
  const ZloadRe = R2 / 2, ZloadIm = -R2 / 2;
  const Zin = p.R1 + R2 / 2;    // 순저항
  const Irms = p.Vs / Zin;
  const Pavg = (p.Vs * p.Vs) / Zin;
  const circuitDiagram: AcPowerFactorCircuitDiagram = {
    vsLabel: `${p.Vs}∠0°`, r1Label: `${p.R1}[Ω]`, xlLabel: `j${p.XL}[Ω]`,
    r2Label: `${R2}[Ω]`, xcLabel: "−jX_C[Ω]",
  };
  return {
    values: { Vs: p.Vs, R1: p.R1, XL: p.XL, R2 },
    answer: { Xc, Zin, Irms: r3(Irms), Pavg: r3(Pavg), Q: 0, Ps: r3(Pavg), ZloadRe, ZloadIm },
    circuitDiagram,
  };
}

function r3(x: number): number { return Math.round(x * 1000) / 1000; }

/** 규칙 열거+정수 필터: X_C(=R₂=2X_L) 정수·P_avg 정수. 원본 제외. */
function buildSpace(mode: GenerationMode): Params[] {
  const out: Params[] = [];
  const Vss = [50, 60, 100, 120, 150, 200];
  const R1s = [1, 2, 3, 4];
  const XLs = [1, 2, 3, 4];
  for (const Vs of Vss) for (const R1 of R1s) for (const XL of XLs) {
    const p: Params = { Vs, R1, XL };
    const a = solve(p).answer;
    if (!Number.isInteger(a.Pavg) || a.Pavg < 100 || a.Pavg > 20000) continue;  // P_avg 정수
    if (Vs === ORIGINAL.Vs && R1 === ORIGINAL.R1 && XL === ORIGINAL.XL) continue; // 원본 제외
    out.push(p);
  }
  // similar/variant 풀 분할 (값 다양화)
  const half = Math.floor(out.length / 2);
  return mode === "exam_variant" ? out.slice(half) : out.slice(0, half);
}
const SIMILAR_SPACE = buildSpace("exam_similar");
const VARIANT_SPACE = buildSpace("exam_variant");

export function generateAcPowerFactor(args: { seed?: number; mode: GenerationMode }): AcPowerFactorGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  return solve(pick(space.length ? space : SIMILAR_SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalAcPowerFactorForVerify(): AcPowerFactorGeneration {
  return solve(ORIGINAL);
}
