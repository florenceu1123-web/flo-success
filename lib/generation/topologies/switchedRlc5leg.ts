import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  NodeAnnotation,
  MeasurementMark,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * Switched RLC 5-leg 회로 generator — 임용 9번 정확 재현.
 *
 *  회로 (6 vertical legs + 2 top horizontal R + SPDT SW):
 *
 *  ┌── R_top_L ──┬─────────────┬─── A ╲╳╱ B ─── R_top_R ──┐
 *  │             │             │       │                   │
 *  │             │            R_3      │                   R_top_R는
 *  │             │             │       SW의 common이 leg4 top
 *  V_s          R_2v          L_a      │                   │
 *  │             │             │       │                   L_b
 *  │             │             │       (C ∥ R_4) ─ GND     │
 *  │             │             │                           │
 *  GND          GND          GND                          GND
 *  + 우측: I_s leg (별도)
 *
 *  Top rail 노드:
 *    TN_a: V_s+ top
 *    TN_b: R_top_L의 우측 (R_2v top, R_3+L_a leg top)
 *    A_node: R_3+L_a leg top = SW의 A throw
 *    B_node: L_b leg top = SW의 B throw
 *    TN_c: R_top_R의 우측 = I_s top
 *  연결:
 *    TN_a → R_top_L (horizontal) → TN_b
 *    TN_b = A_node (top rail wire — 같은 노드)
 *    SW common = leg4 top (C∥R_4의 위 노드)
 *    B_node → R_top_R (horizontal) → TN_c
 *
 *  학생 단계 (원본 임용 9번 패턴):
 *    [단계 1] t<0 SW=A — DC SS. C 개방, L_a·L_b 단락.
 *      좌측 회로 활성: V_s + R_top_L + (R_2v ∥ R_3 ∥ R_4) 등가
 *        - leg3: R_3 + L_a → L_a short → R_3 단독
 *        - leg4: C open + R_4 병렬 → R_4 단독
 *        - top_X = TN_b = A_node = leg4 top = leg3 top = V_s·R_eq/(R_top_L+R_eq)
 *        - v_C(0⁻) = top_X
 *      우측 회로 분리: I_s + R_top_R + L_b → L_b short → i_L(0⁻) = I_s
 *    [단계 2] t≥0 SW=B — leg4 top = B_node. 좌측 분리, 우측 활성.
 *      KCL at leg4 top = top_Y: (top_Z − top_Y)/R_top_R = i_C + v_C/R_4 + i_L
 *        top_Z − top_Y = I_s · R_top_R (Norton)
 *        → dv_C(0⁺)/dt = (I_s − v_C/R_4 − i_L)/C
 *    [단계 3] 2차 미방:
 *      d²v_C/dt² + (1/(R_4·C))·dv_C/dt + (1/(L_b·C))·v_C = 0  (자연응답만, 강제 v(∞)=0)
 */

export type SwitchedRlc5legGeneration = {
  netlist: CircuitNetlist;
  values: {
    V_s: number;            // [V]
    R_top_L: number;        // [Ω] (좌측 top horizontal)
    R_2v: number;           // [Ω] (leg2 vertical)
    R_3: number;            // [Ω] (leg3 위, R_3 + L_a 직렬)
    L_a: number;            // [H] (leg3 아래)
    C: number;              // [F] (leg4 vertical, v_C 측정)
    R_4: number;            // [Ω] (leg4 vertical, C에 병렬)
    L_b: number;            // [H] (leg5 vertical, i_L 측정)
    R_top_R: number;        // [Ω] (우측 top horizontal)
    I_s: number;            // [A] (leg6 전류원)
    // 학생 도출값
    v_C_0minus: number;     // 단계 1
    i_L_0minus: number;     // 단계 1 (= I_s, L_b short)
    dvC_dt_0plus: number;   // 단계 2
    v_C_infty: number;      // 단계 3 강제
    alpha: number;          // 미방: d²v + α·dv + β·v = γ
    beta: number;
    gamma: number;
    damping: "under" | "critical" | "over";
    omega0: number;
    zeta: number;
    omegaD?: number;
    // 일반해 상수 (over: A·exp(s1·t)+B·exp(s2·t); under: e^(-α/2·t)·(A·cos+B·sin); critical: (A+Bt)·e)
    s1?: number;
    s2?: number;
    solutionA: number;
    solutionB: number;
    solutionForm: string;
  };
};

type Pair = {
  V_s: number; R_top_L: number; R_2v: number;
  R_3: number; L_a: number;
  C: number; R_4: number;
  L_b: number;
  R_top_R: number; I_s: number;
};

