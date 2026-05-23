import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  GenerationMode,
  LoadPlaceholder,
  NodeAnnotation,
  RlcResonanceMaxPowerCircuitDiagram,
} from "@/types";

/**
 * RLC 공진 + Wheatstone 5저항 등가 + R_L 최대전력 generator — 임용 7번 형식.
 *
 *  회로:
 *    v(t) AC ─ [r_S 점선박스, 5R Wheatstone] ─ C ─ R_L(점선) ─ L ─ GND
 *
 *  단계:
 *    [단계 1] 공진 조건 X_L = X_C → C = 1/(ω_0²·L) [μF]
 *    [단계 2] 점선 박스 등가저항 r_S [Ω] (Wheatstone 5R)
 *    [단계 3] 공진 시 R_L = r_S, P_max = V_rms²/(4·R_L) [W]
 *
 *  Wheatstone bridge (5R):
 *    L ── R1 ── TM ── R2 ── R    (top branch)
 *    L ── R3 ── BM ── R4 ── R    (bottom branch)
 *           TM ── R5 ── BM        (middle)
 *
 *  값 선택: 원본 [4,18,12,8,6] ratio를 base로 k 스케일링.
 *    base ratio [2,9,6,4,3] (k=1) → r_S = 4Ω.
 *    k=K → r_S = 4·K.
 */

type Variant = {
  /** Wheatstone 5R 값 [r1, r2, r3, r4, r5] (Ω) */
  R: [number, number, number, number, number];
  /** 도출 r_S [Ω] (base ratio 기준 4·k) */
  rS: number;
  /** ω_0 [rad/s] */
  omega0: number;
  /** ω_0 라벨 (e.g. "10^4") */
  omega0Label: string;
  /** L [H] */
  L: number;
  /** L 라벨 (e.g. "100mH") */
  Llabel: string;
  /** V_peak [V] (입력 진폭) */
  Vpeak: number;
};

const VARIANT_POOL: Variant[] = [
  // V0 — 원본 임용 7번 정확 재현
  { R: [4, 18, 12, 8, 6], rS: 8, omega0: 1e4, omega0Label: "10^4", L: 0.1, Llabel: "100mH", Vpeak: 5 },
  // V1 — k=1, smaller resistors, faster ω_0
  { R: [2, 9, 6, 4, 3], rS: 4, omega0: 2e4, omega0Label: "2×10^4", L: 0.05, Llabel: "50mH", Vpeak: 4 },
  // V2 — k=3
  { R: [6, 27, 18, 12, 9], rS: 12, omega0: 1e4, omega0Label: "10^4", L: 0.2, Llabel: "200mH", Vpeak: 6 },
  // V3 — k=4
  { R: [8, 36, 24, 16, 12], rS: 16, omega0: 1e5, omega0Label: "10^5", L: 0.01, Llabel: "10mH", Vpeak: 8 },
];

export type RlcResonanceMaxPowerGeneration = {
  /** 전용 결정론 layout figure */
  circuitDiagram: RlcResonanceMaxPowerCircuitDiagram;
  /** legacy: analog_netlist (사용 안 함, 호환용) */
  netlist: CircuitNetlist;
  values: {
    Vpeak: number;
    omega0: number;
    omega0Label: string;
    L: number;
    Llabel: string;
    R: [number, number, number, number, number];
    Rlabels: [string, string, string, string, string];
  };
  /** 정답 (3단계) */
  answer: {
    /** [단계 1] C [μF] */
    C_uF: number;
    /** [단계 1] C 라벨 */
    Clabel: string;
    /** [단계 2] r_S [Ω] */
    rS: number;
    /** [단계 3] R_L [Ω] */
    RL: number;
    /** [단계 3] P_max [W] (with rms factor) */
    Pmax: number;
    /** P_max 라벨 (분수 또는 소수) */
    PmaxLabel: string;
  };
};

export function generateRlcResonanceMaxPower(args: {
  params?: CircuitTypeParams;
  mode?: GenerationMode;
  seed?: number;
  index?: number;
}): RlcResonanceMaxPowerGeneration {
  const pool = VARIANT_POOL;
  const idx = typeof args.index === "number"
    ? ((args.index % pool.length) + pool.length) % pool.length
    : 0;
  const v = pool[idx];

  // 공진 시 C = 1/(ω_0² · L)
  const C = 1 / (v.omega0 * v.omega0 * v.L); // [F]
  const C_uF = C * 1e6;
  const Clabel = formatC(C_uF);

  // R_L = r_S (최대 전력 전달)
  const RL = v.rS;

  // V_rms = V_peak / √2 → P_max = V_rms² / (4·R_L) = V_peak² / (8·R_L)
  const Pmax = (v.Vpeak * v.Vpeak) / (8 * RL);
  const PmaxLabel = formatPower(Pmax);

  const Rlabels = v.R.map((r) => `${r}Ω`) as [string, string, string, string, string];

  const circuitDiagram: RlcResonanceMaxPowerCircuitDiagram = {
    Rlabels,
    Llabel: v.Llabel,
    vSourceLabel: `v(t) = ${v.Vpeak}sin(ω₀t)V`,
    omega0Label: `ω₀ = ${v.omega0Label}`,
  };

  return {
    circuitDiagram,
    netlist: buildNetlist(v, Rlabels),
    values: {
      Vpeak: v.Vpeak,
      omega0: v.omega0,
      omega0Label: v.omega0Label,
      L: v.L,
      Llabel: v.Llabel,
      R: v.R,
      Rlabels,
    },
    answer: { C_uF, Clabel, rS: v.rS, RL, Pmax, PmaxLabel },
  };
}

