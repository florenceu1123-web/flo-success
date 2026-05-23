/**
 * Complex number 유틸 — AC phasor 해석에서 사용.
 *
 *  Cartesian 표기: { re, im }
 *  자주 쓰는 변환:
 *    polar(mag, phase_rad) → Complex
 *    magnitude(c) → 절댓값
 *    phase(c) → 위상 (rad)
 *    add/sub/mul/div/conj/neg
 */

export type Complex = { re: number; im: number };

export const ZERO: Complex = { re: 0, im: 0 };
export const ONE: Complex = { re: 1, im: 0 };
export const J: Complex = { re: 0, im: 1 };

export function cplx(re: number, im = 0): Complex {
  return { re, im };
}

export function polar(mag: number, phaseRad: number): Complex {
  return { re: mag * Math.cos(phaseRad), im: mag * Math.sin(phaseRad) };
}

export function magnitude(c: Complex): number {
  return Math.sqrt(c.re * c.re + c.im * c.im);
}

export function phase(c: Complex): number {
  return Math.atan2(c.im, c.re);
}

export function add(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function sub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function mul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

export function div(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return { re: NaN, im: NaN };
  return {
    re: (a.re * b.re + a.im * b.im) / d,
    im: (a.im * b.re - a.re * b.im) / d,
  };
}

export function neg(a: Complex): Complex {
  return { re: -a.re, im: -a.im };
}

export function conj(a: Complex): Complex {
  return { re: a.re, im: -a.im };
}

export function scale(a: Complex, k: number): Complex {
  return { re: a.re * k, im: a.im * k };
}

export function inv(a: Complex): Complex {
  return div(ONE, a);
}

/**
 * R/L/C → 복소 admittance Y(jω). 솔버는 admittance(=1/Z) 기반 노드 해석.
 *
 *   R: Y = 1/R
 *   L: Y = 1/(jωL) = -j/(ωL)
 *   C: Y = jωC
 */
export function admittanceR(R: number): Complex {
  return { re: 1 / R, im: 0 };
}

export function admittanceL(L: number, omega: number): Complex {
  // 1/(jωL) = -j/(ωL)
  return { re: 0, im: -1 / (omega * L) };
}

export function admittanceC(C: number, omega: number): Complex {
  // jωC
  return { re: 0, im: omega * C };
}

/**
 * 복소수 표시 — 디버그·문자열용. "3.00+j2.50" 또는 "5.00∠30°".
 */
export function fmtCartesian(c: Complex, digits = 3): string {
  const r = Number(c.re.toFixed(digits));
  const i = Number(Math.abs(c.im).toFixed(digits));
  const sign = c.im >= 0 ? "+" : "-";
  return `${r}${sign}j${i}`;
}

export function fmtPolar(c: Complex, digits = 3): string {
  const m = Number(magnitude(c).toFixed(digits));
  const phaseDeg = Number(((phase(c) * 180) / Math.PI).toFixed(2));
  return `${m}∠${phaseDeg}°`;
}