function derive(p: Pair) {
  // ★ 회로 토폴로지 (수정): R_4는 B_node에 병렬 (L_b·R_top_R·I_s와 함께 우측 회로의 일부)
  //   - SW common (Leg4 top) 아래: C만 (단일 leg)
  //   - B_node: R_4 ∥ L_b ∥ (R_top_R → I_s)
  //   - SW=A 시 SW common이 A_node(=TN_b)에 연결 → C가 좌측 회로의 일부
  //   - SW=B 시 SW common이 B_node에 연결 → C가 우측 회로의 일부

  // === t<0 SW=A DC SS ===
  // 좌측 회로: V_s + R_top_L 직렬 → (R_2v ∥ R_3 ∥ C_open) 등가 to GND
  //   (L_a short → leg3 = R_3; C open → 좌측에 C는 ∞ 임피던스, R_4 제외)
  //   R_eq = R_2v ∥ R_3
  const R_eq = 1 / (1 / p.R_2v + 1 / p.R_3);
  const top_X = (p.V_s * R_eq) / (p.R_top_L + R_eq);
  const v_C_0minus = top_X;

  // 우측 회로 (SW=A·B 모두 활성, B_node 기준): I_s + R_top_R + R_4 + L_b
  //   L_b short → B_node = 0. KCL at TN_c: I_s = (TN_c - 0)/R_top_R → TN_c = I_s·R_top_R
  //   KCL at B_node=0: I_top_R_in = (TN_c - 0)/R_top_R = I_s. = R_4 current + i_L = 0/R_4 + i_L → i_L = I_s
  const i_L_0minus = p.I_s;

  // === t≥0 SW=B DC SS at t=∞ ===
  //   SW common = B_node. C가 우측 회로의 일부. L_b short → B_node = 0 → v_C(∞) = 0.
  const v_C_infty = 0;

  // === t=0+ KCL at B_node SW=B 직후 ===
  //   회로: B_node에 C, R_4, L_b 모두 병렬, R_top_R 통해 I_s.
  //   KCL at B_node: (TN_c - v_C)/R_top_R = i_C + v_C/R_4 + i_L
  //   KCL at TN_c: I_s = (TN_c - v_C)/R_top_R → TN_c - v_C = I_s · R_top_R
  //   → I_s = i_C + v_C/R_4 + i_L → dv_C/dt = (I_s - v_C/R_4 - i_L)/C
  const dvC_dt_0plus = (p.I_s - v_C_0minus / p.R_4 - i_L_0minus) / p.C;

  // === 2차 미방 ===
  //   v_L = L_b · di_L/dt = top_Y = v_C → di_L/dt = v_C/L_b
  //   dv_C/dt = (I_s - v_C/R_4 - i_L)/C
  //   d²v_C/dt² = -dv_C/dt/(R_4·C) - di_L/(C·dt) = -dv_C/dt/(R_4·C) - v_C/(L_b·C)
  //   → d²v_C/dt² + (1/(R_4·C))·dv_C/dt + (1/(L_b·C))·v_C = 0
  //   강제 항: I_s가 d/dt에서 사라짐. v(∞) = 0 ✓ (자연응답만)
  const alpha = 1 / (p.R_4 * p.C);
  const beta = 1 / (p.L_b * p.C);
  const gamma = 0;
  const omega0 = Math.sqrt(beta);
  const zeta = alpha / (2 * omega0);

  let damping: "under" | "critical" | "over";
  let omegaD: number | undefined;
  let s1: number | undefined;
  let s2: number | undefined;
  let solutionA: number;
  let solutionB: number;
  let solutionForm: string;

  if (Math.abs(zeta - 1) < 1e-9) {
    damping = "critical";
    solutionA = v_C_0minus;
    solutionB = dvC_dt_0plus + (alpha / 2) * v_C_0minus;
    solutionForm = `v_C(t) = (${fmt(solutionA)} + ${fmt(solutionB)}·t)·exp(-${fmt(alpha / 2)}·t)`;
  } else if (zeta < 1) {
    damping = "under";
    omegaD = Math.sqrt(beta - (alpha * alpha) / 4);
    solutionA = v_C_0minus;
    solutionB = (dvC_dt_0plus + (alpha / 2) * v_C_0minus) / omegaD;
    solutionForm = `v_C(t) = exp(-${fmt(alpha / 2)}·t)·(${fmt(solutionA)}·cos(${fmt(omegaD)}·t) + ${fmt(solutionB)}·sin(${fmt(omegaD)}·t))`;
  } else {
    damping = "over";
    const sqrtPart = Math.sqrt((alpha * alpha) / 4 - beta);
    s1 = -alpha / 2 + sqrtPart;
    s2 = -alpha / 2 - sqrtPart;
    // x(t) = A·e^(s1·t) + B·e^(s2·t)
    // x(0) = A + B = v_C_0minus
    // x'(0) = s1·A + s2·B = dvC_dt_0plus
    solutionA = (dvC_dt_0plus - s2 * v_C_0minus) / (s1 - s2);
    solutionB = (s1 * v_C_0minus - dvC_dt_0plus) / (s1 - s2);
    solutionForm = `v_C(t) = ${fmt(solutionA)}·exp(${fmt(s1)}·t) + ${fmt(solutionB)}·exp(${fmt(s2)}·t)`;
  }

  return {
    v_C_0minus, i_L_0minus, dvC_dt_0plus, v_C_infty,
    alpha, beta, gamma, damping, omega0, zeta, omegaD,
    s1, s2, solutionA, solutionB, solutionForm,
  };
}

