import type {
  AnalysisResult,
  GenerationMode,
  TwoSourceRlSuperpositionCircuitDiagram,
} from "@/types";

/**
 * 임용 4번 (25점 서술형) — **전압원 2개(단위계단 펄스 + 정현파) RL 회로를 중첩으로 해석**.
 *
 * ## 원본 고정 토폴로지 (확대 확정 — [[feedback_verify_wiring_by_zoom]])
 *   `v₁(+위) ─ R₁(상단) ─ 마디 M`,  `v₁(−) ─ R₂(하단) ─ 마디 N`,
 *   `R₃ : M ↓ N`(션트),  `M ─ L (i(t) →) ─ v₂(+위) ─ N`.
 *   (나) = 점선 박스[v₁·R₁·R₂·R₃]를 **테브난 등가**로 (v₂ 제거·단락) → i_A(t)
 *   (다) = v₁ 단락 → 점선 박스가 **합성저항 R_eq**로 (v₂만 인가) → i_B(t)
 *
 * ## 닫힌형 해 (GPT 없음)
 *   k = R₃/(R₁+R₂+R₃),  **V_th = k·v₁**,  **R_th = R₃ ∥ (R₁+R₂) = R_eq**,  τ = L/R_th
 *   ★ v₂의 **+ 단자가 인덕터 쪽**이라 루프 방정식에서 부호가 −다:
 *       **L·di/dt + R_th·i = k·v₁ − v₂**
 *   · i_A (v₁만, 펄스 높이 V₁·폭 T₁): I∞ = k·V₁/R_th
 *       0 ≤ t < T₁ :  i_A = I∞(1 − e^(−t/τ))
 *       t ≥ T₁     :  i_A = I∞(1 − e^(−T₁/τ))·e^(−(t−T₁)/τ)
 *   · i_B (v₂ = V₂ sin ωt만): |Z| = √(R_th² + (ωL)²), φ = atan(ωL/R_th)
 *       i_B = −(V₂/|Z|)·sinφ·e^(−t/τ) − (V₂/|Z|)·sin(ωt − φ)     [i_B(0)=0]
 *   · i(t) = i_A(t) + i_B(t)
 *
 *   ★★ **ωτ = 1로 고정**한다(원본이 그렇다: ωL/R_th = 1·2/2 = 1). 그러면 φ = 45°,
 *     |Z| = R_th√2 라 진폭이 q√2 (q = V₂/2R_th) 꼴로 떨어지고 과도항 계수도 정확히 −q가 된다.
 *     원본 검산: q = 10/4 = 2.5 → i_B = −2.5e^(−t) − 2.5√2 sin(t − π/4). ✓
 *
 * ## 변형 — **인덕터 → 커패시터**, v_C(t)를 구한다 (사용자 지정 2026-08-12)
 *   같은 자리에 C를 놓고 v_C를 측정하면 τ = R_th·C 이고
 *     **R_th·C·dv_C/dt + v_C = k·v₁ − v₂**
 *   · v_A : V∞ = k·V₁ (전류가 아니라 **전압**이 목표값) — 구조·절차는 완전히 동일
 *   · v_B : 진폭 V₂/√(1+(ωτ)²) = V₂/√2 (ωτ=1)
 *   구조·5단계 절차는 그대로 두고 **소자 종류와 구하는 양만** 바꾼다(절대규칙 0).
 */

export type TwoSourceValues = {
  R1: number; R2: number; R3: number;
  /** 리액티브 소자 값 — 유사=L[H], 변형=C[F]. */
  X: number;
  V1: number;   // 펄스 높이 [V]
  V2: number;   // 정현파 진폭 [V]
  /** 각주파수 [rad/s]. ωτ = 1 이 되도록 값 공간에서 강제한다. */
  w: number;
  /** 펄스 폭 계수 m — T₁ = m·π/ω (원본 m=1). */
  m: number;
};

