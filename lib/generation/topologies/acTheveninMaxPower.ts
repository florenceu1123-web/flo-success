import type { CircuitComponent, CircuitNetlist, MeasurementMark, NodeAnnotation } from "@/types";
import { solveComplexMna, type ComplexSolverNetwork } from "@/lib/solver/complexMna";
import type { Complex } from "@/lib/solver/complex";
import { makeRand, pick } from "./_helpers";

/**
 * 2개의 교류 전원(전압원 + 전류원) + RLC + 부하 R_L 최대 평균 전력 (임용 10번 형식) archetype.
 *
 * 구조 (부하 단자 A-GND 에 두 전원망이 병렬):
 *   ┌─ V망: GND ─[V]─ e ─[R1]─ m ─[L1]─ A,  m ─[C1]─ GND
 *   ├─ I망: GND ─[I]─ p ─[R2]─ A,           p ─[C2]─ GND
 *   └─ 부하: A ─[R_L]─ GND
 *
 * 해석 절차:
 *   [단계 1] 단자 A-GND 에서 본 테브난 등가 임피던스 Z_th  (전원 비활성: V 단락 / I 개방)
 *   [단계 2] 단자 A-GND 에서 본 테브난 등가 전압 V_th       (R_L 개방, 중첩)
 *   [단계 3] 저항성 부하 최대전력: R_L = |Z_th|, P_max = |V_th|²·R_L / (2·|Z_th+R_L|²)
 *
 * ★ 임피던스 규약: solver omega=1, 인덕터 L=X(→ jX), 커패시터 C=1/X(→ −jX).
 *   답은 solver(복소 MNA)로 계산 — 손계산 없이 결정론·정확.
 */

export type AcTheveninMaxPowerGeneration = {
  netlist: CircuitNetlist;
  values: {
    VsLabel: string; Vs: number;          // 전압원 진폭(peak) [V]
    IsLabel: string; Is: number;          // 전류원 진폭(peak) [A]
    R1: number; XL1: number; XC1: number; // V망 소자 (Ω)
    R2: number; XC2: number; XL2: number; // I망 소자 (Ω) — R∥L + 직렬 C
  };
  solution: {
    ZthLabel: string;   // 예: "50 + j0 Ω"
    Zth: { re: number; im: number };
    ZthMag: number;
    VthLabel: string;   // 예: "5√2∠-45° V" 또는 "(2 - j3) V"
    Vth: { re: number; im: number };
    VthMag: number;
    RL: number;         // = |Z_th|
    Pmax: number;       // [W]
    PmaxLabel: string;
  };
};

// ── 복소수 헬퍼 ──
const C = {
  add: (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im }),
  abs: (a: Complex): number => Math.hypot(a.re, a.im),
};

/** 후보 값 세트 — solver로 사전 검증해 정수 |Z_th|(=R_L)·깔끔한 Z_th를 주는 조합만 수록.
 *   I망 = R2∥L2 + 직렬 C2 (원본처럼 C·R·L 모두 존재). XC2가 직렬 캡(전원 경로). */
type ParamSet = { R1: number; XL1: number; XC1: number; R2: number; XL2: number; XC2: number };
const PARAM_SETS: ParamSet[] = [
  { R1: 100, XL1: 100, XC1: 50, R2: 50, XL2: 100, XC2: 100 },  // Z_th=12+j16 → R_L=20
  { R1: 200, XL1: 200, XC1: 100, R2: 100, XL2: 200, XC2: 100 }, // Z_th=24+j32 → R_L=40
  { R1: 200, XL1: 100, XC1: 200, R2: 100, XL2: 100, XC2: 100 }, // Z_th=12+j16 → R_L=20
  { R1: 50, XL1: 150, XC1: 50, R2: 50, XL2: 50, XC2: 150 },     // Z_th=10+j15 → R_L=18
  { R1: 100, XL1: 100, XC1: 50, R2: 50, XL2: 100, XC2: 200 },   // Z_th=12+j16 → R_L=20
  { R1: 100, XL1: 50, XC1: 100, R2: 100, XL2: 100, XC2: 50 },   // 원본 값 (Z_th=30+j10)
];
const VS_CANDIDATES = [10, 20, 12, 8, 15, 5];
const IS_CANDIDATES = [0.1, 0.2, 0.05, 0.04];