// 사전 페어. 원본 임용 9번을 PAIRS[0]에 둠.
const RAW_PAIRS: Pair[] = [
  // 원본: V_s=12, R_top_L=2, R_2v=4, R_3=4, L_a=2, C=1/5, R_4=1, L_b=5/6, R_top_R=1, I_s=2
  // → v_C(0⁻)=3, i_L(0⁻)=2, dv_C/dt(0+)=-15, 미방 d²v+5dv+6v=0, v(t)=-6e⁻²ᵗ+9e⁻³ᵗ
  { V_s: 12, R_top_L: 2, R_2v: 4, R_3: 4, L_a: 2, C: 1/5, R_4: 1, L_b: 5/6, R_top_R: 1, I_s: 2 },
  // 변형 1: V_s=10, C=1/4, L_b=1, R_4=2, I_s=1
  { V_s: 10, R_top_L: 1, R_2v: 5, R_3: 5, L_a: 1, C: 1/4, R_4: 2, L_b: 1, R_top_R: 2, I_s: 1 },
  // 변형 2: V_s=15, 모든 R 변형
  { V_s: 15, R_top_L: 3, R_2v: 6, R_3: 6, L_a: 3, C: 1/6, R_4: 2, L_b: 1, R_top_R: 1, I_s: 3 },
];

const PAIRS = RAW_PAIRS.filter((p) => {
  try { derive(p); return true; } catch { return false; }
});