export type TwoSourceSolution = {
  k: number;        // 분압비 R₃/(R₁+R₂+R₃)
  Rth: number;      // = R_eq
  tau: number;
  T1: number;       // 펄스 폭
  /** A 성분(펄스 응답) 최종값 — 유사=전류[A], 변형=전압[V]. */
  ampA: number;
  /** A 성분이 t=T₁에서 갖는 값. */
  aAtT1: number;
  /** B 성분(정현파 응답) 정상상태 진폭의 √2 계수 q — 진폭 = q√2. */
  q: number;
  /** 위상 지연 φ [rad] — ωτ=1이라 항상 π/4. */
  phi: number;
};

export function solveTwoSource(v: TwoSourceValues, reactive: "L" | "C"): TwoSourceSolution {
  const sum = v.R1 + v.R2 + v.R3;
  const k = v.R3 / sum;
  const Rth = (v.R3 * (v.R1 + v.R2)) / sum;
  const tau = reactive === "L" ? v.X / Rth : Rth * v.X;
  const T1 = (v.m * Math.PI) / v.w;
  const ampA = reactive === "L" ? (k * v.V1) / Rth : k * v.V1;
  const aAtT1 = ampA * (1 - Math.exp(-T1 / tau));
  // ωτ = 1 → φ = 45°, 정상상태 진폭 = (reactive==="L" ? V₂/(R_th√2) : V₂/√2) = q√2
  const q = reactive === "L" ? v.V2 / (2 * Rth) : v.V2 / 2;
  return { k, Rth, tau, T1, ampA, aAtT1, q, phi: Math.PI / 4 };
}

/** t에서의 완전응답 — 스모크의 독립 재검산과 대조하기 위한 참조 구현. */
export function responseAt(v: TwoSourceValues, reactive: "L" | "C", t: number): number {
  const s = solveTwoSource(v, reactive);
  const a = t < s.T1
    ? s.ampA * (1 - Math.exp(-t / s.tau))
    : s.aAtT1 * Math.exp(-(t - s.T1) / s.tau);
  const amp = s.q * Math.SQRT2;
  const b = -amp * Math.sin(s.phi) * Math.exp(-t / s.tau) - amp * Math.sin(v.w * t - s.phi);
  return a + b;
}

// ─────────────────────────────────────────────────────────────
// 값 공간 — 규칙 열거 + 필터
// ─────────────────────────────────────────────────────────────

const R_SMALL = [1, 2, 3, 4, 6];
const R_SHUNT = [2, 3, 4, 6, 8, 12];
const V_CHOICES = [4, 6, 8, 10, 12, 16, 20];
const TAU_CHOICES = [0.5, 1, 2];
const M_CHOICES = [1, 2];

/** 원본 튜플 — 생성 풀에서 제외. */
const ORIGINAL: TwoSourceValues = { R1: 2, R2: 2, R3: 4, X: 2, V1: 10, V2: 10, w: 1, m: 1 };

const half = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
const int = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;

function buildSpace(reactive: "L" | "C"): TwoSourceValues[] {
  const out: TwoSourceValues[] = [];
  for (const R1 of R_SMALL) for (const R2 of R_SMALL) for (const R3 of R_SHUNT) {
    const sum = R1 + R2 + R3;
    const Rth = (R3 * (R1 + R2)) / sum;
    if (!int(Rth) || Rth < 1) continue;              // R_eq는 정수여야 읽힌다
    const k = R3 / sum;
    for (const tau of TAU_CHOICES) {
      const w = 1 / tau;                              // ★ ωτ = 1 강제 (φ = 45°)
      const X = reactive === "L" ? tau * Rth : tau / Rth;
      if (reactive === "L" && !half(X)) continue;
      if (reactive === "C" && !(half(X) || half(1 / X))) continue;
      for (const V1 of V_CHOICES) {
        const ampA = reactive === "L" ? (k * V1) / Rth : k * V1;
        if (!half(ampA) || ampA < 0.5) continue;
        for (const V2 of V_CHOICES) {
          const q = reactive === "L" ? V2 / (2 * Rth) : V2 / 2;
          if (!half(q) || q < 0.5) continue;
          for (const m of M_CHOICES) {
            const v: TwoSourceValues = { R1, R2, R3, X, V1, V2, w, m };
            if (same(v, ORIGINAL)) continue;          // ★ 원본 튜플 제외
            out.push(v);
          }
        }
      }
    }
  }
  return out;
}

