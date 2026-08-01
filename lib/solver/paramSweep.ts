/**
 * 파라미터가 들어간 회로의 범용 해석 — universal 경로 확장.
 *
 *  임용 문제에는 소자값이 기호(예: a[Ω]·a[V]·2a[Ω])로 주어지고
 *    · "a가 포함된 식"으로 응답을 구하고
 *    · 그 응답(보통 전력)이 **최대가 되는 a**를 구하는
 *  형식이 흔하다. MNA는 수치 솔버라 기호를 직접 못 다루지만, 선형 회로에서는
 *
 *    (1) a를 훑으며 반복해 풀면 최대점을 정확히 찾을 수 있고,
 *    (2) 응답이 a의 **유리함수**임이 보장되므로 표본 몇 점으로 계수를 정확히 복원할 수 있다.
 *
 *  이 모듈은 그 두 가지를 유형과 무관한 **일반 규칙**으로 제공한다.
 *  회로를 어떻게 파라미터화할지는 호출자가 빌더 함수로 넘긴다 — 새 타입을 만들지 않아
 *  기존 SolverNetwork·MNA 코드에 영향이 없다.
 */
import { solveMNA, type SolverNetwork, type SolverResult } from "@/lib/solver/mna";

/** 파라미터 a → 그 값에서의 회로. */
export type ParamNetworkFn = (a: number) => SolverNetwork;
/** 풀린 회로에서 관심 있는 스칼라(전압·전류·전력 등)를 뽑아내는 함수. */
export type ParamMetricFn = (res: SolverResult, net: SolverNetwork, a: number) => number;

/** 주어진 a에서 회로를 풀고 지표를 계산 (풀이 실패 시 NaN). */
export function evaluateAt(build: ParamNetworkFn, metric: ParamMetricFn, a: number): number {
  try {
    const net = build(a);
    return metric(solveMNA(net), net, a);
  } catch {
    return NaN;
  }
}

/** 저항 전력 지표 — P = V²/R. 파라미터 회로에서 가장 흔한 목표. */
export function resistorPowerMetric(resistorId: string): ParamMetricFn {
  return (res, net) => {
    const r = net.resistors.find((x) => x.id === resistorId);
    if (!r) return NaN;
    const va = res.nodeVoltages[r.a] ?? 0;
    const vb = res.nodeVoltages[r.b] ?? 0;
    return ((va - vb) * (va - vb)) / r.R;
  };
}

/** 노드 전압 지표. */
export function nodeVoltageMetric(nodeId: string): ParamMetricFn {
  return (res) => res.nodeVoltages[nodeId] ?? NaN;
}

export type MaximizeResult = {
  /** 지표를 최대로 만드는 파라미터 값 */
  aStar: number;
  /** 그때의 지표 값 */
  valueStar: number;
  /** 최대점이 탐색 구간 끝에 붙었는가 (참이면 진짜 극대가 아닐 수 있다) */
  atBoundary: boolean;
};

/**
 * 지표가 최대가 되는 파라미터를 찾는다.
 *  1차: 구간을 고르게 훑어 최대 표본을 찾고
 *  2차: 그 이웃 구간에서 황금분할로 조인다.
 *
 * inverseR의 sweep 방식과 같은 결이며, 지표가 구간에서 단봉(unimodal)일 때 정확하다.
 * 끝점에 붙으면 atBoundary=true로 알려 호출자가 걸러낼 수 있게 한다(극대가 없는 경우).
 */
export function maximizeOverParam(
  build: ParamNetworkFn,
  metric: ParamMetricFn,
  opts: { min: number; max: number; coarse?: number } = { min: 0.01, max: 100 },
): MaximizeResult {
  const { min, max } = opts;
  const coarse = opts.coarse ?? 400;
  let bi = -1, bv = -Infinity, ba = min;
  for (let i = 0; i <= coarse; i++) {
    const a = min + ((max - min) * i) / coarse;
    const v = evaluateAt(build, metric, a);
    if (Number.isFinite(v) && v > bv) { bv = v; ba = a; bi = i; }
  }
  const atBoundary = bi <= 0 || bi >= coarse;

  // 황금분할로 이웃 구간을 좁힌다.
  const step = (max - min) / coarse;
  let lo = Math.max(min, ba - step), hi = Math.min(max, ba + step);
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = hi - phi * (hi - lo), d = lo + phi * (hi - lo);
  let fc = evaluateAt(build, metric, c), fd = evaluateAt(build, metric, d);
  for (let i = 0; i < 100 && hi - lo > 1e-12; i++) {
    if (!(fc < fd)) { hi = d; d = c; fd = fc; c = hi - phi * (hi - lo); fc = evaluateAt(build, metric, c); }
    else { lo = c; c = d; fc = fd; d = lo + phi * (hi - lo); fd = evaluateAt(build, metric, d); }
  }
  const aStar = (lo + hi) / 2;
  const valueStar = evaluateAt(build, metric, aStar);
  return valueStar >= bv
    ? { aStar, valueStar, atBoundary }
    : { aStar: ba, valueStar: bv, atBoundary };
}

