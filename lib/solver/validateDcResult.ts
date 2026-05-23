/**
 * DcQueryResult 유효성 + "niceness" 점수 평가.
 *
 *  유효성(rejection sampling 통과 기준):
 *    - 모든 값 finite (NaN / Inf 금지)
 *    - 노드전압 |V| ≤ 200V (임용 회로 일반 범위)
 *    - 전류 |I| ≤ 50A
 *    - 전력 P ≥ 0 AND P ≤ 5000W
 *    - inverseR: converged=true AND R ∈ [0.5, 5000] Ω (사람이 쓸 수 있는 범위)
 *
 *  niceness 점수(같은 valid 결과들 중에서 선택용, 높을수록 nice):
 *    - 정수에 가까울수록 가산 (소수점 후 자릿수 적을수록 좋음)
 *    - 자릿수가 작을수록 가산 (0.5W·5W > 5723.4W)
 *    - 음수 voltage가 적으면 가산 (임용 문제는 보통 양수 노드전압 위주)
 *
 *  최종 선택: 첫 valid 결과 채택. 만약 N attempts 모두 invalid면 가장 valid에 근접한 결과 fallback.
 */

import type { DcQueryResult } from "./universalDc";

export type ValidationVerdict = {
  valid: boolean;
  reasons: string[];
  niceness: number;
};

export function validateDcResult(results: DcQueryResult[]): ValidationVerdict {
  const reasons: string[] = [];

  for (const r of results) {
    if (!Number.isFinite(r.value)) {
      reasons.push(`${r.query.label}: NaN/Inf`);
      continue;
    }
    if (r.unit === "V") {
      if (Math.abs(r.value) > 200) reasons.push(`${r.query.label}: |V|=${Math.abs(r.value)} > 200`);
    } else if (r.unit === "A") {
      if (Math.abs(r.value) > 50) reasons.push(`${r.query.label}: |I|=${Math.abs(r.value)} > 50`);
    } else if (r.unit === "W") {
      if (r.value < -0.001) reasons.push(`${r.query.label}: P=${r.value} < 0`);
      if (r.value > 5000) reasons.push(`${r.query.label}: P=${r.value} > 5000`);
    } else if (r.unit === "Ω") {
      const converged = r.meta?.converged === true;
      if (!converged) reasons.push(`${r.query.label}: inverseR 수렴 실패`);
      if (r.value < 0.5 || r.value > 5000) reasons.push(`${r.query.label}: R=${r.value} 범위 밖 [0.5, 5000]`);
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
    niceness: scoreNiceness(results),
  };
}

/**
 * 결과의 niceness — 높을수록 nice. 같은 valid 결과 풀에서 best 선택 시 사용.
 */
function scoreNiceness(results: DcQueryResult[]): number {
  let score = 0;
  for (const r of results) {
    score += scoreValueNiceness(r.value, r.unit);
  }
  return score;
}

function scoreValueNiceness(v: number, unit: string): number {
  if (!Number.isFinite(v)) return -1000;
  const abs = Math.abs(v);
  // 정수에 가까울수록 +
  const intResidual = Math.abs(v - Math.round(v));
  let s = -intResidual * 5;
  // 한 자릿수면 +1, 두 자릿수면 +0.5
  if (abs < 10) s += 1;
  else if (abs < 100) s += 0.5;
  else if (abs > 1000) s -= 1;
  // 음수 voltage는 약간 감점
  if (unit === "V" && v < 0) s -= 0.5;
  return s;
}