const same = (a: TwoSourceValues, b: TwoSourceValues) =>
  a.R1 === b.R1 && a.R2 === b.R2 && a.R3 === b.R3 && a.X === b.X &&
  a.V1 === b.V1 && a.V2 === b.V2 && a.w === b.w && a.m === b.m;

function shuffleDeterministic<T>(xs: T[]): T[] {
  return xs.map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 }))
    .sort((p, q) => p.k - q.k).map((p) => p.x);
}

const SIMILAR_SPACE = shuffleDeterministic(buildSpace("L"));
/**
 * ★ 변형 풀에서 유사와 **주어진 수치가 완전히 같은 조합은 제외**한다.
 *   R_th = 1이면 L = τ·R_th 와 C = τ/R_th 가 우연히 같은 값이 되어 두 모드의 소자값·전원값이
 *   전부 동일해진다(스모크가 잡음). 소자 종류가 달라 문제는 다르지만, 수치까지 같으면
 *   "값만 바꾼 복사"처럼 보인다.
 */
const SIMILAR_KEYS = new Set(
  buildSpace("L").map((v) => `${v.R1},${v.R2},${v.R3},${v.X},${v.V1},${v.V2},${v.w},${v.m}`),
);
const VARIANT_SPACE = shuffleDeterministic(
  buildSpace("C").filter((v) => !SIMILAR_KEYS.has(`${v.R1},${v.R2},${v.R3},${v.X},${v.V1},${v.V2},${v.w},${v.m}`)),
);
export const __spaces = { SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL };

// ─────────────────────────────────────────────────────────────
// 표기 helper
// ─────────────────────────────────────────────────────────────

export function fmt(x: number): string {
  if (int(x)) return String(Math.round(x));
  if (half(x)) return `${Math.round(x * 2)}/2`;
  const r = Math.round(x * 1000) / 1000;
  return String(r);
}

/**
 * e^(−t/τ) 표기. `shiftTex`를 주면 지수의 t를 (t − shift)로 바꾼다.
 * ★ 문자열 치환(`.replace("t", ...)`)으로 만들지 마라 — "−2t"의 t를 "π/2"로 바꿔
 *   **e^{-21π/2}** 같은 쓰레기가 나왔다(실측).
 */
export function expTex(tau: number, shiftTex = ""): string {
  const arg = shiftTex ? `(t − ${shiftTex})` : "t";
  if (Math.abs(tau - 1) < 1e-9) return `e^{-${arg}}`;
  const inv = 1 / tau;
  if (int(inv)) return `e^{-${Math.round(inv)}${arg}}`;
  return `e^{-${arg}/${fmt(tau)}}`;
}

/**
 * e^{-T₁/τ} — 지수를 **미리 약분해서** 넘긴다.
 *   T₁ = mπ/ω 이고 ωτ = 1 이므로 T₁/τ = mπ 로 항상 깔끔하다.
 *   ("e^{-4π/2}"·"e^{-2·π}" 같은 미약분 표기가 나오면 안 된다.)
 */
export function expConstTex(tau: number, T1: number): string {
  return `e^{-${piTex(T1 / tau)}}`;
}

/** 작은 분모의 기약분수 표기 — 3/4·2/3처럼 0.75·0.667로 새는 것을 막는다. */
export function ratTex(x: number, maxDen = 24): string {
  if (int(x)) return String(Math.round(x));
  for (let d = 2; d <= maxDen; d++) {
    const n = x * d;
    if (Math.abs(n - Math.round(n)) < 1e-9) {
      const nn = Math.round(n);
      const gg = gcd(Math.abs(nn), d);
      return `${nn / gg}/${d / gg}`;
    }
  }
  return String(Math.round(x * 1000) / 1000);
}
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

