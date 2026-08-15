import type {
  AnalysisResult, GenerationMode, MaxPowerTwoSourceCircuitDiagram,
} from "@/types";

/**
 * 임용 17번 — **전원 크기만 다른 두 회로**의 최대전력 부하와 비(η₁·η₂).
 *
 * ## 원본 고정 토폴로지 (확대 확정 — [[feedback_verify_wiring_by_zoom]])
 *   `v(t) ─ C(직렬) ─ 마디 A ─ [R_p ∥ L_p] ─ 마디 B ─ 부하(점선 박스: R_L + L_L 직렬) ─ 하단 rail`
 *   (가)와 (나)는 **회로망이 완전히 같고 전원 진폭만 다르다**(24 V vs 48 V).
 *
 * ## 닫힌형 해 (GPT 없음) — 이 문항의 채점 포인트
 *   · 부하를 떼면 전류가 0이라 직렬 소자에 강하가 없다 → **V_th = 전원 전압 그대로**.
 *   · Z_th = −jX_C + (R_p ∥ jX_p)
 *   · 최대전력 조건은 **켤레 정합** Z_L = Z_th\* → R_L = Re(Z_th), X_L = −Im(Z_th)
 *   · 정합되면 허수부가 상쇄되어 |I| = |V|/(2R_L) → **P_max = |V|²/(8R_L)**
 *
 *   ★★ **부하 값은 전원 크기와 무관하다**(회로망만으로 결정) ⇒ R₁ = R₂, L₁ = L₂ → **η₂ = 1 + 1 = 2**.
 *     반면 **P_max ∝ |V|²** 이므로 전원을 k배 하면 **η₁ = k²**. 두 비가 다른 이유가 채점 포인트다.
 *   원본 검산: −j8 + (6 ∥ j6) = −j8 + (3+j3) = **3 − j5** → R = 3Ω, X = 5 → **L = 5mH**,
 *     P₁ = 24²/(8·3) = 24 W, P₂ = 48²/(8·3) = 96 W → **η₁ = 4, η₂ = 2** (원본 보기 ③). ✓
 *
 * ## 변형 — **소자 종류 교환**(직렬 C↔L, 병렬 L↔C)
 *   `v ─ L(직렬) ─ [R_p ∥ C_p] ─ 부하` → Z_th가 **유도성**이 되어 부하가 **R + 커패시터**가 된다.
 *   학생이 구하는 것이 인덕턴스 → **정전용량**으로 바뀐다. η₁ = k², η₂ = 2는 그대로(구조가 같으므로).
 */

export type MaxPowerTwoSourceValues = {
  /** true면 변형(직렬 L + 병렬 R∥C, 부하는 R+C). */
  dual: boolean;
  w: number;      // [rad/s]
  Rp: number;     // 병렬 저항 [Ω]
  Xp: number;     // 병렬 리액턴스 크기 [Ω] (유사=ωL_p / 변형=1/ωC_p)
  Xs: number;     // 직렬 리액턴스 크기 [Ω] (유사=1/ωC / 변형=ωL)
  V1: number;     // (가) 전원 진폭 [V]
  k: number;      // (나)/(가) 전원 비 → V2 = k·V1
};

export type MaxPowerTwoSourceSolution = {
  /** 병렬 합성 임피던스 */
  parRe: number; parIm: number;
  /** 테브난 임피던스 */
  thRe: number; thIm: number;
  /** 부하 — R과 리액턴스 크기 */
  RL: number; XL: number;
  /** 부하 소자 값 — 유사=L[H] / 변형=C[F] */
  loadElem: number;
  V2: number;
  P1: number; P2: number;
  eta1: number;   // P₂/P₁ = k²
  eta2: number;   // R₂/R₁ + L₂/L₁ = 2
};

