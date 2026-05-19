import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  NodeAnnotation,
  MeasurementMark,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * AC parallel branches 회로 generator — 임용 5번 형식.
 *
 *  회로 구조 (top rail에 N_L · N_R 두 노드, I_S가 N_L → N_R 방향):
 *
 *  V_s+ ━ R_top(I_R1) ━ N_L ━ I_S → N_R ━ ━ ━ ━ ━ ━ ━
 *                       │              │       │       │
 *                       L_1            L_2     R       C (V_C 측정)
 *                       │              │       │       │
 *                       GND ━━━━━━━━━ GND ━ GND ━━━ GND
 *
 *  주어진 정보:
 *    i_L1(t) = |I_L1|√2 · cos(ωt + φ_L1)  →  I_L1 phasor (실효값)
 *    i_C(t)  = |I_C|√2  · cos(ωt + φ_C)   →  I_C phasor
 *  학생 단계:
 *    [1] V_C 도출:  V_C = I_C / (jωC)  (페이저)
 *    [2] I_L2 = V_C / (jωL_2),  I_S = I_L2 + I_R + I_C  (KCL at N_R, R 양단 = V_C)
 *    [3] I_R1 = I_L1 + I_S  (KCL at N_L)
 */

export type AcParallelBranchesGeneration = {
  netlist: CircuitNetlist;
  values: {
    omega: number;            // [rad/s]
    R_top: number;            // [Ω] — 20Ω
    L1: number;               // [H] — 1H
    L2: number;               // [H] — 0.1H
    R: number;                // [Ω] — 1Ω
    C: number;                // [F] — 0.1F
    // 주어진 페이저 (rms magnitude, angle in degrees)
    I_L1_mag: number; I_L1_ang: number;
    I_C_mag: number;  I_C_ang: number;
    // 학생 도출 (정답)
    V_C_mag: number; V_C_ang: number;
    I_L2_mag: number; I_L2_ang: number;
    I_R_mag: number;  I_R_ang: number;
    I_S_mag: number;  I_S_ang: number;
    I_R1_mag: number; I_R1_ang: number;
  };
};

type Pair = {
  omega: number; R_top: number;
  L1: number; L2: number; R: number; C: number;
  I_L1_mag: number; I_L1_ang: number;
  I_C_mag: number;  I_C_ang: number;
};

// 복소수 = (re, im). 페이저 = mag∠ang.
type Cplx = { re: number; im: number };
const fromPolar = (mag: number, angDeg: number): Cplx => ({
  re: mag * Math.cos((angDeg * Math.PI) / 180),
  im: mag * Math.sin((angDeg * Math.PI) / 180),
});
const cMul = (a: Cplx, b: Cplx): Cplx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cDiv = (a: Cplx, b: Cplx): Cplx => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const cAdd = (a: Cplx, b: Cplx): Cplx => ({ re: a.re + b.re, im: a.im + b.im });
const cMag = (a: Cplx): number => Math.sqrt(a.re * a.re + a.im * a.im);
const cAng = (a: Cplx): number => (Math.atan2(a.im, a.re) * 180) / Math.PI;
const round4 = (x: number) => Math.round(x * 10000) / 10000;

function derive(p: Pair) {
  const I_L1 = fromPolar(p.I_L1_mag, p.I_L1_ang);
  const I_C = fromPolar(p.I_C_mag, p.I_C_ang);
  // jωL, 1/(jωC) — 임피던스
  const jwL1 = { re: 0, im: p.omega * p.L1 };
  const jwL2 = { re: 0, im: p.omega * p.L2 };
  // C 임피던스: 1/(jωC). 또는 -j/(ωC).
  const Z_C = { re: 0, im: -1 / (p.omega * p.C) };

  // [1] V_C = I_C · Z_C (페이저 — C 양단에 흐르는 전류와 임피던스)
  //   더 직관: V_C = I_C / (jωC) = I_C · (-j/(ωC)) = I_C · Z_C
  const V_C = cMul(I_C, Z_C);

  // [2] I_L2 = V_C / (jωL_2)
  const I_L2 = cDiv(V_C, jwL2);
  // I_R = V_C / R
  const I_R = { re: V_C.re / p.R, im: V_C.im / p.R };
  // KCL at N_R: I_S(들어오는) = I_L2 + I_R + I_C
  const I_S = cAdd(cAdd(I_L2, I_R), I_C);

  // [3] KCL at N_L: I_R1(들어오는, V_s에서) = I_L1 + I_S(N_R로 나감)
  const I_R1 = cAdd(I_L1, I_S);

  return {
    V_C, I_L2, I_R, I_S, I_R1,
  };
}

