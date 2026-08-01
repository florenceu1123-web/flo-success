import type { GenerationMode, NumberRingDiagram } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * n비트 2진수의 **음수 표현 방식** 판별 (임용 4번 형식) 전용 archetype.
 *
 *  (가)·(나): 각각 하나의 표현 방식으로 n비트 코드와 10진수를 원형(고리)으로 배치한 그림.
 *  발문: 두 그림에서 사용된 **음수 표현 방식**을 순서대로 쓰시오.
 *
 *  표현 방식 3종 (n비트, 상위 1비트가 부호):
 *   · 부호-크기(sign-magnitude): 1xxx = −(xxx),  1000 = −0  → 0이 두 개
 *   · 1의 보수(one's complement): 음수는 비트 반전. 1111 = −0, 1000 = −7(n=4) → 0이 두 개
 *   · 2의 보수(two's complement): 음수는 반전+1. 1111 = −1, 1000 = −8(n=4) → 0이 하나, 음수가 하나 많음
 *
 *  ★ 기존 archetype으로 재현 불가 — 회로·논리식이 아니라 **수 표현 체계**를 묻는 개념+도식 문항이다.
 *    실측 로그에서 이 원본이 `universal_digital`(K-map·논리식)로 갔다.
 */

export type NumberScheme = "sign_magnitude" | "ones_complement" | "twos_complement";

const SCHEME_LABEL: Record<NumberScheme, string> = {
  sign_magnitude: "부호-크기 표현(sign-magnitude)",
  ones_complement: "1의 보수 표현",
  twos_complement: "2의 보수 표현",
};

/** 변형유형(사용자 지정 2026-07-30): 보수를 이용한 **2진수 뺄셈** */
export type SubtractionGeneration = {
  kind: "subtraction";
  values: { bits: number; scheme: NumberScheme; a: number; b: number };
  answer: {
    /** −B의 보수 표현 */
    negB: string;
    /** A + (−B) 이진 덧셈 결과 (자리올림 버림 전 캐리 포함 여부) */
    sumBin: string;
    carryOut: boolean;
    /** 최종 10진수 결과 */
    result: number;
    aBin: string;
    bBin: string;
  };
  /** 개념 연결용 — 사용된 표현 방식의 고리 다이어그램 */
  diagram: NumberRingDiagram;
};

export type NumberRingGeneration = {
  kind?: "identify";
  values: { bits: number; schemeA: NumberScheme; schemeB: NumberScheme };
  answer: {
    labelA: string;
    labelB: string;
    /** 판별 근거 — 각 방식의 결정적 특징 */
    reasonA: string;
    reasonB: string;
    /** 0의 개수·표현 범위 (해설용) */
    rangeA: string;
    rangeB: string;
  };
  diagramA: NumberRingDiagram;
  diagramB: NumberRingDiagram;
};

/** 코드값(부호 없는 정수) → 해당 방식의 10진수 값 */
export function decodeScheme(code: number, bits: number, scheme: NumberScheme): number {
  const signBit = 1 << (bits - 1);
  const mask = (1 << bits) - 1;
  const magnitudeMask = signBit - 1;
  if ((code & signBit) === 0) return code;              // 양수·0은 공통
  switch (scheme) {
    case "sign_magnitude":
      return -(code & magnitudeMask);                   // 1000 → −0
    case "ones_complement":
      return -(~code & mask);                           // 1111 → −0, 1000 → −7
    case "twos_complement":
      return code - (1 << bits);                        // 1111 → −1, 1000 → −8
  }
}

function ringOf(bits: number, scheme: NumberScheme): NumberRingDiagram {
  const total = 1 << bits;
  return {
    bits,
    entries: Array.from({ length: total }, (_, code) => ({
      code: code.toString(2).padStart(bits, "0"),
      value: decodeScheme(code, bits, scheme),
    })),
  };
}

function rangeText(bits: number, scheme: NumberScheme): string {
  const maxPos = (1 << (bits - 1)) - 1;
  if (scheme === "twos_complement") return `−${maxPos + 1} ~ +${maxPos} (0은 하나)`;
  return `−${maxPos} ~ +${maxPos} (0이 두 개: +0, −0)`;
}

function reasonText(bits: number, scheme: NumberScheme): string {
  const allOnes = "1".repeat(bits);
  const signOnly = `1${"0".repeat(bits - 1)}`;
  const maxPos = (1 << (bits - 1)) - 1;
  switch (scheme) {
    case "sign_magnitude":
      return `${signOnly}이 −0이고 1xxx가 −(xxx)로 대응한다(부호 비트 + 크기).`;
    case "ones_complement":
      return `${allOnes}이 −0, ${signOnly}이 −${maxPos}이다(음수는 각 비트를 반전한 값).`;
    case "twos_complement":
      return `${allOnes}이 −1, ${signOnly}이 −${maxPos + 1}이다(0이 하나뿐이고 음수가 하나 더 많다).`;
  }
}

export const SCHEME_LABEL_OF = SCHEME_LABEL;

/**
 * ★ 변형유형 = **보수를 이용한 2진수 뺄셈** (사용자 지정 2026-07-30).
 *   A − B 를 "−B의 보수 표현을 더하는" 방식으로 계산한다.
 *    · 2의 보수: A + (2ⁿ − B), 최상위 자리올림은 **버린다**.
 *    · 1의 보수: A + (2ⁿ−1 − B), 자리올림이 생기면 **끝자리에 다시 더한다**(순환 자리올림).
 */
export function generateBinarySubtraction(args: { seed?: number }): SubtractionGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 3; i++) rand();
  const bits = pick([4, 5], rand);
  const scheme: NumberScheme = pick(["twos_complement", "ones_complement"], rand);
  const maxPos = (1 << (bits - 1)) - 1;

  // ★ 사용자 지정(2026-07-30): "7−8처럼 **더 큰 값을 빼는**" 경우 — 결과가 **음수**가 되게 한다.
  //   이 경우 자리올림이 나지 않고 합이 보수 형태로 남아, 보수 해석 단계가 실제로 필요해진다
  //   (양수 결과는 자리올림만 버리면 끝이라 학습 포인트가 약하다).
  let a = 0, b = 0, result = 0;
  for (let tries = 0; tries < 300; tries++) {
    a = 1 + Math.floor(rand() * (maxPos - 1));        // 피감수
    b = a + 1 + Math.floor(rand() * (maxPos - a));    // 감수 > 피감수
    result = a - b;
    const lowLimit = scheme === "twos_complement" ? -(maxPos + 1) : -maxPos;
    if (b <= maxPos && result < 0 && result >= lowLimit) break;
  }

  const mask = (1 << bits) - 1;
  const negBVal = scheme === "twos_complement" ? ((1 << bits) - b) & mask : (~b) & mask;
  const rawSum = a + negBVal;
  const carryOut = rawSum > mask;
  let sum = rawSum & mask;
  if (scheme === "ones_complement" && carryOut) sum = (sum + 1) & mask;  // 순환 자리올림

  const bin = (v: number) => (v & mask).toString(2).padStart(bits, "0");

  return {
    kind: "subtraction",
    values: { bits, scheme, a, b },
    answer: {
      negB: bin(negBVal),
      sumBin: bin(sum),
      carryOut,
      result,
      aBin: bin(a),
      bBin: bin(b),
    },
    diagram: ringOf(bits, scheme),
  };
}

