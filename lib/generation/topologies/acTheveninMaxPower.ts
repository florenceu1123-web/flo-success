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

/**
 * ★★ 토폴로지 2종 (2026-08-01, 사용자 요청) ─────────────────────────────
 *   "original" — **원본(임용 11번)과 같은 구조**. 유사유형(exam_similar)이 쓴다.
 *        I ↑ ∥ [V + R_s] ─┬─ jX_L ─ R_top ─ a ─┬─ −jX_C ─ b
 *                          └──────────────────  b     └─ R_L ─ b
 *        Z_th = (R_s + R_top + jX_L) ∥ (−jX_C)
 *        원본(V=9∠90°, I=18∠90°, R_s=0.25, X_L=3, R_top=2, X_C=3)
 *          → Z_th = 4 − j3, V_th = 18∠0°, R_L = |Z_th| = 5Ω, P_max = 9W  (손계산·MNA 일치)
 *
 *   "two_branch" — 두 전원망이 단자에서 병렬인 구조. 변형유형(exam_variant)이 쓴다.
 *        (사용자가 "굉장히 잘 만들었다"고 한 기존 출력이 이쪽이다.)
 *
 *   ※ 유사 = 회로·문항 동일 + 수치만 변경이라는 이 프로젝트의 모드 정의에 맞추려면
 *     유사유형이 **원본 토폴로지**여야 한다. 이전에는 두 모드가 같은(two_branch) 구조였다.
 */
export type AcTheveninTopology = "original" | "two_branch";

