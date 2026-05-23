/**
 * AcQueryResult 유효성 + niceness 평가 (DC validate와 유사).
 */

import type { AcQueryResult } from "./universalAc";

export type AcValidationVerdict = {
  valid: boolean;
  reasons: string[];
  niceness: number;
};

export function validateAcResult(results: AcQueryResult[]): AcValidationVerdict {
  const reasons: string[] = [];
  for (const r of results) {
    if (!Number.isFinite(r.value)) {
      reasons.push(`${r.query.label}: NaN/Inf`);
      continue;
    }
    if (r.unit === "V" && Math.abs(r.value) > 1000) reasons.push(`${r.query.label}: |V| 과대`);
    if (r.unit === "A" && Math.abs(r.value) > 100) reasons.push(`${r.query.label}: |I| 과대`);
    if (r.unit === "W" && (r.value < -0.001 || r.value > 10000)) reasons.push(`${r.query.label}: P 비정상`);
    if (r.unit === "Ω" && (r.value < 0.5 || r.value > 5000)) reasons.push(`${r.query.label}: R 범위 밖`);
    if (r.unit === "F") {
      // C 합리적 범위 — 0.1pF ~ 1F
      if (r.value < 1e-13 || r.value > 1) reasons.push(`${r.query.label}: C=${r.value} 범위 밖`);
      if (r.meta?.converged === false) reasons.push(`${r.query.label}: 수렴 실패`);
    }
    if (r.unit === "rad/s" && (r.value < 1 || r.value > 1e9)) reasons.push(`${r.query.label}: ω 범위 밖`);
  }
  return { valid: reasons.length === 0, reasons, niceness: scoreNiceness(results) };
}

function scoreNiceness(results: AcQueryResult[]): number {
  let s = 0;
  for (const r of results) {
    if (!Number.isFinite(r.value)) { s -= 100; continue; }
    const abs = Math.abs(r.value);
    if (abs < 100) s += 0.5;
    if (Math.abs(r.value - Math.round(r.value)) < 0.05) s += 0.5;
  }
  return s;
}
