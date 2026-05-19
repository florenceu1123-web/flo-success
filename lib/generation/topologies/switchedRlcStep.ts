import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  NodeAnnotation,
  MeasurementMark,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * Switched RLC step response 회로 generator — 임용 9번 (switched 버전).
 *
 *  회로 (v1 단순화 — 3-leg + SPDT SW):
 *    좌측 leg (SW=A 시 활성):  V_s ━ R_a ━ A_node
 *    우측 leg (SW=B 시 활성):  I_s ━ R_b ━ B_node (Norton)
 *    가운데 core (항상 회로): SW의 가운데 단자 ←→ 가운데 노드
 *                            가운데 노드 ┳━ C ━ GND  (v_C 측정)
 *                                       ┗━ R_c ━ L ━ GND  (i_L 측정, R_c+L 직렬)
 *    SW (SPDT, t=0에 A→B): 가운데 노드를 A_node(t<0) 또는 B_node(t≥0)에 연결.
 *
 *  학생 단계 (원본 임용 9번 패턴):
 *    [단계 1] t<0 DC SS — v_C(0⁻)[V], i_L(0⁻)[A]
 *      · C open, L short → 가운데 = V_s·R_c/(R_a+R_c), v_C(0⁻) = 가운데
 *      · i_L(0⁻) = V_s/(R_a+R_c) (R_c+L 가지 전체 전류, L short)
 *    [단계 2] t≥0 KCL → dv_C(0⁺)/dt [V/sec]
 *      · KCL at 가운데: I_s = v_C/R_b + i_L + C·dv_C/dt
 *      · dv_C/dt(0⁺) = (I_s − v_C(0⁻)/R_b − i_L(0⁻))/C
 *    [단계 3] 2차 미분방정식 + v_C(t) [V]
 *      · d²v/dt² + α·dv/dt + β·v = γ  (forced response v(∞) = γ/β)
 *      · 자연응답: ζ = α/(2√β), ω_0 = √β  → under/critical/over
 *      · v_C(t) = v(∞) + 자연응답
 *
 *  값 사전 페어 (모두 nice 정수/소수, under-damped 표준):
 */

export type SwitchedRlcStepGeneration = {
  netlist: CircuitNetlist;
  values: {
    V_s: number; R_a: number; R_c: number; L: number; C: number; R_b: number; I_s: number;
    // 도출값 (정답)
    v_C_0minus: number;        // 단계 1
    i_L_0minus: number;        // 단계 1
    dvC_dt_0plus: number;      // 단계 2
    v_C_infty: number;         // 단계 3 forced
    // 2차 미방 계수: d²v/dt² + α·dv/dt + β·v = γ
    alpha: number;
    beta: number;
    gamma: number;
    damping: "under" | "critical" | "over";
    omega0: number;
    zeta: number;
    omegaD?: number;           // under 시 진동 각주파수
    // 해의 형식 정보 (textWriter가 사용)
    solutionForm: string;      // "v_C(t) = v∞ + e^(-αt/2)·(A cos ω_d t + B sin ω_d t)" 등
    solutionA: number;
    solutionB: number;
  };
};

type Pair = {
  V_s: number; R_a: number; R_c: number;
  L: number; C: number;
  R_b: number; I_s: number;
};

