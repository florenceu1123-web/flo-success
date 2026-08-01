/**
 * 파라미터 최대 전력 문제의 발문·정답 생성 — universal 경로 공용.
 *
 * 소자값이 기호 a의 상수배로 주어지고 "저항 R에서 소비되는 전력이 최대가 되는 a와 그때의
 * 전력 P_M을 구하라"는 형식(임용 6번 등)을 유형별 하드코드 없이 만든다.
 * 회로는 호출자가 넘긴 빌더로만 접근하므로 토폴로지에 의존하지 않는다.
 */
import {
  maximizeOverParam, fitRationalInParam, rationalizeFit, evaluateAt,
  resistorPowerMetric, nodeVoltageMetric,
  type ParamNetworkFn, type RationalFit,
} from "@/lib/solver/paramSweep";

/** 계수 배열(낮은 차수부터)을 LaTeX 다항식으로. 예: [8,1] → "a + 8" */
export function polyToLatex(co: number[], v: string): string {
  const terms: string[] = [];
  for (let i = co.length - 1; i >= 0; i--) {
    const c = co[i];
    if (Math.abs(c) < 1e-12) continue;
    const mag = Math.abs(c);
    const coefStr = mag === 1 && i > 0 ? "" : trimNum(mag);
    const varStr = i === 0 ? "" : i === 1 ? v : `${v}^{${i}}`;
    terms.push((terms.length === 0 ? (c < 0 ? "-" : "") : c < 0 ? " - " : " + ") + coefStr + varStr);
  }
  return terms.length ? terms.join("") : "0";
}

/** 2차식이 (v + r)^2 꼴이면 그 형태로 — (a+8)^2 가 a^2+16a+64 보다 읽기 쉽다. */
function denToLatex(den: number[], v: string): string {
  if (den.length === 3 && Math.abs(den[2] - 1) < 1e-9) {
    const r = den[1] / 2;
    // 반정수(5.5)도 완전제곱으로 인정 — (a+5.5)^2 가 a^2+11a+30.25 보다 읽기 쉽다.
    if (Math.abs(r * r - den[0]) < 1e-6 * Math.max(1, Math.abs(den[0]))) {
      if (Math.abs(r) < 1e-12) return `${v}^{2}`;
      return `(${v} ${r > 0 ? "+" : "-"} ${trimNum(Math.abs(r))})^{2}`;
    }
  }
  // \dfrac{}{} 안이라 괄호가 필요 없다 (제곱 꼴은 위에서 자체 괄호를 붙인다).
  return polyToLatex(den, v);
}

/**
 * 다항식이 [lo, hi]에서 실근을 갖는가 — 부호 변화로 판정.
 * 전력식의 분모가 이 구간에서 0이 되면 그 점은 극점이지 최대가 아니다.
 */
function hasRootInRange(co: number[], lo: number, hi: number): boolean {
  const N = 2000;
  let prev = co.reduce((s, c, i) => s + c * Math.pow(lo, i), 0);
  if (Math.abs(prev) < 1e-12) return true;
  for (let i = 1; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N;
    const v = co.reduce((s, c, k) => s + c * Math.pow(x, k), 0);
    if (Math.abs(v) < 1e-12) return true;
    if (prev < 0 !== v < 0) return true;
    prev = v;
  }
  return false;
}

function trimNum(x: number): string {
  const r = Math.round(x);
  if (Math.abs(x - r) < 1e-9) return String(r);
  return String(Number(x.toFixed(6)));
}

/** 유리함수 fit을 \dfrac{...}{...} 로. 분모가 상수 1이면 분자만. */
export function fitToLatex(fit: RationalFit, v: string): string {
  const nz = fit.den.filter((c) => Math.abs(c) > 1e-12);
  if (nz.length === 1 && Math.abs(fit.den[0] - 1) < 1e-9) return polyToLatex(fit.num, v);
  return `\\dfrac{${polyToLatex(fit.num, v)}}{${denToLatex(fit.den, v)}}`;
}

export type ParamMaxPowerProblem = {
  /** 각 단계의 요구 (줄바꿈으로 이어 붙여 question으로 쓴다) */
  question: string;
  answer: string;
  steps: string[];
  /** 복원·최적화 결과 (검증·로깅용) */
  facts: { vExpr: string; pExpr: string; aStar: number; pMax: number };
};

/**
 * 3단계 발문(전압식 → 전력식 → 최대 a·P_M)을 만든다.
 * 식 복원이나 극대 탐색이 실패하면 null — 억지로 문제를 만들지 않는다.
 */