/**
 * 유사 = 원본 구조(서로 다른 두 방식 비교). 원본 조합(2의 보수 + 1의 보수)은 제외한다.
 * ※ 변형은 `generateBinarySubtraction`(2진수 뺄셈)이 담당한다.
 */
export function generateNumberRepresentationRing(args: { seed?: number; mode: GenerationMode }): NumberRingGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 3; i++) rand();
  const bits = 4;
  // 서로 다른 두 방식 조합 — 원본(4비트 · 2의 보수 → 1의 보수)은 생성 풀에서 제외.
  const PAIRS: Array<[NumberScheme, NumberScheme]> = [
    ["sign_magnitude", "twos_complement"],
    ["ones_complement", "sign_magnitude"],
    ["twos_complement", "sign_magnitude"],
    ["sign_magnitude", "ones_complement"],
  ];
  const [schemeA, schemeB] = pick(PAIRS, rand);

  return {
    values: { bits, schemeA, schemeB },
    answer: {
      labelA: SCHEME_LABEL[schemeA],
      labelB: SCHEME_LABEL[schemeB],
      reasonA: reasonText(bits, schemeA),
      reasonB: reasonText(bits, schemeB),
      rangeA: rangeText(bits, schemeA),
      rangeB: rangeText(bits, schemeB),
    },
    diagramA: ringOf(bits, schemeA),
    diagramB: ringOf(bits, schemeB),
  };
}