export type AcTheveninMaxPowerGeneration = {
  topology: AcTheveninTopology;
  netlist: CircuitNetlist;
  values: {
    VsLabel: string; Vs: number;          // 전압원 진폭(peak) [V]
    IsLabel: string; Is: number;          // 전류원 진폭(peak) [A]
    R1: number; XL1: number; XC1: number; // V망 소자 (Ω)
    R2: number; XC2: number; XL2: number; // I망 소자 (Ω) — R∥L + 직렬 C
    /** original 토폴로지 전용 — 전압원 직렬 저항 R_s */
    Rs?: number;
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
// ★★ 주의 (2026-08-01): 아래 주석의 Z_th 값들은 **complexMna의 접지 버그가 있던 시절**에
//   계산된 것이라 지금은 맞지 않는다(당시 절대 노드 전압이 접지 전위만큼 어긋났다).
//   그래서 값은 하드코딩하지 않고 **매번 solver로 계산해 필터**한다 — 아래는 후보 격자일 뿐이다.
//   ★ 격자를 넓게 두고 "R_L 정수 + P_max 깔끔"인 조합만 남긴다(solver가 진실 공급원).
const PARAM_SETS: ParamSet[] = (() => {
  const out: ParamSet[] = [];
  const Rs = [50, 100, 150, 200];
  const Xs = [50, 100, 150, 200];
  for (const R1 of Rs) for (const XL1 of Xs) for (const XC1 of Xs) for (const R2 of Rs) for (const XL2 of Xs) for (const XC2 of Xs) {
    out.push({ R1, XL1, XC1, R2, XL2, XC2 });
  }
  return out;
})();
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

// =====================================================================
// original 토폴로지 (임용 11번 원본) — 유사유형용
// =====================================================================
const N1 = "n_1";        // 좌측 상단 접합 (I 상단 = V 브랜치 상단 = 상단 rail 시작)
const N_V = "n_v";       // V원 − 단자 ↔ R_s 사이
const N_M2 = "n_m2";     // jX_L ↔ R_top 사이

type OrigParam = { Rs: number; Rtop: number; XL: number; XC: number };

/** original 토폴로지 solver 네트워크. */
function buildOrigNet(
  p: OrigParam,
  Vs: Complex, Is: Complex,
  opts: { sourcesOff?: boolean; loadR?: number | null; testAtA?: boolean },
): ComplexSolverNetwork {
  const nodeIds = [N_A, N1, N_V, N_M2, GND];
  const resistors = [
    { id: "R_s", a: N_V, b: GND, R: p.Rs },        // V원 직렬 저항 (아래)
    { id: "R_top", a: N_M2, b: N_A, R: p.Rtop },   // 상단 직렬 R
  ];
  if (opts.loadR != null) resistors.push({ id: "R_L", a: N_A, b: GND, R: opts.loadR });
  const inductors = [{ id: "L_top", a: N1, b: N_M2, L: p.XL }];   // 상단 직렬 L (jX_L)
  const capacitors = [{ id: "C_a", a: N_A, b: GND, C: 1 / p.XC }]; // 단자 병렬 C (−jX_C)
  // V원: + 가 N1 쪽(위) → V(N1) − V(N_V) = Vs. 전원 off면 단락(V=0).
  const vsources = [{ id: "V1", a: N1, b: N_V, V: opts.sourcesOff ? ({ re: 0, im: 0 } as Complex) : Vs }];
  const isources: ComplexSolverNetwork["isources"] = [];
  if (!opts.sourcesOff) isources.push({ id: "I1", a: GND, b: N1, I: Is }); // 아래→위(N1으로 유입)
  if (opts.testAtA) isources.push({ id: "Itest", a: GND, b: N_A, I: { re: 1, im: 0 } });
  return { nodeIds, groundId: GND, omega: 1, resistors, inductors, capacitors, vsources, isources };
}

const ORIG_RS = [0.25, 0.5, 1, 2, 4];
const ORIG_RTOP = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16];
const ORIG_X = [3, 4, 5, 6, 8, 9, 12, 15];
const ORIG_VS = [6, 9, 12, 15, 18];
const ORIG_IS = [6, 9, 12, 18, 24];

/** 원본 튜플(그대로 재생성 금지). */
function isOriginalTuple(p: OrigParam, Vs: number, Is: number): boolean {
  return p.Rs === 0.25 && p.Rtop === 2 && p.XL === 3 && p.XC === 3 && Vs === 9 && Is === 18;
}

function generateOriginalTopology(rand: () => number): AcTheveninMaxPowerGeneration {
  type Cand = { p: OrigParam; Vs: number; Is: number; score: number; sol: AcTheveninMaxPowerGeneration["solution"] };
  const cands: Cand[] = [];

  // ① Z_th는 전원과 무관 — 소자 조합만 먼저 훑어 |Z_th| 정수인 것만 남긴다(탐색량 축소).
  const zOk: Array<{ p: OrigParam; Zth: Complex; ZthMag: number }> = [];
  for (const Rs of ORIG_RS) for (const Rtop of ORIG_RTOP) for (const XL of ORIG_X) for (const XC of ORIG_X) {
    const p: OrigParam = { Rs, Rtop, XL, XC };
    try {
      const zSol = solveComplexMna(buildOrigNet(p, { re: 0, im: 0 }, { re: 0, im: 0 }, { sourcesOff: true, loadR: null, testAtA: true }));
      const Zth = zSol.nodeVoltages[N_A];
      const ZthMag = C.abs(Zth);
      // Z_th 실수부·허수부·크기가 모두 깔끔해야 손으로 풀리는 문제가 된다.
      if (!isNice(Zth.re) || !isNice(Zth.im) || !isNice(ZthMag)) continue;
      if (ZthMag < 3 || ZthMag > 60) continue;
      if (Math.abs(Zth.im) < 0.5) continue;   // 리액턴스 없는 Z_th는 문제가 싱거워진다
      zOk.push({ p, Zth, ZthMag });
    } catch { /* singular — skip */ }
  }

  // ② 살아남은 소자 조합에 대해서만 전원을 훑는다.
  for (const { p, Zth, ZthMag } of zOk) {
    for (const Vm of ORIG_VS) for (const Im of ORIG_IS) {
      if (isOriginalTuple(p, Vm, Im)) continue;
      // 원본과 같이 두 전원 모두 ∠90°.
      const VsC: Complex = { re: 0, im: Vm };
      const IsC: Complex = { re: 0, im: Im };
      try {
        const Vth = solveComplexMna(buildOrigNet(p, VsC, IsC, { loadR: null })).nodeVoltages[N_A];
        const VthMag = C.abs(Vth);
        if (VthMag < 1) continue;
        const RL = ZthMag;
        const denom = C.add(Zth, { re: RL, im: 0 });
        const Pmax = ((VthMag * VthMag) / (denom.re * denom.re + denom.im * denom.im)) * RL / 2;
        if (!isNice(Pmax) || Pmax < 0.5 || Pmax > 500) continue;   // P_max가 깔끔한 것만

        let score = 0;
        if (Math.abs(Pmax - Math.round(Pmax)) < 0.02) score += 3;          // P_max 정수
        if (isNice(VthMag)) score += 2;
        if (Math.abs(Vth.re) < 0.05 || Math.abs(Vth.im) < 0.05) score += 1; // V_th가 순실수/순허수면 읽기 쉽다
        if (p.Rs < 1) score += 1;                                           // 원본처럼 작은 직렬 저항 선호

        cands.push({
          p, Vs: Vm, Is: Im, score,
          sol: {
            ZthLabel: complexLabel(Zth, "Ω"), Zth: { re: round(Zth.re, 3), im: round(Zth.im, 3) }, ZthMag: round(ZthMag, 3),
            VthLabel: complexLabel(Vth, "V"), Vth: { re: round(Vth.re, 3), im: round(Vth.im, 3) }, VthMag: round(VthMag, 3),
            RL: round(RL, 2), Pmax: round(Pmax, 5),
            PmaxLabel: Pmax >= 1 ? `${round(Pmax, 3)} W` : `${round(Pmax * 1000, 2)} mW`,
          },
        });
      } catch { /* singular — skip */ }
    }
  }
  if (cands.length === 0) throw new Error("acTheveninMaxPower(original): 유효한 값 세트를 찾지 못했습니다");

  const maxScore = Math.max(...cands.map((c) => c.score));
  const top = cands.filter((c) => c.score >= maxScore - 1);
  const { p, Vs, Is, sol } = pick(top, rand);

  const components: CircuitComponent[] = [
    { id: "I1", type: "I", value: `${Is}∠90°A`, pins: [{ id: "p", node: GND, side: "bottom" }, { id: "n", node: N1, side: "top" }] },
    { id: "V1", type: "V", value: `${Vs}∠90°V`, pins: [{ id: "p", node: N1, side: "top" }, { id: "n", node: N_V, side: "bottom" }] },
    { id: "R_s", type: "R", value: `${p.Rs}Ω`, pins: [{ id: "p", node: N_V, side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "L_top", type: "L", value: `j${p.XL}Ω`, pins: [{ id: "p", node: N1, side: "left" }, { id: "n", node: N_M2, side: "right" }] },
    { id: "R_top", type: "R", value: `${p.Rtop}Ω`, pins: [{ id: "p", node: N_M2, side: "left" }, { id: "n", node: N_A, side: "right" }] },
    { id: "C_a", type: "C", value: `-j${p.XC}Ω`, pins: [{ id: "p", node: N_A, side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "R_L", type: "R", value: "R_L", pins: [{ id: "p", node: N_A, side: "top" }, { id: "n", node: GND, side: "bottom" }] },
  ];
  return {
    topology: "original",
    netlist: {
      components, ground: GND,
      nodeAnnotations: [{ node: N_A, label: "a", style: "terminal_dot", role: "main_unknown" }],
      measurementMarks: [], positions: {},
    },
    values: {
      VsLabel: `${Vs}∠90°V`, Vs, IsLabel: `${Is}∠90°A`, Is,
      R1: p.Rtop, XL1: p.XL, XC1: p.XC, R2: p.Rtop, XC2: p.XC, XL2: p.XL, Rs: p.Rs,
    },
    solution: sol,
  };
}

export function generateAcTheveninMaxPower(args: { seed?: number; mode?: string }): AcTheveninMaxPowerGeneration {
  const rand = makeRand(args.seed);
  // ★ 유사유형 = 원본과 같은 토폴로지 / 변형유형 = 두 전원망 병렬 구조 (사용자 지정, 2026-08-01).
  if (args.mode !== "exam_variant") return generateOriginalTopology(rand);

  type Cand = { p: typeof PARAM_SETS[number]; Vs: number; Is: number; score: number; sol: AcTheveninMaxPowerGeneration["solution"] };
  const cands: Cand[] = [];

  // ① Z_th는 전원과 무관 — 소자 조합을 먼저 훑어 **R_L(=|Z_th|)이 정수**인 것만 남긴다.
  //    (탐색량 축소 + 값 품질. 예전엔 .5까지 허용해 R_L=28.5 같은 답이 나왔다 — 실측.)
  const zOkTwo: Array<{ p: ParamSet; Zth: Complex; ZthMag: number }> = [];
  for (const p of PARAM_SETS) {
    try {
      const Zth = solveComplexMna(buildNet(p, { re: 0, im: 0 }, { re: 0, im: 0 }, { sourcesOff: true, loadR: null, testAtA: true })).nodeVoltages[N_A];
      const ZthMag = C.abs(Zth);
      if (Math.abs(ZthMag - Math.round(ZthMag)) > 0.02) continue;
      if (ZthMag < 10 || ZthMag > 400) continue;
      if (Math.abs(Zth.im) < 1) continue;                       // 리액턴스 있는 Z_th 선호
      if (!isNice(Zth.re) || !isNice(Zth.im)) continue;
      zOkTwo.push({ p, Zth, ZthMag });
    } catch { /* singular — skip */ }
  }

  for (const { p, Zth, ZthMag } of zOkTwo) {
    for (const Vs of VS_CANDIDATES) {
      for (const Is of IS_CANDIDATES) {
        const VsC: Complex = { re: Vs, im: 0 };
        const IsC: Complex = { re: Is, im: 0 };
        try {
          // V_th — R_L 개방, 전원 on → V_A
          const vNet = buildNet(p, VsC, IsC, { loadR: null });
          const vSol = solveComplexMna(vNet);
          const Vth = vSol.nodeVoltages[N_A];

          const VthMag = C.abs(Vth);
          const RL = ZthMag;
          // 저항성 부하 최대전력: I = V_th/(Z_th+R_L), P = |I|²·R_L/2 (peak phasor)
          const denom = C.add(Zth, { re: RL, im: 0 });
          const Imag2 = (VthMag * VthMag) / (denom.re * denom.re + denom.im * denom.im);
          const Pmax = (Imag2 * RL) / 2;

          // P_max가 지저분하면(mW 단위로도 안 떨어지면) 후보에서 뺀다 — 답 품질.
          const PmW = Pmax * 1000;
          if (Math.abs(PmW - Math.round(PmW)) > 0.02 && Math.abs(PmW * 2 - Math.round(PmW * 2)) > 0.02) continue;

          // niceness score — P_max 정수(mW)·V_th nice·리액턴스 있는 Z_th 선호.
          let score = 0;
          if (Math.abs(PmW - Math.round(PmW)) < 0.02) score += 3;
          if (isNice(VthMag) || isNice(VthMag * Math.SQRT2) || isNice(VthMag * 10)) score += 2;
          if (Math.abs(Zth.im) > 1) score += 1;                    // 리액턴스 있는 Z_th 선호
          if (RL >= 20 && RL <= 300) score += 1;

          const sol: AcTheveninMaxPowerGeneration["solution"] = {
            ZthLabel: complexLabel(Zth, "Ω"), Zth: { re: round(Zth.re, 3), im: round(Zth.im, 3) }, ZthMag: round(ZthMag, 3),
            VthLabel: complexLabel(Vth, "V"), Vth: { re: round(Vth.re, 3), im: round(Vth.im, 3) }, VthMag: round(VthMag, 3),
            RL: round(RL, 2), Pmax: round(Pmax, 5),
            PmaxLabel: Pmax >= 1 ? `${round(Pmax, 3)} W` : `${round(Pmax * 1000, 2)} mW`,
          };
          cands.push({ p, Vs, Is, score, sol });   // R_L 정수는 ①에서 이미 보장됨
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
    topology: "two_branch",
    netlist: { components, ground: GND, nodeAnnotations, measurementMarks, positions: {} },
    values: {
      VsLabel: `${Vs}∠0°V`, Vs, IsLabel: `${Is}∠0°A`, Is,
      R1: p.R1, XL1: p.XL1, XC1: p.XC1, R2: p.R2, XC2: p.XC2, XL2: p.XL2,
    },
    solution: sol,
  };
}
