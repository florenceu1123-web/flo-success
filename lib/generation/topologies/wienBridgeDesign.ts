import type { AnalysisResult, GenerationMode } from "@/types";

/**
 * 임용 30번 — Wien bridge 발진회로 **수치 설계형**. ★결정론 archetype (GPT 없음)★
 *
 * ## 원본
 *   비반전 OPAMP + 정귀환 RC망(직렬 R·C ‖ 병렬 R·C, 둘 다 **50kΩ·16nF**),
 *   음귀환은 `R_1`(V⁻→접지)·`R_2`(V⁻→V_o).
 *   "발진기가 **안정적이고 지속적으로** 동작하기 위한 R₁, R₂와 공진주파수 f₀로 가장 적절한 것은?"
 *   (π = 3.14, 이상적 연산증폭기) → 보기 ①~⑤ 객관식, **정답 ② R₁=10kΩ · R₂=22kΩ · f₀ ≈ 200Hz**.
 *
 * ## 형제와 다르다
 *   기존 `WIEN_BRIDGE_OSCILLATOR`(`lib/generation/analog/wienBridgeOscillator.ts`)는 **기호형**이다 —
 *   수치를 주지 않고 `K = 1 + R₃/R₁` → `β(s)` 표준형 → 특성방정식에서 **비 R₃/R₁ = 2**를 구한다.
 *   이 원본은 **수치가 주어진 설계 문제**라 묻는 것이 다르다(R₁·R₂의 실제 값과 f₀[Hz]).
 *   ★ 회로 figure는 **같은 빌더**(`buildWienBridgeNetlist`)를 공유한다 — 복제하면 드리프트한다.
 *
 * ## 물리 (닫힌형)
 *   · 정귀환망 궤환율: 두 RC의 R·C가 같으면 공진에서 **β = 1/3** (주파수 선택성의 최대점).
 *   · 바크하우젠 조건 |A·β| ≥ 1 → **A_v = 1 + R₂/R₁ ≥ 3**, 즉 **R₂ ≥ 2R₁**.
 *     ★★ "**지속적**으로 동작"하려면 정확히 3이면 임계(감쇠/성장의 경계)라 **3보다 약간 크게** 잡는다.
 *     원본이 R₂/R₁ = 2.2(=22/10)를 정답으로 둔 이유이고, 이 문제의 채점 포인트다.
 *   · 공진(발진) 주파수: **f₀ = 1/(2πRC)**.
 *     원본 검산: RC = 50×10³ × 16×10⁻⁹ = 8×10⁻⁴ s → f₀ = 1/(2×3.14×8×10⁻⁴) = 199.04 ≈ **200 Hz**.
 *
 * ## 값은 규칙 열거 + 필터 (예시 하드코딩 아님)
 *   R·C를 열거해 **f₀가 깔끔한 값에 충분히 가까운**(반올림 오차 ≤ 1.5%) 조합만 채택하고,
 *   R₁·R₂는 **비가 2.1~2.4인 E-계열 쌍**만 쓴다(3보다 약간 큰 이득). **원본 튜플은 제외**한다.
 */

/** π는 원본 지시대로 3.14로 계산한다(문항 조건에도 명시). */
export const PI_APPROX = 3.14;

export type WienDesignValues = {
  /** 정귀환 RC망의 저항 [kΩ] (직렬·병렬 동일) */
  R_kohm: number;
  /** 정귀환 RC망의 커패시터 [nF] (직렬·병렬 동일) */
  C_nF: number;
  /** 음귀환 접지측 저항 [kΩ] */
  R1_kohm: number;
  /** 음귀환 되먹임 저항 [kΩ] — R2/R1 이 2보다 약간 커야 발진이 지속된다 */
  R2_kohm: number;
};

export type WienDesignGeneration = {
  values: WienDesignValues;
  /** 정확한 f₀ [Hz] (π=3.14 기준) */
  f0: number;
  /** 보기에 쓰는 반올림 값 [Hz] */
  f0Round: number;
  /** 폐루프 이득 A_v = 1 + R2/R1 */
  gain: number;
  /** R2/R1 */
  ratio: number;
  /** RC 곱 [s] */
  rc: number;
};

// ── 값 공간 ─────────────────────────────────────────────
/** 비가 2.1~2.4인 E-계열 (R₁, R₂) 쌍 — 이득이 3보다 약간 크다. */
const GAIN_PAIRS: Array<[number, number]> = [
  [5, 11], [10, 22], [15, 33], [20, 44], [25, 55], [30, 66], [12, 27], [20, 45],
];
// ★ R[kΩ]·C[nF]는 **정수만** 쓴다 — 곱 R×C가 그대로 RC[µs]가 되어 풀이에 소수가 생기지 않는다.
//   (route의 전역 분수 변환기는 단위 없는 소수를 분수로 바꾼다 — CLAUDE.md 1-4-3.)
const R_POOL = [10, 15, 20, 25, 33, 47, 50, 68, 100];
const C_POOL = [10, 15, 16, 22, 33, 47, 68, 100];

