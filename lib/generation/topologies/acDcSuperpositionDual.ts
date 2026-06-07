import type { CircuitComponent, CircuitNetlist, MeasurementMark } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 직류+교류 중첩 회로의 **쌍대(dual) 회로** generator — 기출변형유형(exam_variant)용.
 *
 * 원본(exam_similar)과 정확한 쌍대 관계:
 *   전압원 V ↔ 전류원 I,  직렬 ↔ 병렬,  인덕터 L ↔ 커패시터 C,
 *   루프전류 i(t) ↔ 노드전압 v(t),  KVL ↔ KCL.
 *
 * 구조 (두 rail 사이 병렬 가지):
 *   N_T ─┬──────┬──────┬────────┐
 *        │      │      │        │
 *      I_ac   I_dc     R      C_1
 *      (SW₂)  (SW₁)    │      (v₁)
 *        │      │      │      N_MID
 *        │      │      │       C_2
 *   GND ─┴──────┴──────┴────────┘
 *
 * 닫힌형 해 (원본을 그대로 dual화):
 *   조건: 1/(ωC_eq) = R  (직렬 C 등가, 45° 위상)  [원본: ωL_eq = ΣR]
 *   [단계 1] 직류만 — C 개방 → v(t) = V_DC = I_dc·R              [원본: I_DC = V_dc/ΣR]
 *   [단계 2] 교류만 — 병렬 Y = (1+j)/R → v_ac = I_ac·R/√2, 위상 −45°,
 *            전압 분배 v_1ac/v_ac = C_eq/C_1                      [원본: 전류 분배 L_eq/L_1]
 *   [단계 3] 둘 다 — 중첩 v(t) = V_DC + v_ac(t)
 */

export type AcDcSuperpositionDualGeneration = {
  netlist: CircuitNetlist;
  values: {
    /** 직류 전류원 [mA] */
    IdcMilli: number;
    /** 교류 전류원 rms [mA] */
    IacRmsMilli: number;
    /** 교류 전류원 라벨 (예: "30√2 sin1000t mA") */
    IacLabel: string;
    omega: number;
    /** 병렬 저항 [Ω] */
    R: number;
    /** 직렬 커패시터들 + 전압 분배비 (v_Ck/v = C_eq/C_k) */
    caps: Array<{ id: string; value: number; label: string; ratio: number; ratioLabel: string }>;
    /** 직렬 등가 C [F] */
    Ceq: number;
    CeqLabel: string;
  };
  solution: {
    /** [단계 1] 직류 정상상태 전압 [V] (C 개방) */
    vDcVolts: number;
    /** [단계 2] 교류 전압 진폭 [V] */
    vAcPeakVolts: number;
    /** 위상 [deg] — −45 (용량성 병렬) */
    phaseDeg: number;
    /** v_ac(t) 표현식 [V] */
    vAcExpression: string;
    /** 측정 대상 C_1의 전압 분배비 v_1ac/v_ac */
    dividerRatio: number;
    dividerRatioLabel: string;
    /** v_1(t) 표현식 [V] */
    vReactiveExpression: string;
    /** [단계 3] v(t) = V_DC + v_ac(t) 표현식 [V] */
    totalExpression: string;
  };
};

/** 직렬 커패시터 페어 + ω → R=1/(ωC_eq) 이 100~1000 50배수가 되는 조합 */
const DUAL_CAP_PAIRS: Array<{
  values: number[];
  labels: string[];
  ceq: number;
  /** 전압 분배비 C_eq/C_k = [num, den] */
  ratios: Array<[number, number]>;
}> = [
  { values: [3e-6, 6e-6], labels: ["3μF", "6μF"], ceq: 2e-6, ratios: [[2, 3], [1, 3]] },
  { values: [4e-6, 4e-6], labels: ["4μF", "4μF"], ceq: 2e-6, ratios: [[1, 2], [1, 2]] },
  { values: [2e-6, 2e-6], labels: ["2μF", "2μF"], ceq: 1e-6, ratios: [[1, 2], [1, 2]] },
  { values: [1e-6, 1e-6], labels: ["1μF", "1μF"], ceq: 0.5e-6, ratios: [[1, 2], [1, 2]] },
  { values: [2e-6, 6e-6], labels: ["2μF", "6μF"], ceq: 1.5e-6, ratios: [[3, 4], [1, 4]] },
];

const OMEGAS = [500, 1000, 2000, 4000, 5000];

/** 전류원 후보 [mA] — v = I·R 가 정수 V가 되는 것만 필터 */
const I_CANDIDATES = [4, 5, 8, 10, 12, 15, 16, 20, 24, 30, 40];

function fracLabel([num, den]: [number, number]): string {
  return den === 1 ? `${num}` : `${num}/${den}`;
}

/**
 * 쌍대 회로 + 닫힌형 해 생성.
 */
