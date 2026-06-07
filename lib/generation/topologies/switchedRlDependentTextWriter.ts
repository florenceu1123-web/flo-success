import type { SwitchedRlDependentGeneration } from "./switchedRlDependent";

/**
 * 스위치 RL + 종속전원(2i_A) 과도응답 결정론 텍스트 라이터 (임용 2022 B-7).
 *   [단계1] SW=단자1 정상상태 → i_L(0)[A], v_o(0)[V]
 *   [단계2] t=0 SW 단자1→단자2 → i_L(t)[A], v_o(t)[V]
 */

export type SwitchedRlDependentTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

export function writeSwitchedRlDependentText(args: {
  generation: SwitchedRlDependentGeneration;
}): SwitchedRlDependentTextOutput {
  const { values: v, solution: s } = args.generation;
  const variant = args.generation.variant === true;

  let content: string;
  let conditions: string[];
  let question: string;
  let answer: string;
  if (variant) {
    // 쌍대(dual) RC 회로 — 전류원·커패시터·CCCS, 출력은 i_o
    content =
      `다음 그림은 스위치로 연결되는 2개의 독립 직류 전류원(${v.V1}A, ${v.V2}A)과 ` +
      `1개의 종속 전류원(${v.k}i_a)이 포함된 RC 응용 회로이다(원본 RL 회로의 쌍대). ` +
      `컨덕턴스 ${v.Ro}[S]에 흐르는 출력 전류 i_o(t)를 구하려고 한다. ` +
      `제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오.`;
    conditions = [
      `종속 전류원은 컨덕턴스 ${v.Ra}S에 흐르는 전류 i_a에 대해 ${v.k}i_a [A]이다.`,
      `커패시터 초기 전압은 단계1의 정상상태 값으로 한다 (v_C 연속).`,
      `모든 소자는 이상적으로 동작한다.`,
    ];
    question =
      `<해석 절차>\n` +
      `[단계 1] 스위치가 단자1에 연결된 상태에서 정상 상태에 도달했을 때, 커패시터 전압 v_C[V]와 출력전류 i_o[A]를 각각 구한다.\n` +
      `[단계 2] 시간 t=0일 때 스위치가 단자1에서 단자2로 이동하였다. 시간 t≥0에서 커패시터 전압 v_C(t)[V]와 출력전류 i_o(t)[A]를 각각 구한다.`;
    answer =
      `[단계 1] v_C = ${s.iL0} V, i_o = ${s.vo0} A / ` +
      `[단계 2] v_C(t) = ${s.iLExpr}, i_o(t) = ${s.voExpr}`;
  } else {
    content =
      `다음 그림은 스위치로 연결되는 2개의 독립 직류 전압원(${v.V1}V, ${v.V2}V)과 ` +
      `1개의 종속 전압원(${v.k}i_A)이 포함된 RL 응용 회로이다. 저항 ${v.Ro}[Ω]에 나타나는 출력 전압 v_o(t)를 ` +
      `구하려고 한다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오.`;
    conditions = [
      `종속 전압원은 4Ω(저항)에 흐르는 전류 i_A에 대해 ${v.k}i_A [V]이다.`,
      `인덕터 초기 전류는 단계1의 정상상태 값으로 한다 (i_L 연속).`,
      `모든 소자는 이상적으로 동작한다.`,
    ];
    question =
      `<해석 절차>\n` +
      `[단계 1] 스위치가 단자1에 연결된 상태에서 정상 상태에 도달했을 때, 인덕터 전류 i_L[A]와 출력전압 v_o[V]를 각각 구한다.\n` +
      `[단계 2] 시간 t=0일 때 스위치가 단자1에서 단자2로 이동하였다. 시간 t≥0에서 인덕터 전류 i_L(t)[A]와 출력전압 v_o(t)[V]를 각각 구한다.`;
    answer =
      `[단계 1] i_L = ${s.iL0} A, v_o = ${s.vo0} V / ` +
      `[단계 2] i_L(t) = ${s.iLExpr}, v_o(t) = ${s.voExpr}`;
  }

  let solution: string;
  if (variant) {
    const Gloop = 3 * v.Ra + v.Ro;          // 18
    const Gth = v.R1 + Gloop;               // 20
    solution =
      `[기출변형=쌍대회로] 원본 RL의 쌍대: V↔I, 직렬↔병렬, L↔C, CCVS↔CCCS, v_o↔i_o.\n` +
      `병렬 노드 V_C: 전류원(선택) ∥ G_a(${v.Ra}S) ∥ C(${v.L}F) ∥ G_o(${v.Ro}S) ∥ 종속전류원 ${v.k}i_a.\n` +
      `i_a=G_a·V_C 통과전류, ${v.k}i_a는 +${v.k}G_a 등가(안정). i_o=G_o·V_C.\n` +
      `정상상태(C 개방): I_source = V_C(G_a+G_o+${v.k}G_a) = V_C·${Gloop}.\n` +
      `[단계 1] SW=단자1(${v.V2}A 직결): v_C(0)=${v.V2}/${Gloop}=${s.iL0}V, i_o(0)=${v.Ro}·${s.iL0}=${s.vo0}A.\n` +
      `[단계 2] SW=단자2(${v.V1}A∥${v.R1}S, t≥0): v_C(∞)=${v.V1}/(${v.R1}+${Gloop})=${v.V1}/${Gth}=${s.iLinf}V, i_o(∞)=${s.voInf}A.\n` +
      `  C가 보는 등가컨덕턴스 G_th=G_1+G_a+G_o+${v.k}G_a=${Gth}S, τ=C/G_th=${v.L}/${Gth}=${s.tau}s.\n` +
      `  v_C(t) = ${s.iLExpr}.  i_o(t) = ${v.Ro}·v_C(t) = ${s.voExpr}.`;
  } else {
    const facA = 1 - v.k / v.Ra;       // 0.5
    const Rbr = v.R1 / facA;           // 4
    const Rpar = (v.Ra * Rbr) / (v.Ra + Rbr);  // Ra∥(R1/facA) = 2
    solution =
      `종속전압원 V(n_s)=${v.k}i_A가 전원− 와 접지 사이(바닥 lane)에 있어 전원 귀환전류가 통과.\n` +
      `i_A=V_top/${v.Ra}이므로 전원전압 = V_top − ${v.k}i_A = V_top(1−${v.k}/${v.Ra}) = ${facA}·V_top.\n` +
      `부하: 4Ω·6Ω는 n_top↔접지 → v_o=V_top, i_L=V_top/${v.Ro}.\n` +
      `[단계 1] SW=단자1: ${facA}·V_top=${v.V2} → V_top=${s.vo0}V.\n` +
      `  → i_L(0)=${s.vo0}/${v.Ro}=${s.iL0}A, v_o(0)=${s.vo0}V.\n` +
      `[단계 2] SW=단자2 (t≥0): ${v.V1}V·${v.R1}Ω 구동.\n` +
      `  V_top[${facA} + ${v.R1}/${v.Ra} + ${v.R1}/${v.Ro}] = ${v.V1} → V_top=${s.voInf}V.\n` +
      `  → i_L(∞)=${s.iLinf}A, v_o(∞)=${s.voInf}V.\n` +
      `  R_th = R_o + (R_a∥(R_1/${facA})) = ${v.Ro} + ${Rpar} = ${v.Ro + Rpar}Ω, τ=L/R_th=${v.L}/${v.Ro + Rpar}=${s.tau}s.\n` +
      `  i_L(t) = ${s.iLExpr}.  v_o(t) = ${v.Ro}·i_L(t) = ${s.voExpr}.`;
  }

  return { content, conditions, question, answer, solution };
}