const N_A = "n_a";       // 부하 상단 단자 a (= I망 출력 c)
const N_E = "n_e";       // V원 상단
const N_M = "n_m";       // V망 중간 노드
const N_P = "n_p";       // I원 ↔ 직렬 C 사이
const GND = "GND";

/** solver 네트워크 빌드 (omega=1, L=X, C=1/X). opts로 전원/부하 비활성·test source 제어. */
function buildNet(
  p: ParamSet,
  Vs: Complex, Is: Complex,
  opts: { sourcesOff?: boolean; loadR?: number | null; testAtA?: boolean },
): ComplexSolverNetwork {
  const nodeIds = [N_A, N_E, N_M, N_P, GND];
  const resistors = [
    { id: "R1", a: N_E, b: N_M, R: p.R1 },   // V망 직렬 R
    { id: "R2", a: N_A, b: GND, R: p.R2 },   // I망 R (A↔GND, L과 병렬)
  ];
  if (opts.loadR != null) resistors.push({ id: "R_L", a: N_A, b: GND, R: opts.loadR });
  const inductors = [
    { id: "L1", a: N_M, b: N_A, L: p.XL1 },  // V망 직렬 L (m→a)
    { id: "L2", a: N_A, b: GND, L: p.XL2 },  // I망 L (A↔GND, R과 병렬)
  ];
  const capacitors = [
    { id: "C1", a: N_M, b: GND, C: 1 / p.XC1 },   // V망 shunt C
    { id: "C2", a: N_P, b: N_A, C: 1 / p.XC2 },   // I망 직렬 C (p→a)
  ];
  const vsources = opts.sourcesOff
    ? [{ id: "V1", a: N_E, b: GND, V: { re: 0, im: 0 } as Complex }]   // 단락
    : [{ id: "V1", a: N_E, b: GND, V: Vs }];
  const isources: ComplexSolverNetwork["isources"] = [];
  if (!opts.sourcesOff) isources.push({ id: "I1", a: GND, b: N_P, I: Is });
  if (opts.testAtA) isources.push({ id: "Itest", a: GND, b: N_A, I: { re: 1, im: 0 } });
  return { nodeIds, groundId: GND, omega: 1, resistors, inductors, capacitors, vsources, isources };
}

function round(x: number, d = 3): number {
  const f = Math.pow(10, d);
  return Math.round(x * f) / f;
}

/** 복소 임피던스/전압 라벨 — 가까운 정수면 정수, 허수부 0이면 실수만. */
function complexLabel(z: Complex, unit: string): string {
  const re = round(z.re, 2);
  const im = round(z.im, 2);
  if (Math.abs(im) < 0.05) return `${round(re, 1)} ${unit}`;
  if (Math.abs(re) < 0.05) return `j${round(im, 1)} ${unit}`.replace("j-", "−j");
  const imPart = im >= 0 ? `+ j${round(im, 1)}` : `− j${round(-im, 1)}`;
  return `${round(re, 1)} ${imPart} ${unit}`;
}

function isNice(x: number): boolean {
  return Math.abs(x - Math.round(x)) < 0.02 || Math.abs(x * 2 - Math.round(x * 2)) < 0.02;
}

