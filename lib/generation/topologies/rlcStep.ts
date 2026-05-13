import type { CircuitNetlist, CircuitTypeParams } from "@/types";
import { solveRlcStepResponse, type RlcDamping, type RlcSolverResult } from "@/lib/solver/rlcTransient";
import {
  NICE_VOLTAGES,
  makeRand,
  pick,
  round3,
} from "./_helpers";

/**
 * Series RLC step-response 문제 generator.
 *
 *  Archetype: "series_step" — V_step → R → L → C → GND, V_C(0)=0, I_L(0)=0
 *
 *  값 선택 전략: 감쇠 ratio ζ를 먼저 골라 R = 2·ζ·√(L/C)로 계산 → R이 nice 정수에
 *  떨어지도록 L·C 쌍을 한정. 결과적으로 under/critical/over 3가지 case 모두 균등 노출.
 */

export type RlcStepArchetype = "series_step";

export type RlcStepGeneration = {
  netlist: CircuitNetlist;
  /** 솔버 결과 — alpha/omega0/zeta/damping + Vc(t) function */
  rlc: RlcSolverResult;
  /** 정답 요약 */
  answer: {
    alpha: number;       // rad/s
    omega0: number;      // rad/s
    zeta: number;
    damping: RlcDamping;
    /** 진동 각주파수 (under만) */
    omegaD?: number;
  };
  archetype: RlcStepArchetype;
  values: Record<string, number>;
};

// (L_mH, C_uF) 쌍 — R_crit = 2·√(L/C)가 nice 정수에 가까운 조합 위주
// R_crit 계산: 2·√(L_mH·1e-3 / (C_uF·1e-6)) = 2·√(1000·L_mH/C_uF)
//   (10, 1)  → 2·√10000 = 200
//   (100, 10) → 2·√10000 = 200
//   (40, 1)  → 2·√40000 = 400
//   (90, 1)  → 2·√90000 = 600
//   (10, 10) → 2·√1000 ≈ 63.25
//   (250, 10) → 2·√25000 ≈ 316
const LC_PAIRS_MH_UF: Array<{ L_mH: number; C_uF: number; Rcrit_ohm: number }> = [
  { L_mH: 10,  C_uF: 1,  Rcrit_ohm: 200 },
  { L_mH: 100, C_uF: 10, Rcrit_ohm: 200 },
  { L_mH: 40,  C_uF: 1,  Rcrit_ohm: 400 },
  { L_mH: 90,  C_uF: 1,  Rcrit_ohm: 600 },
  { L_mH: 250, C_uF: 1,  Rcrit_ohm: 1000 },
];

// 감쇠 ratio 후보 — critically damped는 정수 R 안 나오면 제외
const ZETA_TARGETS = [0.3, 0.5, 0.7, 1.5, 2.0, 3.0];

export function generateRlcStep(args: {
  params?: CircuitTypeParams;
  archetype?: RlcStepArchetype;
  seed?: number;
}): RlcStepGeneration {
  const rand = makeRand(args.seed);
  const archetype: RlcStepArchetype = args.archetype ?? "series_step";
  return buildSeriesStep(rand);
  void archetype;
}

function buildSeriesStep(rand: () => number): RlcStepGeneration {
  const V = pick(NICE_VOLTAGES, rand);
  const lc = pick(LC_PAIRS_MH_UF, rand);
  const zeta = pick(ZETA_TARGETS, rand);
  const R_ohm = Math.round(2 * zeta * Math.sqrt(lc.L_mH * 1e-3 / (lc.C_uF * 1e-6)));

  const L_H = lc.L_mH * 1e-3;
  const C_F = lc.C_uF * 1e-6;

  const rlc = solveRlcStepResponse({ V, R: R_ohm, L: L_H, C: C_F });

  const netlist: CircuitNetlist = {
    components: [
      {
        id: "V1", type: "V", value: `${V}V`,
        pins: [
          { id: "p1", node: "top", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
      {
        id: "R1", type: "R", value: `${R_ohm}Ω`,
        pins: [
          { id: "p1", node: "top", side: "left" },
          { id: "p2", node: "n1", side: "right" },
        ],
      },
      {
        id: "L1", type: "L", value: `${lc.L_mH}mH`,
        pins: [
          { id: "p1", node: "n1", side: "left" },
          { id: "p2", node: "n2", side: "right" },
        ],
      },
      {
        id: "C1", type: "C", value: `${lc.C_uF}μF`,
        pins: [
          { id: "p1", node: "n2", side: "top", role: "positive" },
          { id: "p2", node: "GND", side: "bottom", role: "negative" },
        ],
      },
    ],
    ground: "GND",
    nodeAnnotations: [
      { node: "n2", label: "C+", style: "label_only" },
    ],
    measurementMarks: [
      { kind: "voltage", refs: ["n2", "GND"], label: "V_C" },
    ],
  };

  return {
    netlist,
    rlc,
    answer: {
      alpha: round3(rlc.alpha),
      omega0: round3(rlc.omega0),
      zeta: round3(rlc.zeta),
      damping: rlc.damping,
      omegaD: rlc.omegaD !== undefined ? round3(rlc.omegaD) : undefined,
    },
    archetype: "series_step",
    values: { V, R_ohm, L_mH: lc.L_mH, C_uF: lc.C_uF, zeta_target: zeta },
  };
}