export function solveMaxPowerTwoSource(v: MaxPowerTwoSourceValues): MaxPowerTwoSourceSolution {
  const d = v.Rp * v.Rp + v.Xp * v.Xp;
  // R_p ∥ (±jX_p) = R_p X_p²/d ± j R_p² X_p/d
  const parRe = (v.Rp * v.Xp * v.Xp) / d;
  const parIm = (v.dual ? -1 : 1) * (v.Rp * v.Rp * v.Xp) / d;
  // 직렬 소자: 유사 = −jX_s, 변형 = +jX_s
  const thRe = parRe;
  const thIm = parIm + (v.dual ? v.Xs : -v.Xs);
  const RL = thRe;
  const XL = Math.abs(thIm);                 // 켤레 정합 → 크기는 같고 부호만 반대
  const loadElem = v.dual ? 1 / (v.w * XL) : XL / v.w;   // 변형=C[F] / 유사=L[H]
  const V2 = v.k * v.V1;
  const P1 = (v.V1 * v.V1) / (8 * RL);
  const P2 = (V2 * V2) / (8 * RL);
  return { parRe, parIm, thRe, thIm, RL, XL, loadElem, V2, P1, P2, eta1: v.k * v.k, eta2: 2 };
}

// ── 값 공간 ──────────────────────────────────
const W_CH = [500, 1000, 2000];
const RP_CH = [4, 6, 8, 10, 12];
const XS_CH = [4, 6, 8, 10, 12, 14, 16];
const V1_CH = [12, 16, 20, 24, 30, 36, 40];
const K_CH = [2, 3, 4];

const ORIGINAL: MaxPowerTwoSourceValues = { dual: false, w: 1000, Rp: 6, Xp: 6, Xs: 8, V1: 24, k: 2 };

const int = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;
const half = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
/** 소자 값이 mH·µF 정수로 읽히는가. */
const niceL = (L: number) => int(L * 1000) && L * 1000 >= 1 && L * 1000 <= 200;
const niceC = (C: number) => int(C * 1e6) && C * 1e6 >= 1 && C * 1e6 <= 5000;

function buildSpace(dual: boolean): MaxPowerTwoSourceValues[] {
  const out: MaxPowerTwoSourceValues[] = [];
  for (const w of W_CH) for (const Rp of RP_CH) {
    // ★ X_p = R_p로 두면 병렬 합성이 R_p/2 (1 ± j) 로 딱 떨어진다(원본이 그렇다: 6∥j6 = 3+j3).
    const Xp = Rp;
    // 병렬 소자 값이 읽혀야 한다
    const parElem = dual ? 1 / (w * Xp) : Xp / w;
    if (dual ? !niceC(parElem) : !niceL(parElem)) continue;
    for (const Xs of XS_CH) {
      const sElem = dual ? Xs / w : 1 / (w * Xs);
      if (dual ? !niceL(sElem) : !niceC(sElem)) continue;
      const probe = solveMaxPowerTwoSource({ dual, w, Rp, Xp, Xs, V1: 1, k: 2 });
      // 부하가 존재하려면 테브난 리액턴스가 0이 아니어야 한다(정합할 소자가 있어야 함).
      if (probe.XL < 1) continue;
      if (!int(probe.RL) || !half(probe.XL)) continue;
      if (dual ? !niceC(probe.loadElem) : !niceL(probe.loadElem)) continue;
      for (const V1 of V1_CH) for (const k of K_CH) {
        const s = solveMaxPowerTwoSource({ dual, w, Rp, Xp, Xs, V1, k });
        if (!half(s.P1) || !half(s.P2) || s.P1 < 1 || s.P2 > 2000) continue;
        const v: MaxPowerTwoSourceValues = { dual, w, Rp, Xp, Xs, V1, k };
        if (!dual && same(v, ORIGINAL)) continue;   // ★ 원본 튜플 제외
        out.push(v);
      }
    }
  }
  return out;
}
const same = (a: MaxPowerTwoSourceValues, b: MaxPowerTwoSourceValues) =>
  a.w === b.w && a.Rp === b.Rp && a.Xp === b.Xp && a.Xs === b.Xs && a.V1 === b.V1 && a.k === b.k;

