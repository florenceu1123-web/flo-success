/**
 * Polar/Cartesian phasor 문자열 파싱.
 *
 *   지원 표기:
 *     "5∠30°V"  → magnitude 5, phase 30° → Complex {re: 4.33, im: 2.5}
 *     "10∠-45A" → magnitude 10, phase -45° → Complex
 *     "3+j2"·"3+j2V"·"3-j4A" → Cartesian
 *     "5V"      → real (re=5, im=0)
 *     "5sin(ωt)V"·"5cos(ωt)V" → amplitude 5 phase 0 (peak)
 *
 *   결과: { phasor: Complex, suffix?: "V"|"A" }
 */

import type { Complex } from "./complex";

export type PhasorParse = {
  phasor: Complex;
  suffix?: "V" | "A";
};

export function parsePhasor(raw: string | number | undefined): PhasorParse | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return { phasor: { re: raw, im: 0 } };
  const s = raw.trim();
  if (!s) return null;

  // 1) Polar: "5∠30°V", "10∠-45°A", "5∠π/4V" (단순 numeric만 — π는 미지원)
  const polarMatch = s.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*∠\s*(-?\d+(?:\.\d+)?)\s*°?\s*(V|v|A|a)?$/);
  if (polarMatch) {
    const mag = parseFloat(polarMatch[1]);
    const phaseDeg = parseFloat(polarMatch[2]);
    const phaseRad = (phaseDeg * Math.PI) / 180;
    const suffix = polarMatch[3]?.toUpperCase();
    return {
      phasor: { re: mag * Math.cos(phaseRad), im: mag * Math.sin(phaseRad) },
      suffix: suffix === "V" || suffix === "A" ? suffix : undefined,
    };
  }

  // 2) Cartesian: "3+j2V", "3-j4A", "-1.5+j0.5V"
  const cartMatch = s.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*([+-])\s*j\s*(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(V|v|A|a)?$/);
  if (cartMatch) {
    const re = parseFloat(cartMatch[1]);
    const sign = cartMatch[2] === "+" ? 1 : -1;
    const im = sign * parseFloat(cartMatch[3]);
    const suffix = cartMatch[4]?.toUpperCase();
    return {
      phasor: { re, im },
      suffix: suffix === "V" || suffix === "A" ? suffix : undefined,
    };
  }

  // 3) 단순 sin/cos 표기 — peak amplitude만 추출 (phase 0 가정)
  //    "5sin(ωt)V"·"5cos(ω0t)V"·"5·sin(...)V" 등
  const trigMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*[·*]?\s*(?:sin|cos)\s*\(.*\)\s*(V|v|A|a)?$/i);
  if (trigMatch) {
    const peak = parseFloat(trigMatch[1]);
    const suffix = trigMatch[2]?.toUpperCase();
    return {
      phasor: { re: peak, im: 0 },
      suffix: suffix === "V" || suffix === "A" ? suffix : undefined,
    };
  }

  // 4) 실수만 (단위 포함): "10V", "5A"
  const realMatch = s.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(V|v|A|a)?$/);
  if (realMatch) {
    return {
      phasor: { re: parseFloat(realMatch[1]), im: 0 },
      suffix: realMatch[2]?.toUpperCase() === "V" || realMatch[2]?.toUpperCase() === "A" ? (realMatch[2]?.toUpperCase() as "V" | "A") : undefined,
    };
  }

  return null;
}