/** 계수 1은 생략한다 — "1e^{-2t}"·"1√2" 같은 표기 방지. */
export function coefTex(x: number): string {
  if (Math.abs(x - 1) < 1e-9) return "";
  return ratTex(x);
}

/** π의 유리수배 표기 — "π", "2π", "π/2", "3π/2". (1π/2 같은 표기가 나오면 안 된다.) */
export function piTex(x: number): string {
  const r = x / Math.PI;
  if (int(r)) {
    const n = Math.round(r);
    return n === 1 ? "π" : `${n}π`;
  }
  if (half(r)) {
    const n = Math.round(r * 2);
    return n === 1 ? "π/2" : `${n}π/2`;
  }
  return fmt(x);
}

/** sin(ωt)의 인수 표기 — ω=1이면 "t", 정수면 "2t", 1/n이면 "t/n". */
export function omegaArgTex(w: number): string {
  if (Math.abs(w - 1) < 1e-9) return "t";
  if (int(w)) return `${Math.round(w)}t`;
  const inv = 1 / w;
  if (int(inv)) return `t/${Math.round(inv)}`;
  return `${fmt(w)}t`;
}

/** q√2 표기 — q가 분수면 괄호로 감싼다("1/2√2" 같은 모호한 표기 방지). */
export function rootCoefTex(q: number): string {
  if (Math.abs(q - 1) < 1e-9) return "√2";
  return int(q) ? `${Math.round(q)}√2` : `(${ratTex(q)})√2`;
}

// ─────────────────────────────────────────────────────────────
// 생성
// ─────────────────────────────────────────────────────────────

export type TwoSourceGeneration = {
  values: TwoSourceValues;
  sol: TwoSourceSolution;
  reactive: "L" | "C";
  /** 구하는 양 — 유사=i(t)[A] / 변형=v_C(t)[V]. */
  target: { symbol: string; unit: string; subA: string; subB: string };
  figures: {
    full: TwoSourceRlSuperpositionCircuitDiagram;
    v1Only: TwoSourceRlSuperpositionCircuitDiagram;
    v2Only: TwoSourceRlSuperpositionCircuitDiagram;
  };
};

