/**
 * Universal DC query solver — mna.ts wrapper.
 *
 *  입력: SolverNetwork + DcQuery[]
 *  출력: 각 query에 대한 값
 *
 *  지원 query:
 *    - nodeVoltage: 특정 노드의 V (ground 기준)
 *    - branchCurrent: 특정 V 소스의 전류
 *    - resistorPower: 특정 R의 소비전력
 *    - totalPower: 모든 R 소비전력의 합 (= 모든 source 공급전력)
 *    - inverseR: 특정 R 값을 조정해서 target node가 target value가 되는 R
 *
 *  archetype별 hardcode 솔버를 대체 — 임의 V/I/R 회로의 다단계 query를 처리.
 */

import { solveMNA, type SolverNetwork, type SolverResult } from "./mna";

export type DcQuery =
  | { kind: "nodeVoltage"; node: string; label: string }
  | { kind: "branchCurrent"; vsourceId: string; label: string }
  | { kind: "resistorPower"; resistorId: string; label: string }
  | { kind: "totalPower"; label: string }
  | {
      kind: "inverseR";
      resistorId: string;
      targetNode: string;
      targetValue: number;
      rRange?: [number, number];
      label: string;
    };

export type DcQueryResult = {
  query: DcQuery;
  value: number;
  unit: "V" | "A" | "W" | "Ω";
  /** 보조 정보 — inverseR에 대해서는 sweep 결과·수렴 여부 */
  meta?: Record<string, unknown>;
};

/**
 * 회로를 한 번 풀고, 주어진 query 목록에 대한 값을 산출한다.
 * inverseR query는 별도 sweep 수행.
 */
export function solveDcQueries(net: SolverNetwork, queries: DcQuery[]): DcQueryResult[] {
  const sol = solveMNA(net);
  return queries.map((q) => evaluateQuery(net, sol, q));
}

function evaluateQuery(
  net: SolverNetwork,
  sol: SolverResult,
  q: DcQuery,
): DcQueryResult {
  switch (q.kind) {
    case "nodeVoltage": {
      const v = sol.nodeVoltages[q.node] ?? 0;
      return { query: q, value: round(v, 4), unit: "V" };
    }
    case "branchCurrent": {
      const i = sol.vsourceCurrents[q.vsourceId] ?? 0;
      return { query: q, value: round(i, 4), unit: "A" };
    }
    case "resistorPower": {
      const r = net.resistors.find((x) => x.id === q.resistorId);
      if (!r) return { query: q, value: 0, unit: "W" };
      const p = resistorPower(sol, r);
      return { query: q, value: round(p, 4), unit: "W" };
    }
    case "totalPower": {
      let p = 0;
      for (const r of net.resistors) p += resistorPower(sol, r);
      return { query: q, value: round(p, 4), unit: "W" };
    }
    case "inverseR": {
      return solveInverseR(net, q);
    }
  }
}

function resistorPower(
  sol: SolverResult,
  r: { a: string; b: string; R: number },
): number {
  const va = sol.nodeVoltages[r.a] ?? 0;
  const vb = sol.nodeVoltages[r.b] ?? 0;
  const drop = va - vb;
  return (drop * drop) / r.R;
}

/**
 * R을 sweep해서 target node voltage가 target value가 되는 R 도출.
 *  - 1차: 100점 sweep으로 (R, V_target) 쌍 추출
 *  - 2차: target에 가장 가까운 두 점에서 선형 보간
 *
 *  LIMITATION: V_target(R) 함수가 monotonic하지 않으면 첫 해 반환.
 *              실제 임용 문제는 일반적으로 monotonic해서 충분.
 */
function solveInverseR(
  net: SolverNetwork,
  q: Extract<DcQuery, { kind: "inverseR" }>,
): DcQueryResult {
  const [rMin, rMax] = q.rRange ?? [0.1, 1000];
  const N = 200;
  // log-spaced sweep for better coverage of low/high R
  const samples: Array<{ R: number; V: number }> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const R = rMin * Math.pow(rMax / rMin, t);
    try {
      const newNet = perturbResistor(net, q.resistorId, R);
      const sol = solveMNA(newNet);
      const v = sol.nodeVoltages[q.targetNode] ?? 0;
      samples.push({ R, V: v });
    } catch {
      /* singular matrix at this R — skip */
    }
  }
  if (samples.length === 0) {
    return { query: q, value: NaN, unit: "Ω", meta: { converged: false, reason: "no samples" } };
  }
  // (1) target을 sample 구간에서 bracket하는 인접 쌍 찾기 (V(R)이 target을 가로지르는 곳)
  //   crossing이 있으면 정확한 해 → 두 점 사이 선형 보간
  let bracket: { lo: { R: number; V: number }; hi: { R: number; V: number } } | null = null;
  for (let i = 1; i < samples.length; i++) {
    const v0 = samples[i - 1].V - q.targetValue;
    const v1 = samples[i].V - q.targetValue;
    if (v0 * v1 <= 0 && Math.abs(samples[i].V - samples[i - 1].V) > 1e-9) {
      bracket = { lo: samples[i - 1], hi: samples[i] };
      break; // 첫 crossing 사용
    }
  }

  if (bracket) {
    // 선형 보간 (bracket 내부라 안전)
    const { lo, hi } = bracket;
    const ratio = (q.targetValue - lo.V) / (hi.V - lo.V);
    const R = lo.R + ratio * (hi.R - lo.R);
    return {
      query: q,
      value: round(R, 4),
      unit: "Ω",
      meta: { converged: true, residual: 0, bracketed: true },
    };
  }

  // (2) crossing 없음 — V(R)이 target에 닿지 않음. 가장 가까운 R 반환 + 수렴 실패 표시.
  let bestIdx = 0;
  let bestDiff = Math.abs(samples[0].V - q.targetValue);
  for (let i = 1; i < samples.length; i++) {
    const d = Math.abs(samples[i].V - q.targetValue);
    if (d < bestDiff) {
      bestDiff = d;
      bestIdx = i;
    }
  }
  // boundary 외 extrapolation 금지 — clamp to [rMin, rMax]
  const clampedR = Math.min(Math.max(samples[bestIdx].R, rMin), rMax);
  return {
    query: q,
    value: round(clampedR, 4),
    unit: "Ω",
    meta: {
      converged: false,
      residual: bestDiff,
      reason: "no crossing in [rMin, rMax] — topology가 target voltage에 도달 불가",
      sampledRange: [samples[0].V, samples[samples.length - 1].V],
    },
  };
}

function perturbResistor(net: SolverNetwork, resistorId: string, newR: number): SolverNetwork {
  return {
    ...net,
    resistors: net.resistors.map((r) =>
      r.id === resistorId ? { ...r, R: newR } : r,
    ),
  };
}

function round(x: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}
