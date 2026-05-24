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
  void args.analysis;  // 향후 inventory에서 값 추출 가능; 현재는 canonical 사용
  void args.mode;
  const values: Imyong10DcNodalStructure["values"] = { ...CANONICAL };

  // 목표: V_2 = 3.8V를 위해 R_var sweep
  const target = { node: "V_2" as const, value: 3.8 };
  const R_var_solution = findRvar(values, target);

  // 기본 R_var (예: 10Ω)로 V_1·V_2 계산
  const defaultRvar = 10;
  const { V_1: V_1_default, V_2: V_2_default } = solveNodal(values, defaultRvar);

  const structure: Imyong10DcNodalStructure = {
    archetype: "IMYONG_10_DC_NODAL",
    values,
    query: { targetNode: target.node, targetValue: target.value },
  };

  const figureVariants: FigureVariant[] = [
    {
      id: "fig_imyong10",
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

  const { V_1: V_1_target, V_2: V_2_target } = solveNodal(values, R_var_solution);
  void V_2_target;
  const P_total = calcTotalPower(values, defaultRvar);

  const answer =
    `[단계 1] V_1 = ${V_1_default.toFixed(3)}V, V_2 = ${V_2_default.toFixed(3)}V\n` +
    `[단계 2] P_total = ${P_total.toFixed(3)}W\n` +
    `[단계 3] V_1 = ${V_1_target.toFixed(3)}V, R = ${R_var_solution.toFixed(2)}Ω`;

  const solution =
    `[단계 1] 좌측 병렬: R_left = R_left_top ∥ R_left_mid = ${(1 / (1 / values.R_left_top + 1 / values.R_left_mid)).toFixed(2)}Ω. ` +
    `2-node nodal 방정식으로 V_1·V_2 도출.\n` +
    `[단계 2] 각 저항에서 P_R = V²/R 또는 I²·R 합산. 좌측 병렬 R, R_v1_v2, R_var, R_right에 대해 계산.\n` +
    `[단계 3] V_2 = ${target.value}V 조건에 대해 nodal 방정식 → R_var sweep으로 해.`;

  const base: GeneratedProblem = {
    id: randomUUID(),
    content,
    conditions,
    question,
    answer,
    solution,
    topicKey: args.topicKey ?? "nodal_analysis",
    figureVariants,
  };

  return Array.from({ length: args.count }, () => ({ ...base, id: randomUUID() }));
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
