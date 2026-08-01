import type {
  AcAdmittanceResonanceCircuitDiagram,
  AcAdmittanceResonanceDualCircuitDiagram,
  GenerationMode,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 어드미턴스 공진 (임용 7번 회로이론) — 전용 archetype.
 *
 *  유사(exam_similar): 교류 전압원 → 병렬 블록 [ C ∥ (R+L 직렬) ]. 점선 블록 등가 어드미턴스 Y_eq=a+jb[Ʊ].
 *    Y_eq = jωC + 1/(R+jωL) = R/(R²+(ωL)²) + j[ωC − ωL/(R²+(ωL)²)].
 *    a(ω)=R/(R²+(ωL)²),  b(ω)=ωC − ωL/(R²+(ωL)²).
 *    [1] a·b(ω식)  [2] 공진 b=0 → ω₀=√((L−R²C)/(L²C))  [3] 공진 시 Y_eq=a(ω₀) → I_M=V_peak·a(ω₀).
 *
 *  변형(exam_variant) = 쌍대(dual): 교류 전류원 → 직렬 블록 [ L + (R∥C) ]. 등가 임피던스 Z_eq=a+jb[Ω].
 *    Z_eq = jωL + R/(1+jωRC) = R/(1+(ωRC)²) + j[ωL − ωR²C/(1+(ωRC)²)].
 *    a(ω)=R/(1+(ωRC)²),  b(ω)=ωL − ωR²C/(1+(ωRC)²).
 *    [1] a·b  [2] 공진 b=0 → ω₀=√((R²C−L)/(L·R²C²))  [3] 공진 시 Z_eq=a(ω₀)=L/(RC) → V_M=I_peak·a(ω₀).
 *    (V↔I, Y↔Z, ∥↔직렬, L↔C. ω₀ 동일·a 거울. R₀=1 스케일이면 원본 I_M=5A ↔ 쌍대 V_M=5V.)
 *
 *  ★ generic universal_ac/topology-driven은 "source→병렬[C∥(R+L)]" 고정 토폴로지와 Y_eq=a+jb 쿼리를
 *    표현 못 해(실측: 소자 라벨까지 깨지고 "필요한 C 구하기"로 변질) → 전용 결정론 archetype.
 *  ★ 값은 규칙 열거+필터(ω₀ 정수·최댓값 0.5배수), 원본/원본-쌍대 튜플 제외.
 */

export type AcAdmReson = {
  mode: GenerationMode;
  isDual: boolean;
  vals: { R: number; L: number; C: number; src: number };
  w0: number;        // 공진 주파수 [rad/s]
  aAt: number;       // 공진 시 실수부 (Ʊ 또는 Ω)
  peak: number;      // I_M [A] (유사) 또는 V_M [V] (쌍대)
  aExpr: string;     // a(ω) 기호식
  bExpr: string;     // b(ω) 기호식
  eqSym: "Y_eq" | "Z_eq";
  immUnit: "Ʊ" | "Ω";
  peakSym: "I_M" | "V_M";
  peakUnit: "A" | "V";
  srcKind: "voltage" | "current";
  diagramType: "ac_admittance_resonance_circuit" | "ac_admittance_resonance_dual_circuit";
  diagram: AcAdmittanceResonanceCircuitDiagram | AcAdmittanceResonanceDualCircuitDiagram;
};

type Tuple = { R: number; L: number; C: number; src: number; w0: number; aAt: number; peak: number };

function r6(x: number): number { return Math.round(x * 1e6) / 1e6; }
function isNiceHalf(x: number): boolean { return Math.abs(x * 2 - Math.round(x * 2)) < 1e-6; }
function intRoot(sq: number): number | null {
  if (sq <= 0) return null;
  const r = Math.sqrt(sq);
  const ri = Math.round(r);
  return ri >= 1 && Math.abs(ri * ri - sq) < 1e-3 ? ri : null;
}

// 원본 튜플 (참조·검증 전용, 생성 풀 제외): 유사 R=1·L=0.1·C=0.05·V=10 → ω₀=10·I_M=5.
const ORIG_SIMILAR = { R: 1, L: 0.1, C: 0.05, src: 10 };
// 원본의 쌍대 (변형 풀 제외): R=1·L=0.05·C=0.1·I=10 → ω₀=10·V_M=5.
const ORIG_DUAL = { R: 1, L: 0.05, C: 0.1, src: 10 };

const R_POOL = [1, 2];
const SRC_POOL = [10, 12, 20];
const SIM_L_POOL = [0.1, 0.2, 0.4, 0.5, 1];
const SIM_C_POOL = [0.01, 0.02, 0.05, 0.1, 0.2];
const DUAL_L_POOL = [0.05, 0.1, 0.2, 0.5];
const DUAL_C_POOL = [0.05, 0.1, 0.2, 0.5];

/** 유사(병렬 어드미턴스) 값 공간 — ω₀ 정수·I_M 0.5배수. 원본 제외. */
function buildSimilarSpace(): Tuple[] {
  const out: Tuple[] = [];
  for (const R of R_POOL) for (const L of SIM_L_POOL) for (const C of SIM_C_POOL) for (const src of SRC_POOL) {
    const num = L - R * R * C;          // ω₀² 분자
    if (num <= 0) continue;
    const w0 = intRoot(num / (L * L * C));
    if (w0 == null) continue;
    const aAt = R / (R * R + (w0 * L) ** 2);
    const peak = r6(src * aAt);
    if (!isNiceHalf(peak) || peak <= 0 || peak > 50) continue;
    if (R === ORIG_SIMILAR.R && L === ORIG_SIMILAR.L && C === ORIG_SIMILAR.C && src === ORIG_SIMILAR.src) continue;
    out.push({ R, L, C, src, w0, aAt: r6(aAt), peak });
  }
  return out;
}

/** 변형(쌍대, 직렬 임피던스) 값 공간 — ω₀ 정수·V_M 0.5배수. 원본-쌍대 제외. */
function buildDualSpace(): Tuple[] {
  const out: Tuple[] = [];
  for (const R of R_POOL) for (const L of DUAL_L_POOL) for (const C of DUAL_C_POOL) for (const src of SRC_POOL) {
    const num = R * R * C - L;          // ω₀² 분자
    if (num <= 0) continue;
    const w0 = intRoot(num / (L * R * R * C * C));
    if (w0 == null) continue;
    const aAt = L / (R * C);            // 공진 시 Z_eq 실수부
    const peak = r6(src * aAt);
    if (!isNiceHalf(peak) || peak <= 0 || peak > 50) continue;
    if (R === ORIG_DUAL.R && L === ORIG_DUAL.L && C === ORIG_DUAL.C && src === ORIG_DUAL.src) continue;
    out.push({ R, L, C, src, w0, aAt: r6(aAt), peak });
  }
  return out;
}

const SIMILAR_SPACE = buildSimilarSpace();
const DUAL_SPACE = buildDualSpace();

export function generateAcAdmittanceResonance(args: { seed?: number; mode: GenerationMode }): AcAdmReson {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 3; i++) rand();
  const isDual = args.mode === "exam_variant";
  const space = isDual ? DUAL_SPACE : SIMILAR_SPACE;
  const t = pick(space.length ? space : SIMILAR_SPACE, rand);
  return isDual ? buildDual(t) : buildSimilar(t);
}

