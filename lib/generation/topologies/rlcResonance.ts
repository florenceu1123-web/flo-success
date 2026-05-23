import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  NodeAnnotation,
  MeasurementMark,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * RLC 직렬/병렬 공진 + 주파수응답 generator (임용 9번 형식).
 *
 *  series (단일 loop):
 *    ┌── R ── L ── C ──┐
 *    │                 │
 *    V_s              GND
 *
 *  parallel:
 *    V_s ── (R ∥ L ∥ C) ── GND
 *
 *  ★ 출제 패턴 (원본 임용 9번 그대로):
 *    - 그래프 (나)에 **비공진 주파수 f_x[Hz]에서의 진폭 I_x[A]** 가 표시됨.
 *    - I_max와 f_0는 그래프에 라벨로만 표시 (수치 없음).
 *    - [단계 1] (f_x, I_x) 점 정보로 학생이 C 정전용량 + i(t) 도출.
 *      ↳ −3dB point 조건: |Z(jω_x)| = R·√2 → X = ω_xL − 1/(ω_xC) = ±R → C 도출.
 *    - [단계 2] 도출된 C로 I_max = V_peak/R, f_0 = 1/(2π√(LC)) 도출.
 *
 *  ★ 값 선택 전략 (모든 출력이 nice 표기되도록 사전 페어):
 *    (ω_x, L, R) 페어 — ω_x·L > R 강제 (inductive case, "C는 X[μF]보다 크다" 단서 만족용)
 *    V_rms 별도 선택 — I_x = V_rms·√2 / (R·√2) = V_rms/R 이 nice 소수
 *    C = 1/(ω_x · (ω_x·L − R))  (-3dB inductive case)
 *    ω_0 = 1/√(LC),  f_0 = ω_0/(2π)
 *    I_max(peak) = V_peak/R = V_rms·√2/R,  I_x(peak) = V_peak/(R·√2) = V_rms/R
 */

export type RlcResonanceTopology = "series" | "parallel";

export type RlcResonanceGeneration = {
  topology: RlcResonanceTopology;
  netlist: CircuitNetlist;
  values: {
    // ─── 출제에 표시되는 값 (회로/문제 본문) ──────────
    /** V_peak (cos amplitude). v(t) = V_peak·cos(ωt) [V]. */
    Vpeak: number;
    /** V_peak 라벨 (e.g. "10√2"). */
    VpeakLabel: string;
    /** V_rms = V_peak/√2 (정수). */
    Vrms: number;
    /** 저항 (Ω). */
    R: number;
    /** R 라벨 (e.g. "1kΩ"). */
    Rlabel: string;
    /** L [H]. */
    L: number;
    /** L 라벨 (e.g. "2H", "100mH"). */
    Llabel: string;
    /** "C는 X[μF]보다 크다" 단서 (도출 C보다 작은 nice 값). */
    cLowerBoundLabel: string;

    // ─── 그래프 (나)에 표시되는 값 ───────────────────
    /** 그래프에 표시되는 비공진 측정 주파수 ω_x [rad/s] (정수). */
    omegaX: number;
    /** f_x = ω_x/(2π) [Hz]. label: "ω_x/(2π)" 표기 권장. */
    fx: number;
    /** 그래프에 표시되는 (f_x, I_x) 점의 진폭 I_x [A] (peak). nice 소수. */
    Ix: number;

    // ─── 학생이 도출해야 하는 정답 ─────────────────
    /** C [F] — 단계 1의 정답. */
    C: number;
    /** C 라벨 (e.g. "1μF") — 정답 표기. */
    Clabel: string;
    /** ω_0 = 1/√(LC) [rad/s] — 단계 2의 정답. */
    omega0: number;
    /** f_0 = ω_0/(2π) [Hz] — 단계 2의 정답. */
    f0: number;
    /** I_max = V_peak/R [A] (peak) — 단계 2의 정답. */
    Imax: number;
  };
};

// ── (ω_x, L, R) 페어: 모두 정수 표기, ω_x·L > R 강제, C가 합리적 범위 ─
// 검산: C = 1/(ω_x · (ω_x·L − R)). 라벨은 generator가 sec 단위에서 μF/mH로 변환.
type WlrTriple = {
  omegaX: number;       // rad/s
  L: number; Llabel: string;
  R: number; Rlabel: string;
  // 사전계산된 도출값 (sanity check + 라벨 일관성 검증용)
  expected: {
    C_uF: number;       // 도출 C
    omega0: number;     // ω_0
    f0Approx: number;   // f_0 ≈
  };
};

// helper: triple 사전 검증
function makeTriple(omegaX: number, L: number, Llabel: string, R: number, Rlabel: string): WlrTriple {
  const X = omegaX * L - R;       // = 1/(ω_x·C)
  if (X <= 0) throw new Error(`Invalid triple: ω_xL=${omegaX * L} must be > R=${R}`);
  const C = 1 / (omegaX * X);      // [F]
  const omega0 = 1 / Math.sqrt(L * C);
  return {
    omegaX, L, Llabel, R, Rlabel,
    expected: {
      C_uF: C * 1e6,
      omega0,
      f0Approx: omega0 / (2 * Math.PI),
    },
  };
}

