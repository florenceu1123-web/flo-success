import type { AnalysisResult, GenerationMode } from "@/types";

/**
 * 임용 27번 — **컴퓨터 데이터 표현과 산술 연산**(2진·16진 변환, 1·2의 보수, 범위, 오버플로).
 *
 * ## 원본
 *   〈보기〉 ㄱ~ㅁ 다섯 항목의 참·거짓을 가려 고르는 **객관식**. 다루는 지식점은
 *   ① 2진 → 16진 변환 ② 1의 보수 ↔ 2의 보수 표현 ③ 1의 보수 덧셈의 순환 자리올림
 *   ④ n비트 2의 보수 표현 범위 ⑤ 8비트 2의 보수 덧셈과 오버플로 판정.
 *   (원본 ㄱ의 2진수는 F94₁₆에 대응하는 **111110010100₂** 로 읽었다 — 확대해도 마지막 자리가 흐리다.)
 *
 * ## ★ 사용자 지정 (2026-08-12): **빈칸 채우기**로 출제한다 — "유형은 비슷하게"
 *   〈보기〉의 다섯 지식점을 그대로 두되 값을 **㉠~㉤ 빈칸**으로 비운다.
 *   참·거짓 판별(원본 ㄷ·ㅁ은 서술이 모호해 논쟁 여지가 있다)을 **결정론적으로 계산되는 값**으로
 *   바꾸므로 정답이 명확해진다.
 *
 * ## 모든 빈칸은 코드로 계산한다 (GPT 없음)
 *   ㉠ bin → hex 변환
 *   ㉡ n비트에서 −a의 **1의 보수** 표현
 *   ㉢ 그 값과 같아지는 **2의 보수** 표현의 십진수(= −(a+1))
 *   ㉣ n비트 2의 보수 표현 범위의 **최솟값**
 *   ㉤ w비트에서 두 정수의 2의 보수 덧셈 결과(2진) — 오버플로 발생 여부도 함께 답한다
 */

export type NumberReprValues = {
  /** ㉠ — 변환할 2진수 (비트 문자열, 4의 배수 길이) */
  binHex: string;
  /** ㉡·㉢ — n비트 시스템, 음수 크기 a (−a를 1의 보수로) */
  nBits: number;
  a: number;
  /** ㉣ — 범위를 묻는 비트 수 */
  rangeBits: number;
  /** ㉤ — w비트 덧셈 피연산자 (부호 있는 십진수) */
  addBits: number;
  x: number;
  y: number;
  /** 변형이면 방향을 뒤집는다(16진 → 2진, 표현 → 십진). */
  dual: boolean;
};

export type NumberReprSolution = {
  hex: string;          // ㉠
  onesComp: string;     // ㉡ (nBits 2진 문자열)
  twosDec: number;      // ㉢ (= −(a+1))
  rangeMin: string;     // ㉣ (−2^(n−1) 표기)
  rangeMax: string;
  sumBin: string;       // ㉤
  sumDec: number;
  overflow: boolean;
};

/** ★ 음수는 **유니코드 마이너스(−)** 로 통일한다 — ASCII 하이픈이 섞이면 같은 문항에 두 기호가 공존한다. */
export const neg = (x: number) => String(x).replace(/-/g, "−");

const toBin = (v: number, w: number) => ((v >>> 0) & ((1 << w) - 1)).toString(2).padStart(w, "0");
const signed = (bits: string) => {
  const w = bits.length, u = parseInt(bits, 2);
  return u >= 1 << (w - 1) ? u - (1 << w) : u;
};

export function solveNumberRepr(v: NumberReprValues): NumberReprSolution {
  // ㉠ 2진 → 16진 (4비트씩 묶음)
  let hex = "";
  for (let i = 0; i < v.binHex.length; i += 4) hex += parseInt(v.binHex.slice(i, i + 4), 2).toString(16).toUpperCase();

  // ㉡ −a의 1의 보수 (n비트): +a의 각 비트 반전
  const onesComp = toBin(~v.a, v.nBits);
  // ㉢ 같은 비트열을 2의 보수로 읽으면 −(a+1)
  const twosDec = -(v.a + 1);

  // ㉣ 범위
  const rangeMin = `−2^${v.rangeBits - 1}`;
  const rangeMax = `2^${v.rangeBits - 1} − 1`;

  // ㉤ w비트 2의 보수 덧셈
  const bx = toBin(v.x, v.addBits), by = toBin(v.y, v.addBits);
  const sumBin = toBin(v.x + v.y, v.addBits);
  const sumDec = signed(sumBin);
  // 오버플로: 같은 부호끼리 더했는데 결과 부호가 다르면 발생
  const sx = bx[0], sy = by[0], ss = sumBin[0];
  const overflow = sx === sy && ss !== sx;

  return { hex, onesComp, twosDec, rangeMin, rangeMax, sumBin, sumDec, overflow };
}

