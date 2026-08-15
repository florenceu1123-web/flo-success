import type {
  AnalysisResult, GenerationMode, RlcAntiresonanceLadderCircuitDiagram,
} from "@/types";

/**
 * 임용 16번 — **병렬 LC 반공진(antiresonance)** 으로 우측 전체가 개방되는 RLC 사다리.
 *
 * ## 원본 고정 토폴로지 (확대 확정 — [[feedback_verify_wiring_by_zoom]])
 *   좌: 교류 전압원 v(t) = V_m cos(ωt),  i(t)는 전원에서 나오는 전류
 *   상단: v ─ R₁ ─ L₁ ─ **마디 A**
 *   A ─ R₂ ─ **마디 A′**(하단)
 *   A ─ C₁ ─ **마디 B**(상단),   A′ ─ C₂ ─ **마디 B′**(하단)
 *   B ─ L₂ ─ B′  **∥**  B ─ C₃ ─ B′      ← ★ 이 둘이 **병렬 LC**
 *
 * ## 닫힌형 해 (GPT 없음) — 이 문항의 채점 포인트
 *   ★★ ωL₂ = 1/(ωC₃) 이면 병렬 LC의 합성 임피던스가
 *       Z = (jX)(−jX)/(jX − jX) = X²/0 → **∞ (개방)** 이다(**반공진**).
 *     그러면 그 뒤의 C₁·C₂까지 포함한 **우측 가지 전체에 전류가 흐르지 않는다**.
 *   ⇒ 회로는 **R₁ + jωL₁ + R₂** 단일 직렬로 축약된다.
 *       **Z = (R₁+R₂) + jωL₁**,  I = V_m∠0°/Z,  i(t) = |I|cos(ωt + ∠I)
 *
 *   ★ 값 공간에서 **ωL₁ = R₁ + R₂** 를 강제한다(원본이 그렇다: 10 = 9+1).
 *     그러면 Z = R_tot(1+j) = R_tot√2∠45° 라 위상이 정확히 −45°이고 |I| = V_m/(R_tot√2).
 *   원본 검산: R_tot=10 · ωL₁=10 · V_m=50√2 → |I| = 5 → **i(t) = 5cos(1000t − 45°)** (보기 ③). ✓
 *
 * ## 변형 — **구하는 양 교환**: 전원이 공급하는 평균 전력 P
 *   P = ½·V_m·|I|·cos45° = ½|I|²·R_tot. 구조·반공진 논리는 그대로다(절대규칙 0).
 */

export type RlcAntiValues = {
  R1: number; R2: number;
  L1: number;   // [H] — 상단 직렬 인덕터
  C1: number;   // [F] — 상·하단 직렬 커패시터 (같은 값)
  L2: number;   // [H] — 병렬 LC의 L
  C3: number;   // [F] — 병렬 LC의 C (ωL₂ = 1/(ωC₃))
  Vm: number;   // 교류 진폭 [V] (= m√2 꼴)
  mRoot: number; // V_m = mRoot·√2
  w: number;    // [rad/s]
};

export type RlcAntiSolution = {
  Rtot: number;
  XL1: number;   // ωL₁ (= R_tot)
  XL2: number;   // ωL₂ = 1/(ωC₃) — 반공진 리액턴스
  XC1: number;   // 1/(ωC₁) — 답에 관여하지 않음(개방이라)
  /** |I| = V_m/(R_tot√2) — 정수로 떨어지게 값 공간에서 강제한다. */
  Imag: number;
  /** 평균 전력 P = ½|I|²R_tot */
  P: number;
};

export function solveRlcAnti(v: RlcAntiValues): RlcAntiSolution {
  const Rtot = v.R1 + v.R2;
  const XL1 = v.w * v.L1;
  const XL2 = v.w * v.L2;
  const XC1 = 1 / (v.w * v.C1);
  const Imag = v.Vm / (Rtot * Math.SQRT2);
  return { Rtot, XL1, XL2, XC1, Imag, P: 0.5 * Imag * Imag * Rtot };
}

// ── 값 공간 ──────────────────────────────────
const R1_CH = [3, 4, 5, 6, 8, 9, 12, 15];
const R2_CH = [1, 2, 3, 4, 5];
const W_CH = [500, 1000, 2000, 4000, 5000];
const XL2_CH = [1, 2, 4, 5];        // 반공진 리액턴스
const XC1_CH = [1, 2, 4, 5];
const M_CH = [10, 20, 25, 30, 40, 50, 60, 80, 100];

const ORIGINAL: RlcAntiValues = {
  R1: 9, R2: 1, L1: 0.01, C1: 500e-6, L2: 0.002, C3: 500e-6, Vm: 50 * Math.SQRT2, mRoot: 50, w: 1000,
};

const int = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;
/** 소자 값이 mH·µF 단위로 읽히는가 (정수 mH / 정수 µF). */
const niceH = (L: number) => int(L * 1000) && L * 1000 <= 500 && L * 1000 >= 1;
const niceF = (C: number) => int(C * 1e6) && C * 1e6 <= 5000 && C * 1e6 >= 1;