// 원본 임용 9번 (ω_x=1000, L=2, R=1k → C=1μF) + 변형 5개.
// C는 0.2~10μF 범위, ω_0/f_0는 자연스러운 값.
const TRIPLES: WlrTriple[] = [
  makeTriple(1000, 2,   "2H",     1000, "1kΩ"),    // C=1μF, f_0≈112.5Hz (원본)
  makeTriple(1000, 4,   "4H",     1000, "1kΩ"),    // C=1/3μF, f_0≈137.8Hz
  makeTriple(500,  2,   "2H",     200,  "200Ω"),   // C=2.5μF
  makeTriple(2000, 1,   "1H",     500,  "500Ω"),   // C=1/3μF
  makeTriple(2000, 0.5, "500mH",  200,  "200Ω"),   // C=1.25μF
  makeTriple(5000, 0.1, "100mH",  100,  "100Ω"),   // C=0.5μF (경계)
  makeTriple(10000, 0.05, "50mH", 200,  "200Ω"),   // C≈0.333μF
  makeTriple(500,  4,   "4H",     500,  "500Ω"),   // C=4/3μF
];

// V_rms·R 페어 — I_x = V_rms/R 가 nice 소수가 되도록.
type VrPair = { Vrms: number; VpeakLabel: string; Vpeak: number };
const V_PRESETS: VrPair[] = [
  { Vrms: 5,   VpeakLabel: "5√2",   Vpeak: 5 * Math.SQRT2 },
  { Vrms: 10,  VpeakLabel: "10√2",  Vpeak: 10 * Math.SQRT2 },
  { Vrms: 20,  VpeakLabel: "20√2",  Vpeak: 20 * Math.SQRT2 },
  { Vrms: 50,  VpeakLabel: "50√2",  Vpeak: 50 * Math.SQRT2 },
  { Vrms: 100, VpeakLabel: "100√2", Vpeak: 100 * Math.SQRT2 },
];

/**
 * RLC 공진 회로 생성. topology는 params.rlcTopology를 따른다.
 */
export function generateRlcResonance(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): RlcResonanceGeneration {
  const rand = makeRand(args.seed);
  const topology: RlcResonanceTopology = args.params?.rlcTopology ?? "series";

  const triple = pick(TRIPLES, rand);
  const vPair = pick(V_PRESETS, rand);

  // C 정확값 (라벨에 사용)
  const C = 1 / (triple.omegaX * (triple.omegaX * triple.L - triple.R));
  const C_uF = C * 1e6;
  const Clabel = formatCapacitanceLabel(C_uF);
  const cLowerBoundLabel = generateCLowerBoundLabel(C_uF);

  // ω_0, f_0
  const omega0 = 1 / Math.sqrt(triple.L * C);
  const f0 = omega0 / (2 * Math.PI);
  const fx = triple.omegaX / (2 * Math.PI);

  // I_x (peak) = V_peak / (R·√2) = V_rms / R (uses |Z|=R√2 at -3dB).
  // I_max (peak) = V_peak / R = V_rms·√2 / R.
  const Ix = vPair.Vrms / triple.R;            // peak 표기 (원본 그래프와 일관)
  const Imax = vPair.Vpeak / triple.R;          // peak

  return {
    topology,
    netlist: buildNetlist(topology, vPair.VpeakLabel, triple.Rlabel, triple.Llabel),
    values: {
      Vpeak: vPair.Vpeak,
      VpeakLabel: vPair.VpeakLabel,
      Vrms: vPair.Vrms,
      R: triple.R,
      Rlabel: triple.Rlabel,
      L: triple.L,
      Llabel: triple.Llabel,
      cLowerBoundLabel,
      omegaX: triple.omegaX,
      fx,
      Ix,
      C,
      Clabel,
      omega0,
      f0,
      Imax,
    },
  };
}

/**
 * C 정답 라벨 — μF 단위로 깔끔하게 표기.
 *  - 정수: "1μF"
 *  - nice 분수: "1/3μF"
 *  - 소수: "0.5μF", "2.5μF"
 */
function formatCapacitanceLabel(C_uF: number): string {
  // 정수 체크
  if (Math.abs(C_uF - Math.round(C_uF)) < 1e-9) return `${Math.round(C_uF)}μF`;
  // 흔한 분수 체크 (1/3, 2/3, 4/3 등)
  for (const denom of [3, 6, 7, 9]) {
    const numer = Math.round(C_uF * denom);
    if (numer > 0 && Math.abs(C_uF - numer / denom) < 1e-9) {
      return `${numer}/${denom}μF`;
    }
  }
  // 소수 — 3째 자리까지
  const rounded = Math.round(C_uF * 1000) / 1000;
  return `${rounded}μF`;
}

/**
 * "C는 X[μF]보다 크다" 단서 라벨 — 도출 C보다 작은 가장 가까운 nice 값.
 */
