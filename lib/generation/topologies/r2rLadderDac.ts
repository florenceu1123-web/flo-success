import type { AnalysisResult, GenerationMode } from "@/types";

/**
 * 임용 28번 — **4비트 R-2R 사다리형 D/A 변환회로**. ★결정론 archetype (GPT 없음)★
 *
 * ## 원본 (확대 확인 + 마디해석 검산)
 * ```
 *   GND —10kΩ— n₁ —5kΩ— n₂ —5kΩ— n₃ —5kΩ— n₄ → OPAMP (+)
 *              │10k       │10k       │10k       │10k
 *              A          B          C          D          (A=LSB … D=MSB)
 *   OPAMP: (−)에 100kΩ 접지 + 100kΩ 귀환 → **비반전 이득 2**
 * ```
 *   디지털 '1' = 5[V], '0' = 0[V]. DCBA = 0110 일 때 V_o 를 고르는 **객관식**.
 *   → 사다리 개방 출력 `V_th = V_ref · (DCBA)/16 = 5 · 6/16 = 15/8 [V]`,
 *     비반전 이득 2를 곱해 **V_o = 30/8 [V]** → **정답 ③**.
 *   ★ 마디해석으로 직접 풀어 공식과 일치함을 확인했다(사다리 종단 10kΩ 포함).
 *
 * ## ★ R-2R의 핵심 성질
 *   직렬 R·션트 2R이면 각 비트가 **2의 거듭제곱으로 가중**되고, 사다리를 들여다본 저항은
 *   비트 값과 무관하게 항상 **R**이다. 그래서 개방 출력이 `V_ref × (2진값)/2ⁿ` 으로 딱 떨어진다.
 *   이것이 이 문제의 채점 포인트다 — 마디를 하나하나 풀 필요가 없다.
 *
 * ## 값은 규칙 열거 + 필터
 *   R·2R 쌍, V_ref, 귀환/접지 저항(이득), 입력 워드를 열거하고
 *   **V_o가 분모 16 이하의 기약분수**로 떨어지는 조합만 채택한다(보기처럼 `n/8` 꼴).
 *   **원본 튜플(5k·10k·5V·100k/100k·0110)은 제외**한다.
 */

export type R2rValues = {
  /** 직렬 저항 R [kΩ] */
  rSeries: number;
  /** 션트·종단 저항 2R [kΩ] */
  rShunt: number;
  /** 논리 '1' 전압 [V] */
  vRef: number;
  /** OPAMP 귀환 저항 [kΩ] */
  rf: number;
  /** OPAMP (−) 접지측 저항 [kΩ] */
  rg: number;
  /** 입력 워드 (MSB…LSB = D C B A), 길이 4 */
  word: [number, number, number, number];
};

export type R2rGeneration = {
  values: R2rValues;
  /** 워드의 10진값 (0~15) */
  decimal: number;
  /** 사다리 개방 출력 [V] */
  vLadder: number;
  /** 비반전 이득 (1 + Rf/Rg) */
  gain: number;
  /** 최종 출력 [V] */
  vOut: number;
};

/**
 * 사다리 개방 출력을 **마디해석으로 직접** 계산한다 (공식을 믿지 않고 회로를 푼다).
 * 마디: n₁ … n₄ (n₄가 출력, 이상 OPAMP 입력이라 개방).
 */