// ── 값 공간 ──────────────────────────────────
const HEX_LEN = [12, 16];          // 3~4자리 16진수
const N_BITS = [4, 5, 6];
const RANGE_BITS = [6, 8, 10, 12, 16];
const ADD_BITS = [8];

function shuffleDet<T>(xs: T[]): T[] {
  return xs.map((x, i) => ({ x, k: (i * 2654435761) % 4294967296 })).sort((p, q) => p.k - q.k).map((p) => p.x);
}

/** 원본 튜플 — 생성 풀에서 제외한다. */
const ORIGINAL = { binHex: "111110010100", nBits: 4, a: 2, rangeBits: 0, x: -19, y: -5 };

function buildSpace(dual: boolean): NumberReprValues[] {
  const out: NumberReprValues[] = [];
  // ㉠ 2진수 — 최상위 니블이 0이면 자릿수가 줄어 헷갈린다(1로 시작 강제).
  const bins: string[] = [];
  for (const len of HEX_LEN) {
    for (let s = 0; s < 40; s++) {
      let b = "1";
      for (let i = 1; i < len; i++) b += ((s * 2654435761 + i * 40503) >>> (i % 7)) & 1 ? "1" : "0";
      if (!bins.includes(b)) bins.push(b);
    }
  }
  for (const binHex of bins.slice(0, 24)) {
    for (const nBits of N_BITS) {
      const maxA = (1 << (nBits - 1)) - 2;      // a+1도 표현 가능해야 한다
      for (let a = 2; a <= Math.min(maxA, 6); a++) {
        for (const rangeBits of RANGE_BITS) {
          for (const addBits of ADD_BITS) {
            // ㉤ — 두 음수를 더해 **오버플로가 나는 경우와 안 나는 경우**를 모두 낸다(판정이 답의 일부).
            for (const [x, y] of [[-19, -5], [-72, -80], [-40, -30], [-100, -50], [-12, -9], [64, 80]] as Array<[number, number]>) {
              if (x === ORIGINAL.x && y === ORIGINAL.y && binHex === ORIGINAL.binHex
                && nBits === ORIGINAL.nBits && a === ORIGINAL.a) continue;   // ★ 원본 제외
              const v: NumberReprValues = { binHex, nBits, a, rangeBits, addBits, x, y, dual };
              const s = solveNumberRepr(v);
              // 값 품질: 16진수는 3자리 이상, 합은 8비트로 표현되는 비트열이어야 한다.
              if (s.hex.length < 3) continue;
              out.push(v);
            }
          }
        }
      }
    }
  }
  return shuffleDet(out);
}

const SIMILAR_SPACE = buildSpace(false);
const VARIANT_SPACE = buildSpace(true);
export const __spaces = { SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL };

// ── 생성 ─────────────────────────────────────
export type NumberReprGeneration = {
  values: NumberReprValues;
  sol: NumberReprSolution;
  /** 〈보기〉 다섯 항목 (빈칸 포함) */
  items: string[];
  /** 빈칸별 정답 */
  answers: Array<{ mark: string; value: string }>;
};

const MARKS = ["㉠", "㉡", "㉢", "㉣", "㉤"];