// 원본 임용 5번 페어 + 변형.
const RAW_PAIRS: Pair[] = [
  // 원본: ω=10, R_top=20, L1=1, L2=0.1, R=1, C=0.1, I_L1=20∠-90°, I_C=20∠90°
  // → V_C=20∠0°, I_L2=20∠-90°, I_R=20∠0°, I_S=20∠0°, I_R1=20√2∠-45°
  { omega: 10, R_top: 20, L1: 1, L2: 0.1, R: 1, C: 0.1, I_L1_mag: 20, I_L1_ang: -90, I_C_mag: 20, I_C_ang: 90 },
  // 변형 1: 다른 phasor angle
  { omega: 10, R_top: 10, L1: 1, L2: 0.5, R: 2, C: 0.05, I_L1_mag: 10, I_L1_ang: -90, I_C_mag: 10, I_C_ang: 90 },
  // 변형 2: ω 변경
  { omega: 5, R_top: 20, L1: 2, L2: 0.4, R: 1, C: 0.1, I_L1_mag: 10, I_L1_ang: -90, I_C_mag: 10, I_C_ang: 90 },
];

const PAIRS = RAW_PAIRS;

export function generateAcParallelBranches(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): AcParallelBranchesGeneration {
  const rand = makeRand(args.seed);
  const p = pick(PAIRS, rand);
  const d = derive(p);

  const components: CircuitComponent[] = [
    {
      id: "V_s", type: "V", value: "V_s (AC)",
      pins: [
        { id: "p", node: "VS_top", side: "top" },
        { id: "n", node: "GND",    side: "bottom" },
      ],
    },
    {
      id: "R_top", type: "R", value: `${p.R_top}Ω`,
      pins: [
        { id: "p", node: "VS_top", side: "left" },
        { id: "n", node: "N_L",    side: "right" },
      ],
    },
    {
      id: "L_1", type: "L", value: `${fmt(p.L1)}H`,
      pins: [
        { id: "p", node: "N_L", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    // I_S: N_L → N_R (top horizontal current source)
    {
      id: "I_S", type: "I", value: "I_S (?)",
      pins: [
        { id: "p", node: "N_R", side: "right" },
        { id: "n", node: "N_L", side: "left" },
      ],
    },
    {
      id: "L_2", type: "L", value: `${fmt(p.L2)}H`,
      pins: [
        { id: "p", node: "N_R", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "R", type: "R", value: `${p.R}Ω`,
      pins: [
        { id: "p", node: "N_R", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "C", type: "C", value: `${fmt(p.C)}F`,
      pins: [
        { id: "p", node: "N_R", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
  ];

  const nodeAnnotations: NodeAnnotation[] = [
    { node: "N_R", label: "v_C(+)", style: "label_only" },
  ];

  const measurementMarks: MeasurementMark[] = [
    { kind: "voltage", refs: ["N_R", "GND"], label: "V_C" },
    { kind: "current", refs: ["R_top"], label: "I_R1" },
    { kind: "current", refs: ["L_1"], label: `I_L1 = ${p.I_L1_mag}∠${p.I_L1_ang}°` },
    { kind: "current", refs: ["L_2"], label: "I_L2" },
    { kind: "current", refs: ["C"], label: `I_C = ${p.I_C_mag}∠${p.I_C_ang}°` },
  ];

  return {
    netlist: { components, ground: "GND", nodeAnnotations, measurementMarks },
    values: {
      omega: p.omega,
      R_top: p.R_top, L1: p.L1, L2: p.L2, R: p.R, C: p.C,
      I_L1_mag: p.I_L1_mag, I_L1_ang: p.I_L1_ang,
      I_C_mag: p.I_C_mag, I_C_ang: p.I_C_ang,
      V_C_mag: round4(cMag(d.V_C)), V_C_ang: round4(cAng(d.V_C)),
      I_L2_mag: round4(cMag(d.I_L2)), I_L2_ang: round4(cAng(d.I_L2)),
      I_R_mag: round4(cMag(d.I_R)), I_R_ang: round4(cAng(d.I_R)),
      I_S_mag: round4(cMag(d.I_S)), I_S_ang: round4(cAng(d.I_S)),
      I_R1_mag: round4(cMag(d.I_R1)), I_R1_ang: round4(cAng(d.I_R1)),
    },
  };
}

function fmt(x: number): string {
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  for (const denom of [2, 4, 5, 10]) {
    const numer = Math.round(x * denom);
    if (numer > 0 && Math.abs(x - numer / denom) < 1e-9) return `${numer}/${denom}`;
  }
  return String(Math.round(x * 1000) / 1000);
}