// 미방 계수 + 해 도출
function derive(p: Pair) {
  // t<0 DC SS (SW=A): C open, L short
  // 회로: V_s → R_a → 가운데 → R_c → GND (L short, R_c+L 가지). C 양단 = 가운데 전압.
  const v_C_0minus = (p.V_s * p.R_c) / (p.R_a + p.R_c);
  const i_L_0minus = p.V_s / (p.R_a + p.R_c);

  // t=0⁺ KCL (SW=B 직후): I_s = v_C/R_b + i_L + C·dv_C/dt
  // (v_C, i_L은 연속 → v_C(0⁺)=v_C(0⁻), i_L(0⁺)=i_L(0⁻))
  const dvC_dt_0plus = (p.I_s - v_C_0minus / p.R_b - i_L_0minus) / p.C;

  // t=∞ DC SS: C open, L short → 가운데 = i_L·R_c.
  //   KCL at ∞: I_s = v_C/R_b + i_L. L short → v_C = i_L·R_c.
  //   → I_s = (i_L·R_c)/R_b + i_L = i_L·(R_c/R_b + 1) → i_L(∞) = I_s·R_b/(R_b+R_c)
  //   → v_C(∞) = i_L(∞)·R_c = I_s·R_b·R_c/(R_b+R_c)
  const v_C_infty = (p.I_s * p.R_b * p.R_c) / (p.R_b + p.R_c);
  const i_L_infty = (p.I_s * p.R_b) / (p.R_b + p.R_c);

  // 2차 미방 (v_C에 대한):
  //   v_M = R_c·i_L + L·di_L/dt (KVL on R_c+L)
  //   v_M = v_C (가운데 = C 위)
  //   KCL: I_s = v_C/R_b + C·dv_C/dt + i_L
  //   → i_L = I_s - v_C/R_b - C·dv_C/dt
  //   → di_L/dt = -dv_C/dt/R_b - C·d²v_C/dt²
  //   v_M = v_C = R_c·i_L + L·di_L/dt
  //   v_C = R_c·(I_s - v_C/R_b - C·dv_C/dt) + L·(-dv_C/dt/R_b - C·d²v_C/dt²)
  //   v_C = R_c·I_s - (R_c/R_b)·v_C - R_c·C·dv_C/dt - (L/R_b)·dv_C/dt - L·C·d²v_C/dt²
  //   L·C·d²v_C/dt² + (R_c·C + L/R_b)·dv_C/dt + (1 + R_c/R_b)·v_C = R_c·I_s
  //   → d²v_C/dt² + ((R_c·C + L/R_b)/(L·C))·dv_C/dt + ((1 + R_c/R_b)/(L·C))·v_C = R_c·I_s/(L·C)
  const alpha = (p.R_c * p.C + p.L / p.R_b) / (p.L * p.C);
  const beta = (1 + p.R_c / p.R_b) / (p.L * p.C);
  const gamma = (p.R_c * p.I_s) / (p.L * p.C);
  const omega0 = Math.sqrt(beta);
  const zeta = alpha / (2 * omega0);

  // 강제응답 (DC): v(∞) = γ/β = R_c·I_s/(1 + R_c/R_b) = I_s·R_b·R_c/(R_b+R_c) ✓ 위와 일치
  // 자연응답:
  //   under (ζ<1): exp(-α/2·t)·(A·cos(ω_d·t) + B·sin(ω_d·t)), ω_d = √(β−α²/4)
  //   critical (ζ=1): (A + B·t)·exp(-α/2·t)
  //   over (ζ>1): A·exp(s1·t) + B·exp(s2·t), s1,s2 = (-α ± √(α²-4β))/2
  // 초기조건: v(0)=v_C(0⁻), v'(0)=dvC_dt_0plus, transient = v - v(∞)
  // → x(0) = v_C(0⁻) - v_C(∞), x'(0) = dvC_dt_0plus
  const x0 = v_C_0minus - v_C_infty;
  const x0prime = dvC_dt_0plus;

  let damping: "under" | "critical" | "over";
  let omegaD: number | undefined;
  let solutionForm: string;
  let solutionA: number;
  let solutionB: number;

  if (Math.abs(zeta - 1) < 1e-9) {
    damping = "critical";
    // v(t) = v(∞) + (A + Bt)·e^(-α/2·t)
    // x(0)=A, x'(0) = B - (α/2)·A → B = x'(0) + (α/2)·A
    solutionA = x0;
    solutionB = x0prime + (alpha / 2) * x0;
    solutionForm = `v_C(t) = ${round(v_C_infty, 3)} + (${round(solutionA, 3)} + ${round(solutionB, 3)}t)·exp(-${round(alpha / 2, 3)}·t)`;
  } else if (zeta < 1) {
    damping = "under";
    omegaD = Math.sqrt(beta - (alpha * alpha) / 4);
    // x(t) = e^(-α/2·t)·(A·cos(ω_d·t) + B·sin(ω_d·t))
    // x(0) = A, x'(0) = -α/2·A + ω_d·B → B = (x'(0) + α/2·A)/ω_d
    solutionA = x0;
    solutionB = (x0prime + (alpha / 2) * x0) / omegaD;
    solutionForm = `v_C(t) = ${round(v_C_infty, 3)} + exp(-${round(alpha / 2, 3)}·t)·(${round(solutionA, 3)}·cos(${round(omegaD, 3)}·t) + ${round(solutionB, 3)}·sin(${round(omegaD, 3)}·t))`;
  } else {
    damping = "over";
    const sqrtPart = Math.sqrt((alpha * alpha) / 4 - beta);
    const s1 = -alpha / 2 + sqrtPart;
    const s2 = -alpha / 2 - sqrtPart;
    // x(t) = A·e^(s1·t) + B·e^(s2·t)
    // x(0) = A + B = x0
    // x'(0) = s1·A + s2·B = x0prime
    // → A = (x0prime - s2·x0)/(s1 - s2), B = (s1·x0 - x0prime)/(s1 - s2)
    solutionA = (x0prime - s2 * x0) / (s1 - s2);
    solutionB = (s1 * x0 - x0prime) / (s1 - s2);
    solutionForm = `v_C(t) = ${round(v_C_infty, 3)} + ${round(solutionA, 3)}·exp(${round(s1, 4)}·t) + ${round(solutionB, 3)}·exp(${round(s2, 4)}·t)`;
  }

  return {
    v_C_0minus, i_L_0minus, v_C_infty, dvC_dt_0plus,
    alpha, beta, gamma, omega0, zeta, omegaD,
    damping, solutionForm, solutionA, solutionB,
  };
}