export function buildParamMaxPowerProblem(opts: {
  build: ParamNetworkFn;
  /** 파라미터 기호 (보통 "a") */
  param: string;
  /** 전력을 볼 저항의 solver id */
  targetResistorId: string;
  /** 그 저항 위 전압을 가리키는 노드 id (없으면 전압 단계 생략) */
  targetNodeId?: string;
  /** 표기용 라벨 */
  labels?: { resistor?: string; voltage?: string; power?: string };
  range?: { min: number; max: number };
}): ParamMaxPowerProblem | null {
  const v = opts.param;
  const rLabel = opts.labels?.resistor ?? "R_B";
  const vLabel = opts.labels?.voltage ?? "V_B";
  const pLabel = opts.labels?.power ?? "P_B";
  const range = opts.range ?? { min: 0.05, max: 200 };

  const pFit0 = fitRationalInParam(opts.build, resistorPowerMetric(opts.targetResistorId));
  if (!pFit0) return null;
  const pFit = rationalizeFit(pFit0);

  const mx = maximizeOverParam(opts.build, resistorPowerMetric(opts.targetResistorId), range);
  // 경계에 붙었다면 진짜 극대가 아니다 — 이 형식의 문제가 성립하지 않으므로 포기한다.
  if (mx.atBoundary || !Number.isFinite(mx.valueStar)) return null;

  // ★ 극점(pole) 배제 — 분모가 0이 되는 a 근처에서는 전력이 발산해 최대화기가 그 점을
  //   "최댓값"으로 집는다(실측: a=1/2에서 P_M=6.1e22). 물리적 최대가 아니므로 거부한다.
  //   분모의 부호가 탐색 구간에서 바뀌면 그 사이에 실근이 있다는 뜻이다.
  if (hasRootInRange(pFit.den, range.min, range.max)) return null;
  // 최대점 좌우에서 전력이 급변하면 극대가 아니라 발산이다 (수치적 안전망).
  const metric = resistorPowerMetric(opts.targetResistorId);
  const left = evaluateAt(opts.build, metric, mx.aStar * 0.98);
  const right = evaluateAt(opts.build, metric, mx.aStar * 1.02);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  if (left > mx.valueStar * 1.001 || right > mx.valueStar * 1.001) return null; // 극대가 아님
  if (mx.valueStar > 1e6) return null;                                          // 비물리적 크기

  let vFit: RationalFit | null = null;
  if (opts.targetNodeId) {
    const f = fitRationalInParam(opts.build, nodeVoltageMetric(opts.targetNodeId));
    if (f) vFit = rationalizeFit(f);
  }

  const vExpr = vFit ? fitToLatex(vFit, v) : "";
  const pExpr = fitToLatex(pFit, v);
  const aStar = Number(mx.aStar.toFixed(6));
  const pMax = Number(mx.valueStar.toFixed(6));

  const steps: string[] = [];
  const question: string[] = [];
  let n = 1;
  if (vFit) {
    question.push(`[단계 ${n}] 전압 \\( ${vLabel}\\,[\\mathrm{V}] \\)를 \\( ${v} \\)가 포함된 식으로 구하시오.`);
    steps.push(
      `[단계 ${n}] 슈퍼노드(또는 노드) 해석으로 \\( ${vLabel} \\)를 \\( ${v} \\)의 식으로 정리하면 ` +
        `\\( ${vLabel} = ${vExpr}\\,[\\mathrm{V}] \\).`,
    );
    n++;
  }
  question.push(
    `[단계 ${n}] [단계 ${n - 1}]의 결과를 이용하여 저항 \\( ${rLabel} \\)의 전력 \\( ${pLabel}\\,[\\mathrm{W}] \\)를 \\( ${v} \\)가 포함된 식으로 구하시오.`,
  );
  steps.push(
    `[단계 ${n}] \\( ${pLabel} = \\dfrac{${vLabel}^{2}}{${rLabel}} = ${pExpr}\\,[\\mathrm{W}] \\).`,
  );
  n++;
  question.push(
    `[단계 ${n}] [단계 ${n - 1}]의 결과를 이용하여, 저항 \\( ${rLabel} \\)에서 소비되는 전력이 최대가 되기 위한 \\( ${v} \\)값과, 이때의 전력 \\( P_M\\,[\\mathrm{W}] \\)을 구하시오.`,
  );
  steps.push(
    `[단계 ${n}] \\( \\dfrac{d${pLabel}}{d${v}} = 0 \\)을 풀면 \\( ${v} = ${trimNum(aStar)} \\)에서 최대가 된다. ` +
      `이때 \\( P_M = ${trimNum(pMax)}\\,[\\mathrm{W}] \\).`,
  );

  const answerParts = [
    ...(vFit ? [`\\( ${vLabel} = ${vExpr}\\,[\\mathrm{V}] \\)`] : []),
    `\\( ${pLabel} = ${pExpr}\\,[\\mathrm{W}] \\)`,
    `\\( ${v} = ${trimNum(aStar)} \\)`,
    `\\( P_M = ${trimNum(pMax)}\\,[\\mathrm{W}] \\)`,
  ];

  return {
    question: question.join("\n"),
    answer: answerParts.join(", "),
    steps,
    facts: { vExpr, pExpr, aStar, pMax },
  };
}
