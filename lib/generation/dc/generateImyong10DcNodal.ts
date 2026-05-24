// src/lib/generation/dc/generateImyong10DcNodal.ts
//
// IMYONG_10_DC_NODAL archetype generator.
//   임용 10번 형식 — 2-source DC nodal 회로.
//
// 정책 (CLAUDE.md):
//   LLM은 layout 출력 ❌ — 이 generator가 고정 slot 구조 JSON 생성.
//   renderer가 같은 좌표에 결정론적 배치.
//
// Flow:
//   1) analysis(또는 default)에서 values 추출
//   2) MNA로 V_1·V_2 계산 + 가변 R sweep으로 target 충족 값
//   3) Imyong10DcNodalStructure 빌드
//   4) figureVariant(diagramType="imyong_10_dc_nodal") 포함한 GeneratedProblem 반환

import { randomUUID } from "node:crypto";
import { solveMNA, type SolverNetwork } from "@/lib/solver/mna";
import type { Imyong10DcNodalStructure } from "@/lib/analog/archetypeRegistry";
import type {
  AnalysisResult,
  FigureVariant,
  GeneratedProblem,
  GenerationMode,
  TopicKey,
} from "@/types";

/** 임용 10번 표준 값 — perturb의 시드 base. */
const CANONICAL: Omit<Imyong10DcNodalStructure["values"], never> = {
  V_s: 20,
  R_left_top: 20,
  R_left_mid: 20,
  R_v1_v2: 10,
  I_src: 0.5,
  R_right: 10,
};

// Nice value pools — 임용 관습의 깔끔한 수치만 사용.
const NICE_V = [10, 12, 15, 18, 20, 24, 30];
const NICE_R = [5, 6, 8, 10, 12, 15, 18, 20, 24, 30];
const NICE_I = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0];
const NICE_TARGET_V = [2.5, 3.0, 3.2, 3.5, 3.8, 4.0, 4.2, 4.5, 5.0];

/** seeded random — Mulberry32. */
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(pool: readonly T[], rand: () => number): T {
  return pool[Math.floor(rand() * pool.length)];
}

/** seed 기반 perturbed values 생성. seed가 다르면 다른 값 조합. */
function perturbValues(seed: number, mode: GenerationMode): Imyong10DcNodalStructure["values"] {
  void mode;
  const rand = makeRand(seed);
  // 좌측 parallel R은 동일 값 (원문 패턴 유지)
  const R_left = pick(NICE_R, rand);
  return {
    V_s: pick(NICE_V, rand),
    R_left_top: R_left,
    R_left_mid: R_left,
    R_v1_v2: pick(NICE_R, rand),
    I_src: pick(NICE_I, rand),
    R_right: pick(NICE_R, rand),
  };
}

/** seed 기반 target voltage 선택. */
function perturbTarget(seed: number): number {
  return pick(NICE_TARGET_V, makeRand(seed));
}

/** 2-node nodal MNA 풀이 — 주어진 R_var에 대해 (V_1, V_2) 계산. */
function solveNodal(values: Imyong10DcNodalStructure["values"], R_var: number): { V_1: number; V_2: number } {
  // 4 nodes: VS, V1, V2, GND (GND 별도)
  // V 소스: VS → GND
  // R_left_top, R_left_mid: VS ↔ V1 (parallel → 등가 1/((1/Rt)+(1/Rm)))
  // R_v1_v2: V1 ↔ V2
  // I_src: V1 → V2 (current 방향: V1에서 V2로)
  // R_var: V1 ↔ GND
  // R_right: V2 ↔ GND
  const R_left_eq = 1 / (1 / values.R_left_top + 1 / values.R_left_mid);
  const net: SolverNetwork = {
    nodeIds: ["VS", "V1", "V2"],
    groundId: "GND",
    resistors: [
      { id: "R_left", a: "VS", b: "V1", R: R_left_eq },
      { id: "R_v1_v2", a: "V1", b: "V2", R: values.R_v1_v2 },
      { id: "R_var", a: "V1", b: "GND", R: R_var },
      { id: "R_right", a: "V2", b: "GND", R: values.R_right },
    ],
    vsources: [{ id: "Vs", a: "VS", b: "GND", V: values.V_s }],
    isources: [{ id: "Is", a: "V1", b: "V2", I: values.I_src }],
  };
  const sol = solveMNA(net);
  return { V_1: sol.nodeVoltages.V1 ?? 0, V_2: sol.nodeVoltages.V2 ?? 0 };
}

/** target value 만족하는 R_var를 bisection으로 sweep. */
function findRvar(values: Imyong10DcNodalStructure["values"], target: { node: "V_1" | "V_2"; value: number }): number {
  let lo = 0.5, hi = 5000;
  let bestR = lo, bestErr = Infinity;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const { V_1, V_2 } = solveNodal(values, mid);
    const actual = target.node === "V_1" ? V_1 : V_2;
    const err = actual - target.value;
    if (Math.abs(err) < bestErr) { bestErr = Math.abs(err); bestR = mid; }
    if (Math.abs(err) < 0.001) return mid;
    // monotonic: V_2(R_var) 단조 함수 가정. 부호 보고 좁힘.
    if (err > 0) hi = mid; else lo = mid;
  }
  return bestR;
}