function buildSimilar(t: Tuple): AcAdmReson {
  const { R, L, C, src } = t;
  const r2 = r6(R * R), l2 = r6(L * L);
  const aExpr = `${R}/(${r2} + ${l2}ω²)`;
  const bExpr = `${C}ω − ${L}ω/(${r2} + ${l2}ω²)`;
  const diagram: AcAdmittanceResonanceCircuitDiagram = {
    srcLabel: `${src}cos(ωt)`,
    cLabel: `${C}[F]`,
    rLabel: `${R}[Ω]`,
    lLabel: `${L}[H]`,
    yeqLabel: "Y_eq=a+jb[Ʊ]",
  };
  return {
    mode: "exam_similar", isDual: false, vals: { R, L, C, src },
    w0: t.w0, aAt: t.aAt, peak: t.peak, aExpr, bExpr,
    eqSym: "Y_eq", immUnit: "Ʊ", peakSym: "I_M", peakUnit: "A", srcKind: "voltage",
    diagramType: "ac_admittance_resonance_circuit", diagram,
  };
}

function buildDual(t: Tuple): AcAdmReson {
  const { R, L, C, src } = t;
  const rc2 = r6((R * C) ** 2), r2c = r6(R * R * C);
  const aExpr = `${R}/(1 + ${rc2}ω²)`;
  const bExpr = `${L}ω − ${r2c}ω/(1 + ${rc2}ω²)`;
  const diagram: AcAdmittanceResonanceDualCircuitDiagram = {
    srcLabel: `${src}cos(ωt)`,
    lLabel: `${L}[H]`,
    rLabel: `${R}[Ω]`,
    cLabel: `${C}[F]`,
    zeqLabel: "Z_eq=a+jb[Ω]",
  };
  return {
    mode: "exam_variant", isDual: true, vals: { R, L, C, src },
    w0: t.w0, aAt: t.aAt, peak: t.peak, aExpr, bExpr,
    eqSym: "Z_eq", immUnit: "Ω", peakSym: "V_M", peakUnit: "V", srcKind: "current",
    diagramType: "ac_admittance_resonance_dual_circuit", diagram,
  };
}