/** 원본 튜플 — 생성 풀에서 제외한다(참조·검산 전용). */
const ORIGINAL: WienDesignValues = { R_kohm: 50, C_nF: 16, R1_kohm: 10, R2_kohm: 22 };

/** f₀ = 1/(2πRC) — R[kΩ]·C[nF] 단위를 SI로 환산해 계산한다. */
export function computeF0(R_kohm: number, C_nF: number): number {
  const rc = (R_kohm * 1e3) * (C_nF * 1e-9);
  return 1 / (2 * PI_APPROX * rc);
}

/** 사람이 "약 ~Hz"라고 부를 만한 값으로 반올림 (자릿수에 맞춰 50/100/500 단위). */
function roundNice(f: number): number {
  if (f < 300) return Math.round(f / 50) * 50;
  if (f < 3000) return Math.round(f / 100) * 100;
  return Math.round(f / 500) * 500;
}

function buildSpace(): WienDesignValues[] {
  const out: WienDesignValues[] = [];
  for (const R_kohm of R_POOL) {
    for (const C_nF of C_POOL) {
      const f0 = computeF0(R_kohm, C_nF);
      if (f0 < 80 || f0 > 12000) continue;               // 임용에서 다루는 범위
      const nice = roundNice(f0);
      if (nice <= 0) continue;
      // "약 N Hz"로 부르려면 반올림 오차가 작아야 한다.
      if (Math.abs(f0 - nice) / nice > 0.015) continue;
      for (const [R1_kohm, R2_kohm] of GAIN_PAIRS) {
        const v: WienDesignValues = { R_kohm, C_nF, R1_kohm, R2_kohm };
        if (v.R_kohm === ORIGINAL.R_kohm && v.C_nF === ORIGINAL.C_nF
          && v.R1_kohm === ORIGINAL.R1_kohm && v.R2_kohm === ORIGINAL.R2_kohm) continue; // ★ 원본 제외
        out.push(v);
      }
    }
  }
  return out;
}

/** 결정론 셔플 — 열거 순서대로 두면 앞쪽 문항이 전부 비슷해진다. */
function shuffleDet<T>(xs: T[]): T[] {
  return xs
    .map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 }))
    .sort((p, q) => p.k - q.k)
    .map((p) => p.x);
}

const SPACE = shuffleDet(buildSpace());
const SIMILAR_SPACE = SPACE.filter((_, i) => i % 2 === 0);
const VARIANT_SPACE = SPACE.filter((_, i) => i % 2 === 1);
export const __spaces = { SPACE, SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL, GAIN_PAIRS, roundNice };

export function generateWienBridgeDesign(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): WienDesignGeneration {
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 211) % space.length;
  const values = space[idx];

  const rc = (values.R_kohm * 1e3) * (values.C_nF * 1e-9);
  const f0 = computeF0(values.R_kohm, values.C_nF);
  const ratio = values.R2_kohm / values.R1_kohm;

  return { values, f0, f0Round: roundNice(f0), gain: 1 + ratio, ratio, rc };
}

// ── 공용 매처 (분류기·route 안전망이 함께 쓴다) ──────────────
export function wienDesignText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [
    a.topic ?? "",
    a.interpretation ?? "",
    (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
}

/** 이 유형의 뼈대 — Wien bridge 발진기. */
const WIEN_RE = /빈\s*브\s*리?\s*지|빈브릿지|wien|위인\s*브리지/i;
/** ★ 수치 **설계**형 신호 — 저항 값과 주파수를 "구하는" 문제. */
const DESIGN_RE =
  /공진\s*주파수|발진\s*주파수|f\s*_?\s*0|주파수\s*를?\s*구|저항\s*값|적절한\s*것|r\s*_?\s*1|r\s*_?\s*2|k\s*Ω|kohm|\bnF\b|㎋/i;
/**
 * 형제 양보 — **기호형** Wien(전달특성 β(s)·특성방정식만 묻고 수치가 없다)은 기존 archetype에 넘긴다.
 * 다른 발진기(위상천이·함수발생기·T형 RC)와 루프이득 안정도도 각자 유형이 있다.
 */
const YIELD_RE =
  /위상\s*천이|phase\s*shift|비정현파|구형파|삼각파|슈미트|함수\s*발생기|루프\s*이득|좌반평면|전달\s*특성|블록도|t형|콜피츠|하틀리/i;

/**
 * 구조 시그니처 — **Wien bridge + 수치 설계 요구**.
 *
 * ★ 기호형 형제와 갈리는 지점은 "수치가 주어지고 값을 구하는가"다. 낱말이 흔들려도 잡히도록
 *   단위 표기(kΩ·nF)와 `R_1`·`R_2` 기호까지 설계 신호로 인정한다(CLAUDE.md 규칙 2).
 */
export function matchesWienBridgeDesign(a?: Partial<AnalysisResult> | null): boolean {
  const t = wienDesignText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;
  return WIEN_RE.test(t) && DESIGN_RE.test(t);
}
