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
 *  깔끔함(cleanliness) 등급 — 임용 문제 답은 정수가 원칙:
 *    - allInteger : 모든 답이 정수 (최우선 채택)
 *    - clean      : 모든 답이 정수 또는 0.5 단위 (차선)
 *    - 그 외      : messy (마지막 수단)
 *
 *  최종 선택(runUniversalDcPipeline): allInteger > clean > valid(niceness 최고) > invalid fallback.
 */

import type { DcQueryResult } from "./universalDc";

export type ValidationVerdict = {
  valid: boolean;
  reasons: string[];
  niceness: number;
  /** 모든 답이 정수 — 임용 문제로 가장 바람직. */
  allInteger: boolean;
  /** 모든 답이 정수 또는 0.5 단위 — 허용 가능. */
  clean: boolean;
  /** 모든 답이 소수 첫째 자리까지로 떨어짐 — 정수·0.5를 못 찾았을 때의 차선. */
  tenth: boolean;
  /** 지저분한(소수 첫째 자리로도 안 떨어지는) 답 라벨 — 로그·진단용. */
  messyLabels: string[];
};

/** 값의 "답으로서의 깔끔함" 등급. 단위 무관 — 정수 > 0.5 단위 > 소수 첫째 자리 > 그 외. */
export type Cleanliness = "integer" | "half" | "tenth" | "messy";

/**
 * 사람이 답으로 적기 좋은 값인지 판정.
 *
 *   · 허용 오차는 부동소수·MNA 수치 오차만 흡수할 만큼만(상대 1e-9). 느슨하게 잡으면
 *     123.0046 같은 값을 "정수"로 속여 표기하게 된다 — 정답을 왜곡하므로 금지.
 *   · 0에 가까운 값은 messy — 답이 0인 문제는 퇴화라 출제 가치가 없다.
 */
export function cleanlinessOf(v: number): Cleanliness {
  if (!Number.isFinite(v)) return "messy";
  const abs = Math.abs(v);
  if (abs < 1e-6) return "messy";
  const tol = Math.max(1e-9, abs * 1e-9);
  if (Math.abs(v - Math.round(v)) <= tol) return "integer";
  if (Math.abs(v - Math.round(v * 2) / 2) <= tol) return "half";
  if (Math.abs(v - Math.round(v * 10) / 10) <= tol) return "tenth";
  return "messy";
}

/**
 * 수치 오차 범위 안이면 깔끔한 값으로 스냅해서 표기.
 *   (이분법 수렴 오차로 생긴 4.002Ω → 4Ω. 오차 범위 밖이면 원값 그대로.)
 */
export function snapCleanValue(v: number): number {
  const grade = cleanlinessOf(v);
  if (grade === "integer") return Math.round(v);
  if (grade === "half") return Math.round(v * 2) / 2;
  return v;
}

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

  const grades = results.map((r) => ({ label: r.query.label, grade: cleanlinessOf(r.value) }));

  return {
    valid: reasons.length === 0,
    reasons,
    niceness: scoreNiceness(results),
    allInteger: grades.length > 0 && grades.every((g) => g.grade === "integer"),
    clean: grades.length > 0 && grades.every((g) => g.grade === "integer" || g.grade === "half"),
    tenth: grades.length > 0 && grades.every((g) => g.grade !== "messy"),
    messyLabels: grades.filter((g) => g.grade === "messy").map((g) => g.label),
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