export function solveLadder(v: R2rValues): number {
  const n = 4;
  const gS = 1 / v.rSeries, gP = 1 / v.rShunt;
  const G: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const I: number[] = Array(n).fill(0);
  const addR = (a: number, b: number, g: number) => {
    if (a >= 0) G[a][a] += g;
    if (b >= 0) G[b][b] += g;
    if (a >= 0 && b >= 0) { G[a][b] -= g; G[b][a] -= g; }
  };
  addR(-1, 0, gP);                                  // 종단 2R → GND
  for (let i = 0; i < n - 1; i += 1) addR(i, i + 1, gS);
  // word는 MSB…LSB, 마디는 n₁(LSB) … n₄(MSB) 순서다.
  const lsbFirst = [...v.word].reverse();
  lsbFirst.forEach((bit, i) => { G[i][i] += gP; I[i] += (bit ? v.vRef : 0) * gP; });

  // 가우스 소거
  const M = G.map((row, i) => [...row, I[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return M[n - 1][n] / M[n - 1][n - 1];
}

// ── 값 공간 ─────────────────────────────────────────────
/** (R, 2R) 쌍 — 2R = 2×R 이어야 사다리가 성립한다. */
const R_PAIRS: Array<[number, number]> = [[5, 10], [10, 20], [2.5, 5], [20, 40]];
const V_REFS = [4, 5, 8, 10, 16];
/** (Rf, Rg) — 비반전 이득 1 + Rf/Rg. 이득이 정수·반정수가 되게. */
const GAIN_PAIRS: Array<[number, number]> = [[100, 100], [100, 50], [200, 100], [150, 100], [50, 100]];

const ORIGINAL: R2rValues = {
  rSeries: 5, rShunt: 10, vRef: 5, rf: 100, rg: 100, word: [0, 1, 1, 0],
};

/** 기약분수 분모 (x = p/q 로 딱 떨어지는가). */
function denomOf(x: number, maxDen = 64): number | null {
  for (let q = 1; q <= maxDen; q += 1) {
    const p = x * q;
    if (Math.abs(p - Math.round(p)) < 1e-9) {
      const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
      return q / g(Math.abs(Math.round(p)) || 1, q);
    }
  }
  return null;
}

function buildSpace(): R2rValues[] {
  const out: R2rValues[] = [];
  for (const [rSeries, rShunt] of R_PAIRS) {
    for (const vRef of V_REFS) {
      for (const [rf, rg] of GAIN_PAIRS) {
        for (let d = 1; d <= 14; d += 1) {          // 0·15는 너무 뻔하다
          const word: [number, number, number, number] =
            [(d >> 3) & 1, (d >> 2) & 1, (d >> 1) & 1, d & 1];
          const v: R2rValues = { rSeries, rShunt, vRef, rf, rg, word };
          const vl = solveLadder(v);
          const gain = 1 + rf / rg;
          const vo = vl * gain;
          if (vo <= 0 || vo > 40) continue;
          const den = denomOf(vo, 16);
          if (den === null) continue;                // 보기처럼 깔끔한 분수만
          // ★ 원본 튜플 제외
          if (rSeries === ORIGINAL.rSeries && vRef === ORIGINAL.vRef
            && rf === ORIGINAL.rf && rg === ORIGINAL.rg
            && word.join("") === ORIGINAL.word.join("")) continue;
          out.push(v);
        }
      }
    }
  }
  return out;
}

function shuffleDet<T>(xs: T[]): T[] {
  return xs.map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 }))
    .sort((p, q) => p.k - q.k).map((p) => p.x);
}

const SPACE = shuffleDet(buildSpace());
const SIMILAR_SPACE = SPACE.filter((_, i) => i % 2 === 0);
const VARIANT_SPACE = SPACE.filter((_, i) => i % 2 === 1);
export const __spaces = { SPACE, SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL, solveLadder, denomOf };

export function generateR2rLadderDac(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): R2rGeneration {
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 211) % space.length;
  const values = space[idx];
  const decimal = values.word.reduce((acc, b) => acc * 2 + b, 0);
  const vLadder = solveLadder(values);
  const gain = 1 + values.rf / values.rg;
  return { values, decimal, vLadder, gain, vOut: vLadder * gain };
}

// ── 공용 매처 ────────────────────────────────────────────
export function r2rText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [a.topic ?? "", a.interpretation ?? "", (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" ")].join(" ");
}

/** 이 유형의 뼈대 — 사다리형 D/A 변환. */
const DAC_RE = /사다리|ladder|r-?2r|d\s*\/\s*a|디지털[\s-]*아날로그|da\s*변환|dac/i;
const BITS_RE = /비트|bit|디지털\s*입력|dcba|출력\s*전압/i;
/** 형제 양보 — 카운터+DAC 복합형(임용 8·10번)은 각자 archetype이 있다. */
const YIELD_RE =
  /카운터|플립플롭|비교기|comparator|파형을?\s*도시|시프트|adc|아날로그[\s-]*디지털|플래시/i;

/**
 * 구조 시그니처 — **사다리형 D/A + 비트 입력 + 출력 전압 요구**.
 * 형제 `counter_dac_comparator`·`tff_dac_chain`은 FF·카운터가 함께 있어 양보 가드에 걸린다.
 */
export function matchesR2rLadderDac(a?: Partial<AnalysisResult> | null): boolean {
  const t = r2rText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;
  return DAC_RE.test(t) && BITS_RE.test(t);
}