function formatC(C_uF: number): string {
  if (C_uF >= 1) {
    return Number.isInteger(C_uF) ? `${C_uF}μF` : `${Number(C_uF.toFixed(3))}μF`;
  }
  // sub-μF — nF 표기
  const C_nF = C_uF * 1000;
  if (C_nF >= 1) {
    return Number.isInteger(C_nF) ? `${C_nF}nF` : `${Number(C_nF.toFixed(2))}nF`;
  }
  return `${Number(C_uF.toFixed(6))}μF`;
}

function formatPower(P: number): string {
  // mW · W 단위 자동
  if (P >= 1) {
    return Number.isInteger(P) ? `${P}W` : `${Number(P.toFixed(4))}W`;
  }
  const P_mW = P * 1000;
  if (P_mW >= 1) {
    return `${Number(P_mW.toFixed(2))}mW`;
  }
  return `${Number(P.toFixed(6))}W`;
}

/**
 * 5저항 Wheatstone bridge + C + R_L(placeholder) + L + AC source 직렬 netlist.
 *
 *   GND ── V_s(+) ── BR_L (bridge 좌단) ──┬── R1 ── TM ── R2 ──┐
 *                                         │                    │
 *                                         │                  BR_R ── C ── RL ── L ── GND
 *                                         └── R3 ── BM ── R4 ──┘
 *                                                  R5: TM ── BM
 *
 *   loadPlaceholders: 5R 점선박스 (r_S) + R_L 점선박스 (학생 도출).
 */
function buildNetlist(
  v: Variant,
  Rlabels: [string, string, string, string, string],
): CircuitNetlist {
  const GND = "GND";
  const N_VS = "N_VS";       // V_s 상단
  const N_BRL = "N_BRL";     // bridge 좌측 단자
  const N_BRR = "N_BRR";     // bridge 우측 단자
  const N_TM = "N_TM";       // top middle
  const N_BM = "N_BM";       // bottom middle
  const N_C_OUT = "N_C_OUT"; // C 우측 (R_L 좌단)
  const N_RL_OUT = "N_RL_OUT"; // R_L 우측 (L 좌단)

  const components: CircuitComponent[] = [
    {
      id: "v_s",
      type: "V",
      value: `${v.Vpeak}sin(ω₀t)V`,
      pins: [
        { id: "p", node: N_BRL, side: "top" },
        { id: "n", node: GND, side: "bottom" },
      ],
    },
    // Wheatstone 5R
    { id: "R1", type: "R", value: Rlabels[0], pins: [{ id: "p", node: N_BRL, side: "left" }, { id: "n", node: N_TM, side: "right" }] },
    { id: "R2", type: "R", value: Rlabels[1], pins: [{ id: "p", node: N_TM, side: "left" }, { id: "n", node: N_BRR, side: "right" }] },
    { id: "R3", type: "R", value: Rlabels[2], pins: [{ id: "p", node: N_BRL, side: "left" }, { id: "n", node: N_BM, side: "right" }] },
    { id: "R4", type: "R", value: Rlabels[3], pins: [{ id: "p", node: N_BM, side: "left" }, { id: "n", node: N_BRR, side: "right" }] },
    { id: "R5", type: "R", value: Rlabels[4], pins: [{ id: "p", node: N_TM, side: "top" }, { id: "n", node: N_BM, side: "bottom" }] },
    // C, R_L, L (외부 직렬)
    { id: "C", type: "C", value: "C", pins: [{ id: "p", node: N_BRR, side: "left" }, { id: "n", node: N_C_OUT, side: "right" }] },
    { id: "R_L", type: "R", value: "R_L", pins: [{ id: "p", node: N_C_OUT, side: "top" }, { id: "n", node: N_RL_OUT, side: "bottom" }] },
    { id: "L_ind", type: "L", value: v.Llabel, pins: [{ id: "p", node: N_RL_OUT, side: "top" }, { id: "n", node: GND, side: "bottom" }] },
  ];

  const nodeAnnotations: NodeAnnotation[] = [];

  // r_S 점선박스 — 5R 전체 영역
  // R_L 점선박스 — 학생 도출 값
  const loadPlaceholders: LoadPlaceholder[] = [
    { betweenNodes: [N_BRL, N_BRR], label: "r_S", emphasize: true },
    { betweenNodes: [N_C_OUT, N_RL_OUT], label: "R_L", emphasize: true },
  ];

  return {
    components,
    ground: GND,
    nodeAnnotations,
    loadPlaceholders,
  };
}