export function generateSwitchedRlc5leg(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): SwitchedRlc5legGeneration {
  const rand = makeRand(args.seed);
  const p = pick(PAIRS, rand);
  const d = derive(p);

  // ── netlist ─────────────────────────────────────────────────
  // 노드:
  //   TN_a       : V_s+ top
  //   TN_b       : R_top_L 우측 (= R_2v top = R_3+L_a leg top = A_node, SW의 A throw)
  //   B_node     : L_b leg top, SW의 B throw
  //   MID4       : leg4 top (SW의 common = C top = R_4 top, v_C(+))
  //   N3_mid     : leg3 R_3-L_a 사이 (R_3 하단 = L_a 상단)
  //   TN_c       : R_top_R 우측 (= I_s top, leg6 top)
  //   GND
  const components: CircuitComponent[] = [
    // Leg1: V_s vertical
    {
      id: "V_s", type: "V", value: `${p.V_s}V`,
      pins: [
        { id: "p", node: "TN_a", side: "top" },
        { id: "n", node: "GND",  side: "bottom" },
      ],
    },
    // Top horizontal R: R_top_L (TN_a ↔ TN_b)
    {
      id: "R_top_L", type: "R", value: `${p.R_top_L}Ω`,
      pins: [
        { id: "p", node: "TN_a", side: "left" },
        { id: "n", node: "TN_b", side: "right" },
      ],
    },
    // Leg2: R_2v vertical (TN_b → GND)
    {
      id: "R_2v", type: "R", value: `${p.R_2v}Ω`,
      pins: [
        { id: "p", node: "TN_b", side: "top" },
        { id: "n", node: "GND",  side: "bottom" },
      ],
    },
    // Leg3: R_3 + L_a 직렬 (TN_b → N3_mid → GND, A_node와 같은 top)
    {
      id: "R_3", type: "R", value: `${p.R_3}Ω`,
      pins: [
        { id: "p", node: "TN_b",   side: "top" },
        { id: "n", node: "N3_mid", side: "bottom" },
      ],
    },
    {
      id: "L_a", type: "L", value: `${fmtFrac(p.L_a)}H`,
      pins: [
        { id: "p", node: "N3_mid", side: "top" },
        { id: "n", node: "GND",    side: "bottom" },
      ],
    },
    // SW SPDT: common = MID4, throw_a = TN_b (= A_node), throw_b = B_node
    {
      id: "SW", type: "SW", value: "t=0: A→B",
      pins: [
        { id: "a",      node: "TN_b",   side: "left" },     // A throw (= TN_b)
        { id: "b",      node: "B_node", side: "right" },    // B throw
        { id: "common", node: "MID4",   side: "bottom" },   // common → leg4 top
      ],
    },
    // Leg4: C 단독 (MID4 = SW common → GND)
    {
      id: "C", type: "C", value: `${fmtFrac(p.C)}F`,
      pins: [
        { id: "p", node: "MID4", side: "top" },
        { id: "n", node: "GND",  side: "bottom" },
      ],
    },
    // R_4: B_node 쪽 회로의 일부 (B_node → GND), L_b와 병렬
    {
      id: "R_4", type: "R", value: `${p.R_4}Ω`,
      pins: [
        { id: "p", node: "B_node", side: "top" },
        { id: "n", node: "GND",    side: "bottom" },
      ],
    },
    // Leg5: L_b vertical (B_node → GND)
    {
      id: "L_b", type: "L", value: `${fmtFrac(p.L_b)}H`,
      pins: [
        { id: "p", node: "B_node", side: "top" },
        { id: "n", node: "GND",    side: "bottom" },
      ],
    },
    // Top horizontal R: R_top_R (B_node ↔ TN_c)
    {
      id: "R_top_R", type: "R", value: `${p.R_top_R}Ω`,
      pins: [
        { id: "p", node: "B_node", side: "left" },
        { id: "n", node: "TN_c",   side: "right" },
      ],
    },
    // Leg6: I_s vertical (TN_c → GND, 위로 흐름)
    {
      id: "I_s", type: "I", value: `${p.I_s}A`,
      pins: [
        { id: "p", node: "TN_c", side: "top" },
        { id: "n", node: "GND",  side: "bottom" },
      ],
    },
  ];

  const nodeAnnotations: NodeAnnotation[] = [
    { node: "TN_b",   label: "A",         style: "terminal_dot" },
    { node: "B_node", label: "B",         style: "terminal_dot" },
    { node: "MID4",   label: "v_C(+)",    style: "label_only" },
  ];

  const measurementMarks: MeasurementMark[] = [
    { kind: "voltage", refs: ["MID4", "GND"], label: "v_C(t)" },
    { kind: "current", refs: ["L_b"], label: "i_L(t)" },
  ];

  return {
    netlist: { components, ground: "GND", nodeAnnotations, measurementMarks },
    values: {
      V_s: p.V_s, R_top_L: p.R_top_L, R_2v: p.R_2v, R_3: p.R_3, L_a: p.L_a,
      C: p.C, R_4: p.R_4, L_b: p.L_b, R_top_R: p.R_top_R, I_s: p.I_s,
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
      s1: d.s1 !== undefined ? round(d.s1, 4) : undefined,
      s2: d.s2 !== undefined ? round(d.s2, 4) : undefined,
      solutionA: round(d.solutionA, 4),
      solutionB: round(d.solutionB, 4),
      solutionForm: d.solutionForm,
    },
  };
}

/** v_C(t) sample 생성 (waveform figure용) */
export function buildVc5legSamples(args: {
  values: SwitchedRlc5legGeneration["values"]; tMax?: number; nSamples?: number;
}): Array<{ t: number; v: number }> {
  const v = args.values;
  const tMax = args.tMax ?? Math.max(8 / Math.max(v.omega0, 0.1), 5);
  const N = args.nSamples ?? 160;
  const out: Array<{ t: number; v: number }> = [];
  for (let i = 0; i <= N; i++) {
    const t = (tMax * i) / N;
    out.push({ t, v: evalVc(t, v) });
  }
  return out;
}

function evalVc(t: number, v: SwitchedRlc5legGeneration["values"]): number {
  if (v.damping === "critical") {
    return (v.solutionA + v.solutionB * t) * Math.exp(-(v.alpha / 2) * t);
  }
  if (v.damping === "under" && v.omegaD !== undefined) {
    return Math.exp(-(v.alpha / 2) * t) * (
      v.solutionA * Math.cos(v.omegaD * t) + v.solutionB * Math.sin(v.omegaD * t)
    );
  }
  if (v.s1 !== undefined && v.s2 !== undefined) {
    return v.solutionA * Math.exp(v.s1 * t) + v.solutionB * Math.exp(v.s2 * t);
  }
  return 0;
}

function round(x: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}

function fmt(x: number): string {
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  return String(round(x, 4));
}

function fmtFrac(x: number): string {
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  for (const denom of [2, 3, 4, 5, 6, 7, 8, 10]) {
    const numer = Math.round(x * denom);
    if (numer > 0 && Math.abs(x - numer / denom) < 1e-9) return `${numer}/${denom}`;
  }
  return String(round(x, 4));
}
