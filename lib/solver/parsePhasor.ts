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

/**
 * 수식 스칼라 파싱 — 정수·소수·분수·√(루트) 표기를 숫자로 환산.
 *
 *   "8" · "2.5" · "3/2" · "\sqrt{8}" · "√8" · "sqrt(8)" · "2\sqrt{2}" · "2√2" · "-√3/2"
 *
 *   임용 페이저는 √8∠45°(=2+j2) 같은 무리수 크기가 흔하다. polar/cartesian/임피던스
 *   파서가 크기·계수 토큰에 공통으로 사용해 LaTeX·√ 표기를 일관되게 흡수한다.
 *   매치 실패 시 null.
 */
export function parseScalar(raw: string | number | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  let sign = 1;
  if (/^[−-]/.test(s)) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }
  // 분수 a/b — 분자·분모 각각 √ 항으로 재귀 환산
  const slash = s.indexOf("/");
  if (slash > 0) {
    const num = evalSqrtTerm(s.slice(0, slash).trim());
    const den = evalSqrtTerm(s.slice(slash + 1).trim());
    if (num !== null && den !== null && den !== 0) return (sign * num) / den;
  }
  const v = evalSqrtTerm(s);
  return v === null ? null : sign * v;
}

/** "2√2" · "√8" · "\sqrt{8}" · "sqrt(8)" · "2.5" → 숫자. 매치 실패 시 null. */
function evalSqrtTerm(input: string): number | null {
  const s = input
    .replace(/\\sqrt\s*\{([^}]*)\}/gi, "√($1)")
    .replace(/sqrt\s*\(([^)]*)\)/gi, "√($1)")
    .replace(/√\s*\{([^}]*)\}/g, "√($1)")
    .replace(/\s+/g, "");
  // 계수?√(피근수)  — "2√(8)", "√(8)", "2√8", "√8"
  const m = s.match(/^(\d+(?:\.\d+)?)?√\(?(\d+(?:\.\d+)?)\)?$/);
  if (m) {
    const coef = m[1] ? parseFloat(m[1]) : 1;
    return coef * Math.sqrt(parseFloat(m[2]));
  }
  const plain = s.match(/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/);
  if (plain) return parseFloat(s);
  return null;
}

export function parsePhasor(raw: string | number | undefined): PhasorParse | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return { phasor: { re: raw, im: 0 } };
  const s = raw.trim();
  if (!s) return null;

  // 1) Polar: "5∠30°V", "10∠-45°A", "√8∠45°V", "2√2∠-45°A" (크기에 √·분수 허용)
  const polarMatch = s.match(/^([^∠]+?)\s*∠\s*([^∠VvAa]+?)\s*°?\s*(V|v|A|a)?$/);
  if (polarMatch) {
    const mag = parseScalar(polarMatch[1]);
    const phaseDeg = parseScalar(polarMatch[2]);
    if (mag !== null && phaseDeg !== null) {
      const phaseRad = (phaseDeg * Math.PI) / 180;
      const suffix = polarMatch[3]?.toUpperCase();
      return {
        phasor: { re: mag * Math.cos(phaseRad), im: mag * Math.sin(phaseRad) },
        suffix: suffix === "V" || suffix === "A" ? suffix : undefined,
      };
    }
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

  // 4) 실수만 (단위 포함, √·분수 허용): "10V", "5A", "√8V", "3/2A"
  const realMatch = s.match(/^(.+?)\s*(V|v|A|a)?$/);
  if (realMatch) {
    const re = parseScalar(realMatch[1]);
    if (re !== null) {
      const suffix = realMatch[2]?.toUpperCase();
      return {
        phasor: { re, im: 0 },
        suffix: suffix === "V" || suffix === "A" ? suffix : undefined,
      };
    }
  }

  return null;
}
