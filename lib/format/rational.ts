/**
 * 유리수 정확 연산 — 생성기가 **반올림 없이** 값을 다루기 위한 최소 helper.
 *
 * ★ 왜 필요한가 (2026-08-04 실측): 생성기가 소수 3자리로 반올림해 넘기면 route의 전역 분수 변환기
 *   (CLAUDE.md 1-4-3)의 **근사 복원 단계**가 틀린 분수를 만든다 — 0.289(실제 81/280)를 9/31로 바꿨고
 *   그대로 사용자 화면까지 갔다. 정확한 유리수로 계산하고 `qTex`로 분수 문자열을 직접 쓰면
 *   변환기가 손댈 소수 자체가 남지 않는다.
 */

export type Q = { n: number; d: number };

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

/** 기약분수 생성. 분모 부호는 분자로 올린다. */
export function q(n: number, d = 1): Q {
  if (d === 0) throw new Error("q: 0으로 나눔");
  const s = d < 0 ? -1 : 1;
  const g = gcd(n, d);
  return { n: (s * n) / g, d: (s * d) / g };
}

export const qAdd = (a: Q, b: Q): Q => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const qSub = (a: Q, b: Q): Q => q(a.n * b.d - b.n * a.d, a.d * b.d);
export const qMul = (a: Q, b: Q): Q => q(a.n * b.n, a.d * b.d);
export const qDiv = (a: Q, b: Q): Q => q(a.n * b.d, a.d * b.n);
export const qNum = (a: Q): number => a.n / a.d;
export const qIsInt = (a: Q): boolean => a.d === 1;

/** 표기 — 정수면 그대로, 아니면 `n/d`. **소수를 쓰지 않는다**(전역 변환기가 손대지 못하게). */
export function qTex(a: Q): string {
  return a.d === 1 ? String(a.n) : `${a.n}/${a.d}`;
}