// 사전 검증 페어 — 모두 의미있는 transition + 깔끔한 풀이
const RAW_PAIRS: Pair[] = [
  { V_s: 4,  R_a: 1, R_c: 1, L: 1, C: 1, R_b: 1, I_s: 2 },   // under(ζ=1/√2), v_C: 2→1, dv/dt(0+)=-2
  { V_s: 6,  R_a: 1, R_c: 2, L: 1, C: 1, R_b: 2, I_s: 2 },   // under
  { V_s: 12, R_a: 2, R_c: 1, L: 1, C: 1, R_b: 1, I_s: 3 },   // under
  { V_s: 8,  R_a: 2, R_c: 2, L: 2, C: 1, R_b: 2, I_s: 1 },   // under
  { V_s: 10, R_a: 1, R_c: 4, L: 1, C: 1, R_b: 4, I_s: 1 },   // under
];

const PAIRS = RAW_PAIRS.filter((p) => {
  try {
    derive(p);
    return true;
  } catch { return false; }
});

export function generateSwitchedRlcStep(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): SwitchedRlcStepGeneration {
  const rand = makeRand(args.seed);
  const p = pick(PAIRS, rand);
  const d = derive(p);

  // ── netlist 구성 ────────────────────────────────────────────
  // 노드:
  //   VS_top     : V_s 위
  //   A_node     : R_a 우측 (SW의 A 단자)
  //   MID        : SW의 가운데 = C 위 = R_c 위 (가운데 노드)
  //   B_node     : R_b 좌측 (SW의 B 단자) = I_s 위
  //   RC_LMID    : R_c 아래 = L 위 (R_c·L 직렬 중간점)
  //   GND
  const components: CircuitComponent[] = [
    // 좌측 leg
    {
      id: "V_s", type: "V", value: `${p.V_s}V`,
      pins: [
        { id: "p", node: "VS_top", side: "top" },
        { id: "n", node: "GND",    side: "bottom" },
      ],
    },
    {
      id: "R_a", type: "R", value: `${p.R_a}Ω`,
      pins: [
        { id: "p", node: "VS_top",  side: "left" },
        { id: "n", node: "A_node",  side: "right" },
      ],
    },
    // SPDT 스위치 (t=0에 A→B). PinRole이 제한적이라 role 미지정 (id로 식별).
    {
      id: "SW", type: "SW", value: "t=0: A→B",
      pins: [
        { id: "a",      node: "A_node", side: "left" },
        { id: "b",      node: "B_node", side: "right" },
        { id: "common", node: "MID",    side: "bottom" },
      ],
    },
    // 가운데 core: C (v_C, vertical) + R_c + L (직렬)
    {
      id: "C", type: "C", value: `${formatFraction(p.C)}F`,
      pins: [
        { id: "p", node: "MID", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "R_c", type: "R", value: `${p.R_c}Ω`,
      pins: [
        { id: "p", node: "MID",     side: "top" },
        { id: "n", node: "RC_LMID", side: "bottom" },
      ],
    },
    {
      id: "L", type: "L", value: `${formatFraction(p.L)}H`,
      pins: [
        { id: "p", node: "RC_LMID", side: "top" },
        { id: "n", node: "GND",     side: "bottom" },
      ],
    },
    // 우측 leg
    {
      id: "R_b", type: "R", value: `${p.R_b}Ω`,
      pins: [
        { id: "p", node: "B_node", side: "left" },
        { id: "n", node: "IS_top", side: "right" },
      ],
    },
    {
      id: "I_s", type: "I", value: `${p.I_s}A`,
      pins: [
        { id: "p", node: "IS_top", side: "top" },
        { id: "n", node: "GND",    side: "bottom" },
      ],
    },
  ];

  const nodeAnnotations: NodeAnnotation[] = [
    { node: "A_node", label: "A", style: "terminal_dot" },
    { node: "B_node", label: "B", style: "terminal_dot" },
    { node: "MID",    label: "v_C(+)", style: "label_only" },
  ];

  const measurementMarks: MeasurementMark[] = [
    { kind: "voltage", refs: ["MID", "GND"], label: "v_C(t)" },
    { kind: "current", refs: ["L"], label: "i_L(t)" },
  ];

  return {
    netlist: {
      components,
      ground: "GND",
      nodeAnnotations,
      measurementMarks,
    },
    values: {
      V_s: p.V_s, R_a: p.R_a, R_c: p.R_c, L: p.L, C: p.C, R_b: p.R_b, I_s: p.I_s,
      v_C_0minus: round(d.v_C_0minus, 4),
      i_L_0minus: round(d.i_L_0minus, 4),
      dvC_dt_0plus: round(d.dvC_dt_0plus, 4),
      v_C_infty: round(d.v_C_infty, 4),
      alpha: round(d.alpha, 4),
      beta: round(d.beta, 4),
      gamma: round(d.gamma, 4),
      damping: d.damping,
      omega0: round(d.omega0, 4),
      zeta: round(d.zeta, 4),
      omegaD: d.omegaD !== undefined ? round(d.omegaD, 4) : undefined,
      solutionForm: d.solutionForm,
      solutionA: round(d.solutionA, 4),
      solutionB: round(d.solutionB, 4),
    },
  };
}

/**
 * v_C(t) 시간응답 sample 생성 — waveform figure용.
 */
export function buildVcTimeSamples(args: {
  values: SwitchedRlcStepGeneration["values"];
  tMax?: number;
  nSamples?: number;
}): Array<{ t: number; v: number }> {
  const v = args.values;
  const tMax = args.tMax ?? Math.max(8 / v.omega0, 10);
  const N = args.nSamples ?? 160;
  const out: Array<{ t: number; v: number }> = [];
  for (let i = 0; i <= N; i++) {
    const t = (tMax * i) / N;
    const value = evaluateVcAt(t, v);
    out.push({ t, v: value });
  }
  return out;
}

function evaluateVcAt(t: number, v: SwitchedRlcStepGeneration["values"]): number {
  const transient = (() => {
    if (v.damping === "critical") {
      return (v.solutionA + v.solutionB * t) * Math.exp(-(v.alpha / 2) * t);
    }
    if (v.damping === "under" && v.omegaD !== undefined) {
      return Math.exp(-(v.alpha / 2) * t) * (
        v.solutionA * Math.cos(v.omegaD * t) + v.solutionB * Math.sin(v.omegaD * t)
      );
    }
    // over
    const sqrtPart = Math.sqrt((v.alpha * v.alpha) / 4 - v.beta);
    const s1 = -v.alpha / 2 + sqrtPart;
    const s2 = -v.alpha / 2 - sqrtPart;
    return v.solutionA * Math.exp(s1 * t) + v.solutionB * Math.exp(s2 * t);
  })();
  return v.v_C_infty + transient;
}

function round(x: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}

/** 1, 0.5, 1/5, 5/6 같은 nice 표기. 정수면 정수, nice 분수면 "a/b", 아니면 소수 */
function formatFraction(x: number): string {
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  for (const denom of [2, 3, 4, 5, 6, 7, 8, 10]) {
    const numer = Math.round(x * denom);
    if (numer > 0 && Math.abs(x - numer / denom) < 1e-9) {
      return `${numer}/${denom}`;
    }
  }
  return String(Math.round(x * 1000) / 1000);
}