export function generateAcTheveninMaxPower(args: { seed?: number }): AcTheveninMaxPowerGeneration {
  const rand = makeRand(args.seed);

  type Cand = { p: typeof PARAM_SETS[number]; Vs: number; Is: number; score: number; sol: AcTheveninMaxPowerGeneration["solution"] };
  const cands: Cand[] = [];

  for (const p of PARAM_SETS) {
    for (const Vs of VS_CANDIDATES) {
      for (const Is of IS_CANDIDATES) {
        const VsC: Complex = { re: Vs, im: 0 };
        const IsC: Complex = { re: Is, im: 0 };
        try {
          // Z_th — 전원 off + A에 1A test → V_A = Z_th
          const zNet = buildNet(p, VsC, IsC, { sourcesOff: true, loadR: null, testAtA: true });
          const zSol = solveComplexMna(zNet);
          const Zth = zSol.nodeVoltages[N_A];
          // V_th — R_L 개방, 전원 on → V_A
          const vNet = buildNet(p, VsC, IsC, { loadR: null });
          const vSol = solveComplexMna(vNet);
          const Vth = vSol.nodeVoltages[N_A];

          const ZthMag = C.abs(Zth);
          const VthMag = C.abs(Vth);
          const RL = ZthMag;
          // 저항성 부하 최대전력: I = V_th/(Z_th+R_L), P = |I|²·R_L/2 (peak phasor)
          const denom = C.add(Zth, { re: RL, im: 0 });
          const Imag2 = (VthMag * VthMag) / (denom.re * denom.re + denom.im * denom.im);
          const Pmax = (Imag2 * RL) / 2;

          // niceness score — R_L 정수 최우선, P_max·V_th nice, reactance 있으면 가산(더 풍부한 문제).
          let score = 0;
          if (isNice(RL)) score += 3;
          if (isNice(round(Pmax * 1000, 1))) score += 2;          // mW 단위 nice
          if (isNice(VthMag) || isNice(VthMag * Math.SQRT2) || isNice(VthMag * 10)) score += 1;
          if (Math.abs(Zth.im) > 1) score += 1;                    // 리액턴스 있는 Z_th 선호
          if (RL >= 20 && RL <= 300) score += 1;

          const sol: AcTheveninMaxPowerGeneration["solution"] = {
            ZthLabel: complexLabel(Zth, "Ω"), Zth: { re: round(Zth.re, 3), im: round(Zth.im, 3) }, ZthMag: round(ZthMag, 3),
            VthLabel: complexLabel(Vth, "V"), Vth: { re: round(Vth.re, 3), im: round(Vth.im, 3) }, VthMag: round(VthMag, 3),
            RL: round(RL, 2), Pmax: round(Pmax, 5),
            PmaxLabel: Pmax >= 1 ? `${round(Pmax, 3)} W` : `${round(Pmax * 1000, 2)} mW`,
          };
          if (isNice(RL)) cands.push({ p, Vs, Is, score, sol }); // R_L 정수인 것만 후보
        } catch { /* singular — skip */ }
      }
    }
  }
  if (cands.length === 0) throw new Error("acTheveninMaxPower: 유효한 값 세트를 찾지 못했습니다");

  // 상위 점수 tier에서 seed로 선택 (다양성 + nice).
  const maxScore = Math.max(...cands.map((c) => c.score));
  const top = cands.filter((c) => c.score >= maxScore - 1);
  const { p, Vs, Is, sol } = pick(top, rand);

  // ── netlist (전용 렌더러용) ──
  const components: CircuitComponent[] = [
    { id: "V1", type: "V", value: `${Vs}∠0°V`, pins: [{ id: "p", node: N_E, side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "R_top", type: "R", value: `${p.R1}Ω`, pins: [{ id: "p", node: N_E, side: "left" }, { id: "n", node: N_M, side: "right" }] },
    { id: "L_s", type: "L", value: `j${p.XL1}Ω`, pins: [{ id: "p", node: N_M, side: "left" }, { id: "n", node: N_A, side: "right" }] },
    { id: "C_v", type: "C", value: `-j${p.XC1}Ω`, pins: [{ id: "p", node: N_M, side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "I1", type: "I", value: `${Is}∠0°A`, pins: [{ id: "p", node: GND, side: "bottom" }, { id: "n", node: N_P, side: "top" }] },
    { id: "C_i", type: "C", value: `-j${p.XC2}Ω`, pins: [{ id: "p", node: N_P, side: "left" }, { id: "n", node: N_A, side: "right" }] },
    { id: "R_i", type: "R", value: `${p.R2}Ω`, pins: [{ id: "p", node: N_A, side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "L_i", type: "L", value: `j${p.XL2}Ω`, pins: [{ id: "p", node: N_A, side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "R_L", type: "R", value: "R_L", pins: [{ id: "p", node: N_A, side: "top" }, { id: "n", node: GND, side: "bottom" }] },
  ];
  const nodeAnnotations: NodeAnnotation[] = [
    { node: N_A, label: "a", style: "terminal_dot", role: "main_unknown" },
  ];
  const measurementMarks: MeasurementMark[] = [];

  return {
    netlist: { components, ground: GND, nodeAnnotations, measurementMarks, positions: {} },
    values: {
      VsLabel: `${Vs}∠0°V`, Vs, IsLabel: `${Is}∠0°A`, Is,
      R1: p.R1, XL1: p.XL1, XC1: p.XC1, R2: p.R2, XC2: p.XC2, XL2: p.XL2,
    },
    solution: sol,
  };
}