function buildSpace(): RlcAntiValues[] {
  const out: RlcAntiValues[] = [];
  for (const w of W_CH) for (const R1 of R1_CH) for (const R2 of R2_CH) {
    const Rtot = R1 + R2;
    const L1 = Rtot / w;                 // ★ ωL₁ = R_tot 강제 → ∠Z = 45°
    if (!niceH(L1)) continue;
    for (const XL2 of XL2_CH) {
      const L2 = XL2 / w, C3 = 1 / (w * XL2);   // ★ ωL₂ = 1/(ωC₃) → 반공진
      if (!niceH(L2) || !niceF(C3)) continue;
      for (const XC1 of XC1_CH) {
        const C1 = 1 / (w * XC1);
        if (!niceF(C1)) continue;
        for (const mRoot of M_CH) {
          const Imag = mRoot / Rtot;      // V_m = mRoot√2 → |I| = mRoot/R_tot
          if (!int(Imag) || Imag < 1 || Imag > 20) continue;
          const P = 0.5 * Imag * Imag * Rtot;
          if (!int(P * 2)) continue;      // 0.5 배수
          const v: RlcAntiValues = { R1, R2, L1, C1, L2, C3, Vm: mRoot * Math.SQRT2, mRoot, w };
          if (same(v, ORIGINAL)) continue;   // ★ 원본 튜플 제외
          out.push(v);
        }
      }
    }
  }
  return out;
}

const same = (a: RlcAntiValues, b: RlcAntiValues) =>
  a.R1 === b.R1 && a.R2 === b.R2 && a.w === b.w && a.mRoot === b.mRoot &&
  Math.abs(a.L1 - b.L1) < 1e-12 && Math.abs(a.L2 - b.L2) < 1e-12 &&
  Math.abs(a.C1 - b.C1) < 1e-15 && Math.abs(a.C3 - b.C3) < 1e-15;

function shuffleDet<T>(xs: T[]): T[] {
  return xs.map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 })).sort((p, q) => p.k - q.k).map((p) => p.x);
}
const SPACE = shuffleDet(buildSpace());
const SIMILAR_SPACE = SPACE.filter((_, i) => i % 2 === 0);
const VARIANT_SPACE = SPACE.filter((_, i) => i % 2 === 1);
export const __spaces = { SPACE, SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL };

// ── 표기 ─────────────────────────────────────
export const mH = (L: number) => `${Math.round(L * 1000)}mH`;
export const uF = (C: number) => `${Math.round(C * 1e6)}µF`;
export const numTex = (x: number) => (int(x) ? String(Math.round(x)) : String(Math.round(x * 1000) / 1000));
/** V_m = m√2 표기 (원본이 50√2). */
export const vmTex = (m: number) => `${m}√2`;

// ── 생성 ─────────────────────────────────────
export type RlcAntiGeneration = {
  values: RlcAntiValues;
  sol: RlcAntiSolution;
  /** 유사=전류 i(t) / 변형=전원 공급 평균 전력 P. */
  target: "current" | "power";
  circuitDiagram: RlcAntiresonanceLadderCircuitDiagram;
};

export function generateRlcAntiresonanceLadder(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): RlcAntiGeneration {
  const target: "current" | "power" = args.mode === "exam_variant" ? "power" : "current";
  const space = target === "power" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 101) % space.length;
  const values = space[idx];
  const sol = solveRlcAnti(values);

  return {
    values, sol, target,
    circuitDiagram: {
      sourceLabel: `v(t)=${vmTex(values.mRoot)}cos${values.w}t V`,
      r1Label: `${values.R1}Ω`,
      r2Label: `${values.R2}Ω`,
      l1Label: mH(values.L1),
      c1Label: uF(values.C1),
      l2Label: mH(values.L2),
      c3Label: uF(values.C3),
      measureLabel: "i(t)",
    },
  };
}

// ── 공용 매처 ────────────────────────────────
export function rlcAntiText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [a.topic ?? "", a.interpretation ?? "", (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" ")].join(" ");
}

const STEADY_RE = /정상\s*상태|steady/i;
const AC_RE = /교류|정현파|cos|sin|\bAC\b|페이저|phasor/i;
/** 형제 양보 — 직류 전원·스위치·테브난·전원 크기 역산은 각자 전용 유형이 있다. */
const YIELD_RE =
  /직류\s*전(류|압)원|스위치|\bSW\b|단자\s*A|과도\s*응답|테브난|최대\s*전력\s*전달|전원\s*의?\s*크기|단위\s*계단|대역폭|중첩의?\s*원리/i;

/**
 * 구조 시그니처 — 이 유형은 **전원이 교류 전압원 하나뿐**이고, 소자가
 * **저항 2 + 인덕터 2 + 커패시터 3**(병렬 LC + 직렬 C 2개)으로 많다.
 * 형제(단일 루프 RLC·공진·대역폭)와 달리 **사다리 구조 + 병렬 LC**가 뼈대다.
 */
export function matchesRlcAntiresonanceLadder(a?: Partial<AnalysisResult> | null): boolean {
  const t = rlcAntiText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;
  if (!AC_RE.test(t)) return false;

  const inv = a?.componentInventory ?? [];
  const n = (re: RegExp) => inv.filter((c) => re.test(String(c?.type ?? ""))).length;
  const nV = n(/^V$/i), nI = n(/^I$/i), nR = n(/^R$/i), nL = n(/^L$/i), nC = n(/^C$/i);
  if (nI > 0) return false;                       // 전류원이 있으면 다른 유형

  // 구조: 전압원 1 + L 2개 이상 + C 2개 이상 + R 2개 이상
  const structural = nV >= 1 && nL >= 2 && nC >= 2 && nR >= 2;
  // 텍스트: 병렬 LC(반공진) 언급 + 정상상태 전류/전력 요구
  const textual = /병렬\s*(LC|공진)|반공진|antiresonance|공진\s*으로?\s*개방/i.test(t);
  if (!structural && !textual) return false;

  return STEADY_RE.test(t) || /전류\s*i\s*\(\s*t\s*\)|\bi\(t\)/.test(t);
}
