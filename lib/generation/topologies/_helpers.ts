/**
 * topology generator 공통 helper — 값 picking, 시드 RNG, 라운딩.
 *
 * 각 topology(thevenin/norton/dcMesh/…)에서 임용 문제용 "예쁜" 소자값을
 * 일관되게 뽑기 위해 한 곳에 모아둠.
 */

/** 임용 문제 자주 등장하는 정수 저항값 (Ω) */
export const NICE_RESISTORS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

/** 정수 V 값 */
export const NICE_VOLTAGES = [3, 5, 6, 9, 10, 12, 15, 18, 20, 24];

/** I 값 (A 단위, 1mA~5A 범위) */
export const NICE_CURRENTS = [0.5, 1, 1.5, 2, 3, 5];

/** μF 단위 C 값 (RC time constant ms 단위로 만들기) */
export const NICE_CAPACITANCES_UF = [1, 2.2, 4.7, 10, 22, 47, 100];

/** mH 단위 L 값 (RL time constant ms 단위) */
export const NICE_INDUCTANCES_MH = [1, 2.2, 4.7, 10, 22, 47, 100];

export function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/**
 * 시드 기반 deterministic 랜덤 (xorshift32).
 * seed 미지정 시 Math.random.
 */
export function makeRand(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17; s >>>= 0;
    s ^= s << 5;  s >>>= 0;
    return s / 0x100000000;
  };
}

/** 소수 3째 자리까지 round */
export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