export function generateNumberReprFillBlank(args: {
  seed?: number; index?: number; mode: GenerationMode;
}): NumberReprGeneration {
  const dual = args.mode === "exam_variant";
  const space = dual ? VARIANT_SPACE : SIMILAR_SPACE;
  const idx = Math.abs((args.seed ?? 0) + (args.index ?? 0) * 331) % space.length;
  const values = space[idx];
  const s = solveNumberRepr(values);

  const items = dual
    ? [
      `ㄱ. 16진수 데이터 ${s.hex}₁₆을 2진수로 변환하면 ( ㉠ )₂이다.`,
      `ㄴ. ${values.nBits}비트 시스템에서 2진수 ${s.onesComp}₂를 **1의 보수** 표현으로 읽으면 십진수 ( ㉡ )이고, ` +
        `같은 비트열을 **2의 보수** 표현으로 읽으면 십진수 ( ㉢ )이다.`,
      `ㄷ. 1의 보수를 이용한 덧셈은 최상위에서 발생한 자리올림을 ( ㉣ )에 다시 더해 주어야 하므로, ` +
        `2의 보수를 이용한 덧셈보다 연산 속도가 느리다.`,
      `ㄹ. ${values.rangeBits}비트 부호화된 2의 보수 표현에서 표시 가능한 정수의 **최댓값**은 ( ㉤ )이다.`,
      `ㅁ. ${values.addBits}비트 시스템에서 (${neg(values.x)}) + (${neg(values.y)})를 2의 보수 방법으로 계산한 결과는 ` +
        `${s.sumBin}₂이며, 이때 초과(overflow)는 **${s.overflow ? "발생한다" : "발생하지 않는다"}**.`,
    ]
    : [
      `ㄱ. 2진수 데이터 ${values.binHex}₂를 16진수로 변환하면 ( ㉠ )₁₆이다.`,
      `ㄴ. ${values.nBits}비트 시스템에서 −${values.a}를 **1의 보수**로 표현한 값은 ( ㉡ )₂이고, ` +
        `이는 십진수 ( ㉢ )을(를) **2의 보수**로 표현한 값과 같다.`,
      `ㄷ. 1의 보수를 이용한 덧셈은 최상위에서 발생한 자리올림을 ( ㉣ )에 다시 더해 주어야 하므로, ` +
        `2의 보수를 이용한 덧셈보다 연산 속도가 느리다.`,
      `ㄹ. ${values.rangeBits}비트 부호화된 2의 보수 표현에서 표시 가능한 정수의 범위는 ${s.rangeMin} ~ ( ㉤ )이다.`,
      `ㅁ. ${values.addBits}비트 시스템에서 (${neg(values.x)}) + (${neg(values.y)})를 2의 보수 방법으로 계산하면 ` +
        `결과는 ${s.sumBin}₂이고, 초과(overflow)는 **${s.overflow ? "발생한다" : "발생하지 않는다"}**.`,
    ];

  const answers = dual
    ? [
      { mark: MARKS[0], value: `${values.binHex}` },
      { mark: MARKS[1], value: `−${values.a}` },
      { mark: MARKS[2], value: neg(s.twosDec) },
      { mark: MARKS[3], value: "최하위 비트(순환 자리올림)" },
      { mark: MARKS[4], value: `${s.rangeMax}` },
    ]
    : [
      { mark: MARKS[0], value: s.hex },
      { mark: MARKS[1], value: s.onesComp },
      { mark: MARKS[2], value: neg(s.twosDec) },
      { mark: MARKS[3], value: "최하위 비트(순환 자리올림)" },
      { mark: MARKS[4], value: s.rangeMax },
    ];

  return { values, sol: s, items, answers };
}

// ── 공용 매처 ────────────────────────────────
export function numberReprText(a?: Partial<AnalysisResult> | null): string {
  if (!a) return "";
  return [a.topic ?? "", a.interpretation ?? "", (a.relatedConcepts ?? []).join(" "),
    (a.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" ")].join(" ");
}

const COMPLEMENT_RE = /1의?\s*보수|2의?\s*보수|보수\s*표현|complement/i;
/**
 * ★ bare "진수"·"수 표현"은 너무 넓다 — 형제 `number_representation`(임용 4번, n비트 수 표현 **고리 그림**)을
 *   통째로 뺏었다(통합 라우팅 스모크가 잡음). 이 유형의 고유 작업은 **16진 변환** 또는 **오버플로 판정**이다.
 */
const REPR_RE = /16\s*진|hex|오버플로|overflow|초과/i;
/** 형제 양보 — 회로·논리회로 유형이 아니어야 한다. */
const YIELD_RE =
  /플립플롭|게이트|카르노|K-?map|회로도|저항|커패시터|인덕터|전압원|전류원|카운터|MUX|상태도|고리|링\s*형태/i;

/**
 * 구조 시그니처 — **보수 표현 + 진수 변환/오버플로**가 함께 나오는 순수 텍스트 문항.
 * 회로 낱말이 하나라도 있으면 양보한다(이 유형은 그림이 없다).
 */
export function matchesNumberReprFillBlank(a?: Partial<AnalysisResult> | null): boolean {
  const t = numberReprText(a);
  if (!t) return false;
  if (YIELD_RE.test(t)) return false;
  return COMPLEMENT_RE.test(t) && REPR_RE.test(t);
}