/**
 * Generator entry — analysis + mode + count → GeneratedProblem[].
 *   mode는 현재 사용 안 함 (perturbation 향후 추가). count만큼 사본 emit (deterministic).
 */
export function generateImyong10DcNodal(args: {
  analysis: AnalysisResult;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): GeneratedProblem[] {
  void args.analysis;
  // 호출별 base seed — Date.now() + cryptographic noise. 매 호출마다 다른 결과.
  const baseSeed = Date.now() ^ Math.floor(Math.random() * 0x7fffffff);

  return Array.from({ length: args.count }, (_, i) => {
    // 각 problem마다 다른 seed → 다른 value 조합
    const seed = baseSeed + i * 104729;
    const values = perturbValues(seed, args.mode);
    const defaultRvar = pick(NICE_R, makeRand(seed + 13));
    const targetV = perturbTarget(seed + 7);
    const target = { node: "V_2" as const, value: targetV };

    // R_var sweep으로 target 만족 값 탐색
    const R_var_solution = findRvar(values, target);
    const { V_1: V_1_default, V_2: V_2_default } = solveNodal(values, defaultRvar);
    const { V_1: V_1_target } = solveNodal(values, R_var_solution);
    const P_total = calcTotalPower(values, defaultRvar);

    const structure: Imyong10DcNodalStructure = {
      archetype: "IMYONG_10_DC_NODAL",
      values,
      query: { targetNode: target.node, targetValue: target.value },
    };

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_imyong10_${i + 1}`,
        label: "(가) 회로",
        role: "original_circuit",
        diagramType: "imyong_10_dc_nodal",
        diagram: structure,
      },
    ];

    const content =
      `아래 그림 (가)와 같이 2개의 직류 전원과 가변 저항이 포함된 회로가 있다. ` +
      `<해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. ` +
      `(모든 소자는 이상적이며, 가변 저항 R 의 값은 단계별로 다를 수 있다.)`;

    const conditions = [
      `V_s = ${values.V_s}V`,
      `R_left_top = ${values.R_left_top}Ω, R_left_mid = ${values.R_left_mid}Ω (좌측 병렬)`,
      `R_v1_v2 = ${values.R_v1_v2}Ω`,
      `I_src = ${values.I_src}A`,
      `R_right = ${values.R_right}Ω`,
    ];

    const question =
      `[단계 1] R = ${defaultRvar}Ω일 때, 전압 V_1, V_2 를 각각 구한다.\n` +
      `[단계 2] [단계 1]에서 전체 저항이 소비하는 전력 P_total 을 구한다.\n` +
      `[단계 3] 가변 저항 R 의 값을 조정하여 V_2 = ${target.value}V 가 되도록 한다. 이때 V_1 과 R 의 값을 각각 구한다.`;

    const answer =
      `[단계 1] V_1 = ${V_1_default.toFixed(3)}V, V_2 = ${V_2_default.toFixed(3)}V\n` +
      `[단계 2] P_total = ${P_total.toFixed(3)}W\n` +
      `[단계 3] V_1 = ${V_1_target.toFixed(3)}V, R = ${R_var_solution.toFixed(2)}Ω`;

    const R_left_eq = 1 / (1 / values.R_left_top + 1 / values.R_left_mid);
    const solution =
      `[단계 1] 좌측 병렬: R_left = R_left_top ∥ R_left_mid = ${R_left_eq.toFixed(2)}Ω. ` +
      `2-node nodal 방정식으로 V_1·V_2 도출.\n` +
      `[단계 2] 각 저항에서 P_R = V²/R 또는 I²·R 합산. 좌측 병렬 R, R_v1_v2, R_var, R_right에 대해 계산.\n` +
      `[단계 3] V_2 = ${target.value}V 조건에 대해 nodal 방정식 → R_var sweep으로 해.`;

    return {
      id: randomUUID(),
      content,
      conditions,
      question,
      answer,
      solution,
      topicKey: args.topicKey ?? "nodal_analysis",
      figureVariants,
    };
  });
}

/** 각 저항에서 소비 전력 합산. */
function calcTotalPower(values: Imyong10DcNodalStructure["values"], R_var: number): number {
  const { V_1, V_2 } = solveNodal(values, R_var);
  const R_left_eq = 1 / (1 / values.R_left_top + 1 / values.R_left_mid);
  const I_left = (values.V_s - V_1) / R_left_eq;
  const I_v1_v2 = (V_1 - V_2) / values.R_v1_v2;
  const I_var = V_1 / R_var;
  const I_right = V_2 / values.R_right;
  return (
    I_left * I_left * R_left_eq +
    I_v1_v2 * I_v1_v2 * values.R_v1_v2 +
    I_var * I_var * R_var +
    I_right * I_right * values.R_right
  );
}