function shuffleDet<T>(xs: T[]): T[] {
  return xs.map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 })).sort((p, q) => p.k - q.k).map((p) => p.x);
}
const SIMILAR_SPACE = shuffleDet(buildSpace(false));
const VARIANT_SPACE = shuffleDet(buildSpace(true));
export const __spaces = { SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL };

// ── 표기 ─────────────────────────────────────
export const numTex = (x: number) => (int(x) ? String(Math.round(x)) : String(Math.round(x * 1000) / 1000));
export const mHTex = (L: number) => `${Math.round(L * 1000)}mH`;
export const uFTex = (C: number) => `${Math.round(C * 1e6)}µF`;

// ── 생성 ─────────────────────────────────────
export type MaxPowerTwoSourceGeneration = {
  values: MaxPowerTwoSourceValues;
  sol: MaxPowerTwoSourceSolution;
  figA: MaxPowerTwoSourceCircuitDiagram;
  figB: MaxPowerTwoSourceCircuitDiagram;
};

export function generateMaxPowerTwoSourceRatio(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): MaxPowerTwoSourceGeneration {
  const dual = args.mode === "exam_variant";
  const space = dual ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 101) % space.length;
  const values = space[idx];
  const sol = solveMaxPowerTwoSource(values);

  const seriesLabel = dual ? mHTex(values.Xs / values.w) : uFTex(1 / (values.w * values.Xs));
  const parReactLabel = dual ? uFTex(1 / (values.w * values.Xp)) : mHTex(values.Xp / values.w);
  const base = {
    dual,
    seriesLabel, parResLabel: `${values.Rp}Ω`, parReactLabel,
    loadElemName: dual ? "C" : "L",
  };

  return {
    values, sol,
    figA: { ...base, sourceLabel: `v₁(t)=${values.V1}cos${values.w}t V`, loadResLabel: "R₁", loadElemLabel: dual ? "C₁" : "L₁", powerLabel: "P_max1" },
    figB: { ...base, sourceLabel: `v₂(t)=${numTex(sol.V2)}cos${values.w}t V`, loadResLabel: "R₂", loadElemLabel: dual ? "C₂" : "L₂", powerLabel: "P_max2" },
  };
}

// ── 공용 매처 ────────────────────────────────
export function maxPowerTwoSourceText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [a.topic ?? "", a.interpretation ?? "", (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" ")].join(" ");
}

const MAXP_RE = /최대\s*전력|최대전력|maximum\s*power/i;
/** ★ 이 유형의 뼈대 — **두 회로**(가)·(나)를 비교해 **비(ratio)** 를 묻는다. */
const TWO_CIRCUIT_RE = /\(\s*가\s*\)[^]{0,80}\(\s*나\s*\)|두\s*회로|각\s*회로|P_?max1|P_?max2|η₁|η₂|eta1/i;
const LOAD_DESIGN_RE = /부하\s*(저항|임피던스)|필요한\s*부하|인덕턴스\s*를?\s*구|정전용량\s*을?\s*구/i;
/** 형제 양보 — 단일 회로 테브난·최대전력 유형이 여럿 있다. */
const YIELD_RE =
  /테브난\s*등가\s*회로로\s*변환|단자\s*a|점선\s*박스\s*2|브리지|Δ-?Y|델타|스위치|\bSW\b|중첩의?\s*원리|공진|역률|상태\s*방정식|종속\s*전(원|압원|류원)/i;

/**
 * 구조 시그니처 — **최대전력 + 두 회로 비교 + 부하 설계**. 셋이 모이면 이 유형이다
 * (형제 최대전력 유형들은 전부 **단일 회로**다 — 그게 판별선이다).
 */
export function matchesMaxPowerTwoSourceRatio(a?: Partial<AnalysisResult> | null): boolean {
  const t = maxPowerTwoSourceText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;
  if (!MAXP_RE.test(t)) return false;
  return TWO_CIRCUIT_RE.test(t) && LOAD_DESIGN_RE.test(t);
}