export type SolveTargetResult = {
  /** 지표가 목표값이 되는 파라미터 값 */
  aStar: number;
  /** 그 지점에서 실제로 계산된 지표 (목표와의 오차 확인용) */
  value: number;
  /** 구간 안에서 찾은 해의 개수 — 2 이상이면 문제가 유일하게 결정되지 않는다 */
  rootCount: number;
};

/**
 * 지표가 **주어진 목표값**이 되는 파라미터를 찾는다 (최대화가 아니라 역산).
 *
 * "R_L에 흐르는 전류가 1A가 되도록 하는 a" 같은 형식에 쓴다. 구간을 훑어 (지표 − 목표)의
 * 부호가 바뀌는 곳을 모두 찾고, 각각을 이분법으로 조인다.
 * ★ 해가 2개 이상이면 문제가 유일하게 결정되지 않으므로 호출자가 rootCount로 걸러낼 수 있다.
 *   (해가 없으면 null — 억지로 근사값을 내지 않는다.)
 */
export function solveParamForTarget(
  build: ParamNetworkFn,
  metric: ParamMetricFn,
  target: number,
  opts: { min?: number; max?: number; coarse?: number; tol?: number } = {},
): SolveTargetResult | null {
  const min = opts.min ?? 0.05;
  const max = opts.max ?? 200;
  const coarse = opts.coarse ?? 2000;
  const tol = opts.tol ?? 1e-9;

  const f = (a: number) => {
    const v = evaluateAt(build, metric, a);
    return Number.isFinite(v) ? v - target : NaN;
  };

  const roots: number[] = [];
  let prevA = min, prevF = f(min);
  if (Number.isFinite(prevF) && Math.abs(prevF) < tol) roots.push(prevA);
  for (let i = 1; i <= coarse; i++) {
    const a = min + ((max - min) * i) / coarse;
    const fa = f(a);
    if (!Number.isFinite(fa)) { prevA = a; prevF = fa; continue; }
    if (Number.isFinite(prevF) && prevF !== 0 && (prevF < 0) !== (fa < 0)) {
      // 이분법으로 조인다.
      let lo = prevA, hi = a, flo = prevF;
      for (let k = 0; k < 200 && hi - lo > 1e-13; k++) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (!Number.isFinite(fm)) break;
        if ((flo < 0) !== (fm < 0)) hi = mid; else { lo = mid; flo = fm; }
      }
      const r = (lo + hi) / 2;
      // 같은 해를 중복으로 담지 않는다.
      if (!roots.some((x) => Math.abs(x - r) < 1e-6)) roots.push(r);
    } else if (Math.abs(fa) < tol && !roots.some((x) => Math.abs(x - a) < 1e-6)) {
      roots.push(a);
    }
    prevA = a; prevF = fa;
  }

  if (roots.length === 0) return null;
  const aStar = roots[0];
  return { aStar, value: evaluateAt(build, metric, aStar), rootCount: roots.length };
}

/** 저항에 흐르는 전류(크기) 지표 — |I| = |V_R| / R. */
export function resistorCurrentMetric(resistorId: string): ParamMetricFn {
  return (res, net) => {
    const r = net.resistors.find((x) => x.id === resistorId);
    if (!r) return NaN;
    const va = res.nodeVoltages[r.a] ?? 0;
    const vb = res.nodeVoltages[r.b] ?? 0;
    return Math.abs(va - vb) / r.R;
  };
}

export type RationalFit = {
  /** 분자 계수 (낮은 차수부터): num[0] + num[1]·a + ... */
  num: number[];
  /** 분모 계수 (낮은 차수부터, 최고차 계수는 1로 정규화) */
  den: number[];
  /** 표본 대비 최대 상대 오차 — 0에 가까울수록 정확한 복원 */
  maxRelErr: number;
};

/**
 * 지표를 파라미터 a의 **유리함수**로 복원한다.
 *
 * 선형 회로에서 소자값이 a의 다항식이면 임의의 노드 전압·전류는 a의 유리함수다.
 * 차수를 (0,0)부터 조금씩 올리며 표본에 맞는 **가장 낮은 차수**를 채택한다 —
 * 낮은 차수부터 시도하므로 과적합(불필요하게 큰 분수식)이 생기지 않는다.
 *
 * 반환된 계수는 정확한 값의 부동소수 근사이므로, 표기할 때 rationalizeFit으로 정리한다.
 */