function generateCLowerBoundLabel(C_uF: number): string {
  const candidates = [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.8, 1, 1.5, 2, 3, 5];
  let chosen = candidates[0];
  for (const c of candidates) {
    if (c < C_uF - 1e-9) chosen = c;
    else break;
  }
  return `${chosen}[μF]`;
}

function buildNetlist(
  topology: RlcResonanceTopology,
  vLabel: string,
  rLabel: string,
  lLabel: string,
): CircuitNetlist {
  const GND = "GND";

  if (topology === "series") {
    // 회로도에서 C는 학생-도출 변수이므로 "C" 라벨로 표시 (수치 없음).
    // ┌── R ── L ── C ──┐  (C 라벨: "C")
    const N_top = "N_top";
    const N_r2l = "N_r2l";
    const N_l2c = "N_l2c";
    const components: CircuitComponent[] = [
      {
        id: "V_s", type: "V", value: vLabel,
        pins: [
          { id: "p", node: N_top, side: "top" },
          { id: "n", node: GND,   side: "bottom" },
        ],
      },
      {
        id: "R", type: "R", value: rLabel,
        pins: [
          { id: "p", node: N_top, side: "left" },
          { id: "n", node: N_r2l, side: "right" },
        ],
      },
      {
        id: "L", type: "L", value: lLabel,
        pins: [
          { id: "p", node: N_r2l, side: "left" },
          { id: "n", node: N_l2c, side: "right" },
        ],
      },
      {
        // C는 학생 도출 변수 — id 라벨 "C"만 표시, value omit해서 중복 방지.
        id: "C", type: "C",
        pins: [
          { id: "p", node: N_l2c, side: "top" },
          { id: "n", node: GND,   side: "bottom" },
        ],
      },
    ];
    const measurementMarks: MeasurementMark[] = [
      { kind: "current", refs: ["R"], label: "i(t)" },
    ];
    const positions: Record<string, { x: number; y: number }> = {
      [GND]:   { x: 320, y: 320 },
      [N_top]: { x: 80,  y: 160 },
      [N_r2l]: { x: 240, y: 160 },
      [N_l2c]: { x: 400, y: 160 },
    };
    return { components, ground: GND, measurementMarks, positions };
  }

  // parallel
  const N_top = "N_top";
  const components: CircuitComponent[] = [
    {
      id: "V_s", type: "V", value: vLabel,
      pins: [
        { id: "p", node: N_top, side: "top" },
        { id: "n", node: GND,   side: "bottom" },
      ],
    },
    {
      id: "R", type: "R", value: rLabel,
      pins: [
        { id: "p", node: N_top, side: "top" },
        { id: "n", node: GND,   side: "bottom" },
      ],
    },
    {
      id: "L", type: "L", value: lLabel,
      pins: [
        { id: "p", node: N_top, side: "top" },
        { id: "n", node: GND,   side: "bottom" },
      ],
    },
    {
      // C는 학생 도출 변수 — id="C"만 표시, value는 omit해서 "C / C" 중복 방지.
      id: "C", type: "C",
      pins: [
        { id: "p", node: N_top, side: "top" },
        { id: "n", node: GND,   side: "bottom" },
      ],
    },
  ];
  // i(t) 라벨은 상단 노드 annotation 하나로만 표시 (이전엔 measurementMarks의 R/V_s 위 빨간 arrow와 중복).
  const nodeAnnotations: NodeAnnotation[] = [
    { node: N_top, label: "i(t)", style: "label_only" },
  ];
  const positions: Record<string, { x: number; y: number }> = {
    [GND]:   { x: 320, y: 320 },
    [N_top]: { x: 320, y: 120 },
  };
  return { components, ground: GND, nodeAnnotations, positions };
}

/**
 * 공진 곡선(I[A] vs f[Hz])용 sample 생성 — Lorentzian 형태.
 *  |I(jω)| = V_peak / |Z(jω)| = V_peak / √(R² + (ωL − 1/(ωC))²)
 */
export function buildResonanceCurveSamples(args: {
  Vpeak: number; R: number; L: number; C: number;
  fMin?: number; fMax?: number; nSamples?: number;
}): Array<{ t: number; v: number }> {
  const { Vpeak, R, L, C } = args;
  const omega0 = 1 / Math.sqrt(L * C);
  const f0 = omega0 / (2 * Math.PI);
  const fMin = args.fMin ?? 0;
  const fMax = args.fMax ?? 3 * f0;
  const N = args.nSamples ?? 120;
  const out: Array<{ t: number; v: number }> = [];
  for (let i = 0; i <= N; i++) {
    const f = fMin + (fMax - fMin) * (i / N);
    if (f <= 0) { out.push({ t: 0, v: 0 }); continue; }
    const omega = 2 * Math.PI * f;
    const X = omega * L - 1 / (omega * C);
    const mag = Vpeak / Math.sqrt(R * R + X * X);
    out.push({ t: f, v: mag });
  }
  return out;
}