export function generateAcDcSuperpositionDual(args: {
  seed?: number;
}): AcDcSuperpositionDualGeneration {
  const rand = makeRand(args.seed);

  // ── (직렬 C 페어, ω) 조합 enumerate — R=1/(ωC_eq) ∈ [100,1000] 50배수 ──
  type Combo = {
    capValues: number[];
    capLabels: string[];
    ratios: Array<[number, number]>;
    ceq: number;
    omega: number;
    R: number;
  };
  const combos: Combo[] = [];
  for (const p of DUAL_CAP_PAIRS) {
    for (const omega of OMEGAS) {
      const R = 1 / (omega * p.ceq);
      if (R >= 100 && R <= 1000 && Number.isInteger(R) && R % 50 === 0) {
        combos.push({ capValues: p.values, capLabels: p.labels, ratios: p.ratios, ceq: p.ceq, omega, R });
      }
    }
  }
  if (combos.length === 0) throw new Error("acDcSuperpositionDual: 유효한 (C, ω) 조합 없음");
  const combo = pick(combos, rand);

  // ── 전류원 선택 — v = I·R 가 정수 V ──
  const niceI = I_CANDIDATES.filter((i) => Number.isInteger((i * combo.R) / 1000));
  const IdcMilli = niceI.length > 0 ? pick(niceI, rand) : 20;
  const IacRmsMilli = niceI.length > 0 ? pick(niceI, rand) : 20;
  const IacLabel = `${IacRmsMilli}√2 sin${combo.omega}t mA`;

  // ── 닫힌형 해 ──
  const vDcVolts = (IdcMilli * combo.R) / 1000;
  const vAcPeakVolts = (IacRmsMilli * combo.R) / 1000;
  const phaseDeg = -45;
  const phaseLabel = "− 45°";
  const vAcExpression = `${vAcPeakVolts} sin(${combo.omega}t ${phaseLabel}) [V]`;

  const ratio = combo.ratios[0];
  const dividerRatio = ratio[0] / ratio[1];
  const dividerRatioLabel = fracLabel(ratio);
  const vReactivePeak = roundNice(vAcPeakVolts * dividerRatio);
  const vReactiveExpression = `${vReactivePeak} sin(${combo.omega}t ${phaseLabel}) [V]`;

  const totalExpression = `${vDcVolts} + ${vAcExpression.replace(" [V]", "")} [V]`;

  // ── netlist (두 rail 사이 병렬 가지) ──
  const N_T = "n_top";
  const GND = "GND";
  const N_MID = "n_mid";   // 직렬 C 사이
  const n_iac = "n_iac";   // I_ac ↔ SW₂ 사이
  const n_idc = "n_idc";   // I_dc ↔ SW₁ 사이

  const components: CircuitComponent[] = [
    // ── 교류 전류원 가지: GND ─ I_ac ─ n_iac ─ SW₂ ─ N_T ──
    {
      id: "I_ac",
      type: "I",
      value: IacLabel,
      pins: [
        { id: "p", node: GND, side: "bottom" },
        { id: "n", node: n_iac, side: "top" },
      ],
    },
    {
      id: "SW_2",
      type: "SW",
      state: "closed",
      pins: [
        { id: "p", node: n_iac, side: "bottom" },
        { id: "n", node: N_T, side: "top" },
      ],
    },
    // ── 직류 전류원 가지: GND ─ I_dc ─ n_idc ─ SW₁ ─ N_T ──
    {
      id: "I_dc",
      type: "I",
      value: `${IdcMilli} mA`,
      pins: [
        { id: "p", node: GND, side: "bottom" },
        { id: "n", node: n_idc, side: "top" },
      ],
    },
    {
      id: "SW_1",
      type: "SW",
      state: "closed",
      pins: [
        { id: "p", node: n_idc, side: "bottom" },
        { id: "n", node: N_T, side: "top" },
      ],
    },
    // ── 병렬 저항 가지: N_T ─ R ─ GND ──
    {
      id: "R",
      type: "R",
      value: `${combo.R}Ω`,
      pins: [
        { id: "p", node: N_T, side: "top" },
        { id: "n", node: GND, side: "bottom" },
      ],
    },
    // ── 직렬 커패시터 가지: N_T ─ C_1 ─ N_MID ─ C_2 ─ GND ──
    {
      id: "C_1",
      type: "C",
      value: combo.capLabels[0],
      pins: [
        { id: "p", node: N_T, side: "top" },
        { id: "n", node: N_MID, side: "bottom" },
      ],
    },
    {
      id: "C_2",
      type: "C",
      value: combo.capLabels[1],
      pins: [
        { id: "p", node: N_MID, side: "top" },
        { id: "n", node: GND, side: "bottom" },
      ],
    },
  ];

  const measurementMarks: MeasurementMark[] = [
    { kind: "voltage", refs: [N_T, GND], label: "v(t)" },
    { kind: "voltage", refs: [N_T, N_MID], label: "v₁(t)" },
  ];

  return {
    netlist: {
      components,
      ground: GND,
      nodeAnnotations: [],
      measurementMarks,
      positions: {},
    },
    values: {
      IdcMilli,
      IacRmsMilli,
      IacLabel,
      omega: combo.omega,
      R: combo.R,
      caps: combo.capValues.map((v, k) => ({
        id: `C_${k + 1}`,
        value: v,
        label: combo.capLabels[k],
        ratio: combo.ratios[k][0] / combo.ratios[k][1],
        ratioLabel: fracLabel(combo.ratios[k]),
      })),
      Ceq: combo.ceq,
      CeqLabel: `${roundNice(combo.ceq * 1e6)}μF`,
    },
    solution: {
      vDcVolts,
      vAcPeakVolts,
      phaseDeg,
      vAcExpression,
      dividerRatio,
      dividerRatioLabel,
      vReactiveExpression,
      totalExpression,
    },
  };
}

function roundNice(x: number): number {
  return Number.isInteger(x) ? x : Math.round(x * 1000) / 1000;
}