export function fitRationalInParam(
  build: ParamNetworkFn,
  metric: ParamMetricFn,
  opts: { sampleMin?: number; sampleMax?: number; maxDegree?: number; tol?: number } = {},
): RationalFit | null {
  const sampleMin = opts.sampleMin ?? 0.7;
  const sampleMax = opts.sampleMax ?? 9.3;
  const maxDegree = opts.maxDegree ?? 3;
  const tol = opts.tol ?? 1e-7;

  // 표본은 넉넉히 — 최소 필요 개수의 3배 정도를 고르게 뽑는다.
  const N = 40;
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = sampleMin + ((sampleMax - sampleMin) * i) / (N - 1);
    const y = evaluateAt(build, metric, a);
    if (!Number.isFinite(y)) return null;
    xs.push(a); ys.push(y);
  }

  for (let deg = 0; deg <= maxDegree; deg++) {
    for (let dd = 0; dd <= deg; dd++) {
      const nd = deg; // 분자 차수
      const fit = solveRational(xs, ys, nd, dd);
      if (!fit) continue;
      const err = maxRelError(xs, ys, fit);
      if (err < tol) return { ...fit, maxRelErr: err };
    }
  }
  return null;
}

/**
 * 표본에 대해 y·D(a) = N(a) 를 세워 계수를 푼다 (분모 최고차 계수 = 1로 고정).
 *  미지수: num 0..nd (nd+1개) + den 0..dd-1 (dd개)
 *  식:     Σ p_i a^i − y·Σ_{j<dd} q_j a^j = y·a^dd
 */
function solveRational(xs: number[], ys: number[], nd: number, dd: number): { num: number[]; den: number[] } | null {
  const cols = nd + 1 + dd;
  if (cols === 0) return null;
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const row: number[] = [];
    for (let p = 0; p <= nd; p++) row.push(Math.pow(xs[i], p));
    for (let q = 0; q < dd; q++) row.push(-ys[i] * Math.pow(xs[i], q));
    A.push(row);
    b.push(ys[i] * Math.pow(xs[i], dd));
  }
  const sol = leastSquares(A, b, cols);
  if (!sol) return null;
  const num = sol.slice(0, nd + 1);
  const den = [...sol.slice(nd + 1), 1]; // 최고차 계수 1
  return { num, den };
}

/** 정규방정식 AᵀA x = Aᵀb 를 가우스 소거로 푼다. */
function leastSquares(A: number[][], b: number[], cols: number): number[] | null {
  const M: number[][] = Array.from({ length: cols }, () => new Array(cols + 1).fill(0));
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      let s = 0;
      for (let i = 0; i < A.length; i++) s += A[i][r] * A[i][c];
      M[r][c] = s;
    }
    let s = 0;
    for (let i = 0; i < A.length; i++) s += A[i][r] * b[i];
    M[r][cols] = s;
  }
  for (let i = 0; i < cols; i++) {
    let piv = i;
    for (let r = i + 1; r < cols; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    if (Math.abs(M[piv][i]) < 1e-14) return null;
    [M[i], M[piv]] = [M[piv], M[i]];
    for (let r = 0; r < cols; r++) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      for (let c = i; c <= cols; c++) M[r][c] -= f * M[i][c];
    }
  }
  // 가우스-조던으로 대각만 남았으므로 x_i = M[i][cols] / M[i][i]
  return M.map((row, i) => row[cols] / row[i]);
}

const polyAt = (co: number[], x: number) => co.reduce((s, c, i) => s + c * Math.pow(x, i), 0);

function maxRelError(xs: number[], ys: number[], fit: { num: number[]; den: number[] }): number {
  let worst = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = polyAt(fit.den, xs[i]);
    if (Math.abs(d) < 1e-12) return Infinity;
    const pred = polyAt(fit.num, xs[i]) / d;
    const scale = Math.max(1e-9, Math.abs(ys[i]));
    worst = Math.max(worst, Math.abs(pred - ys[i]) / scale);
  }
  return worst;
}

/** 복원된 계수를 깔끔한 유리수로 정리 (표기용). 정리에 실패하면 원본을 그대로 둔다. */
export function rationalizeFit(fit: RationalFit, maxDen = 400): RationalFit {
  const snap = (v: number) => {
    const r = Math.round(v);
    if (Math.abs(v - r) < 1e-7 * Math.max(1, Math.abs(v))) return r;
    for (let d = 2; d <= maxDen; d++) {
      const n = Math.round(v * d);
      if (Math.abs(v - n / d) < 1e-9 * Math.max(1, Math.abs(v))) return n / d;
    }
    return v;
  };
  return { num: fit.num.map(snap), den: fit.den.map(snap), maxRelErr: fit.maxRelErr };
}