export function generateTwoSourceRlSuperposition(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): TwoSourceGeneration {
  const reactive: "L" | "C" = args.mode === "exam_variant" ? "C" : "L";
  const space = reactive === "C" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 101) % space.length;
  const values = space[idx];
  const sol = solveTwoSource(values, reactive);

  const target = reactive === "L"
    ? { symbol: "i(t)", unit: "A", subA: "i_A(t)", subB: "i_B(t)" }
    : { symbol: "v_C(t)", unit: "V", subA: "v_{CA}(t)", subB: "v_{CB}(t)" };

  const base = {
    r1Label: `${values.R1}Ω`,
    r2Label: `${values.R2}Ω`,
    r3Label: `${values.R3}Ω`,
    reactive,
    reactiveLabel: reactive === "L" ? `${fmt(values.X)}H` : `${fmt(values.X)}F`,
    v1Label: "v₁(t)",
    v2Label: "v₂(t)",
    pulseHeight: values.V1,
    pulseWidthTex: piTex(sol.T1),
    sineAmp: values.V2,
    omega: values.w,
  };

  return {
    values, sol, reactive, target,
    figures: {
      full:   { ...base, variant: "full",    measureLabel: target.symbol, showPlots: true },
      v1Only: { ...base, variant: "v1_only", measureLabel: target.subA.replace(/[{}\\]/g, ""), dashedBox: true },
      v2Only: { ...base, variant: "v2_only", measureLabel: target.subB.replace(/[{}\\]/g, ""), dashedBox: true },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 공용 매처 (분류기·감지기 공유)
// ─────────────────────────────────────────────────────────────

export function twoSourceText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [
    a.topic ?? "", a.interpretation ?? "",
    (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
}

const SUPERPOSITION_RE = /중첩의?\s*원리|superposition/i;
const THEVENIN_RE = /테브난\s*등가|테브냉\s*등가|thevenin/i;
const STEP_RE = /단위\s*계단|단위계단|계단\s*함수|u\s*\(\s*t\s*\)/i;
const REQ_RE = /합성\s*저항|R_?eq|등가\s*저항/i;
/** 두 전원이 **동시에** 있고 각각 단독 회로로 분해하는 형식. */
const TWO_SOURCE_RE = /2\s*개의?\s*전압원|두\s*개의?\s*전압원|전압원\s*2\s*개|v_?1\s*\(?t?\)?\s*[와과,]\s*v_?2|v₁.*v₂/i;
/** 형제 양보 — 스위치 절체·종속전원·페이저 정상상태 전용 유형이 따로 있다. */
const YIELD_RE =
  /스위치|switch|\bSW\b|단자\s*A|종속\s*전(원|압원|류원)|역률|공진|어드미턴스|상태\s*방정식|최대\s*전력|브리지/i;

/**
 * 구조 시그니처 — 낱말 하나가 아니라 **절차 구조**로 잡는다(CLAUDE.md 규칙 2).
 *   "전압원 2개 + 중첩" 이 뼈대이고, 여기에 테브난 등가·단위계단·합성저항 중 하나라도 붙으면 확정.
 *   스위치가 언급되면 절체형 형제(임용 3·17번)에 양보한다 — 이 원본엔 **스위치가 없다**.
 */
export function matchesTwoSourceRlSuperposition(a?: Partial<AnalysisResult> | null): boolean {
  const t = twoSourceText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;

  const inv = a?.componentInventory ?? [];
  const nV = inv.filter((c) => /^V$/i.test(String(c?.type ?? ""))).length;
  const nR = inv.filter((c) => /^R$/i.test(String(c?.type ?? ""))).length;
  const nSW = inv.filter((c) => /^SW$/i.test(String(c?.type ?? ""))).length;
  const nI = inv.filter((c) => /^I$/i.test(String(c?.type ?? ""))).length;
  const nReactive = inv.filter((c) => /^[LC]$/i.test(String(c?.type ?? ""))).length;

  // ★★ 최후의 구조 신호 (실측 신고 2026-08-12): Vision이 이 원본을 **"RL 회로의 과도 응답 분석"**
  //   한 줄로만 요약해 중첩·테브난·단위계단이 전부 사라진 회차가 있었다(로그: cachedType=rl_step,
  //   generic_dispatch_warning). 그때 남는 것은 **인벤토리 구조**뿐이다 —
  //   전압원 2개 + 저항 3개 이상 + 리액티브 1개 + **스위치·전류원 없음**.
  //   형제 어느 것도 이 조합이 아니다(임용 3번·17번은 스위치가 있고, 17번은 전류원 구동이다).
  if (nV >= 2 && nR >= 3 && nReactive >= 1 && nSW === 0 && nI === 0) return true;

  const twoSources = TWO_SOURCE_RE.test(t) || nV >= 2;
  if (!twoSources) return false;

  const procedural = [SUPERPOSITION_RE, THEVENIN_RE, STEP_RE, REQ_RE].filter((re) => re.test(t)).length;
  // 중첩만으로도, 또는 테브난·단위계단·합성저항 신호 2개 이상이면 인정.
  const strong = SUPERPOSITION_RE.test(t) ? procedural >= 1 : procedural >= 2;
  if (!strong) return false;

  // 리액티브 소자가 하나는 있어야 과도 해석이 성립한다(인벤토리를 흘린 회차는 텍스트로 인정).
  return nReactive >= 1 || /인덕터|코일|커패시터|축전기|\bRL\b|\bRC\b|\[H\]|\[F\]/i.test(t);
}
