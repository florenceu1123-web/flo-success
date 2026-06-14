/**
 * OPAMP 차동증폭기 (임용 9번) 문제 텍스트 — 결정론(GPT 없음). 정답은 생성기 값으로 강제.
 */

import type { OpampDifferenceAmpGeneration } from "./opampDifferenceAmp";

export type OpampDifferenceAmpTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

const n = (x: number): string => (Number.isInteger(x) ? String(x) : String(Number(x.toFixed(3))));

export function writeOpampDifferenceAmpText(args: {
  generation: OpampDifferenceAmpGeneration;
}): OpampDifferenceAmpTextOutput {
  const v = args.generation.values;

  const content =
    "그림은 연산증폭기(OPAMP) 응용 회로를 나타낸 것이다. " +
    "제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오. " +
    "(단, 연산증폭기는 이상적으로 동작한다.)";

  const conditions = [
    "이상적 OPAMP — 가상단락 V₊=V₋, 입력 단자 전류는 0.",
    `전류원 I_n, 전압원 V_p, 저항 R_1, R_2, R_3, R_4, R_n으로 구성된다.`,
  ];

  const question = [
    "<해석 절차>",
    "[단계 1] 전류원 I_n 및 전압원 V_p와 저항 R_1, R_2, R_3, R_4, R_n을 이용하여 출력 전압 V_o를 식으로 나타낸다.",
    `[단계 2] 저항 R_n = R_1 = ${n(v.R_n)}[kΩ], R_2 = ${n(v.R_2)}[kΩ], R_3 = ${n(v.R_3)}[kΩ]이고 ` +
      `I_n = ${n(v.I_n)}[mA], V_p = ${n(v.V_p)}[V], V_o = ${n(v.V_o)}[V]일 때 R_4[kΩ]를 구한다.`,
    "[단계 3] [단계 2] 회로로부터 차동모드이득(differential mode gain) A_d와 공통모드이득(common mode gain) A_c를 구한다.",
  ].join("\n");

  // V_o 식 (대칭 형태)
  const voFormula =
    "V_o = [R_4/(R_3+R_4)]·(1 + R_2/(R_1+R_n))·V_p − [R_2·R_n/(R_1+R_n)]·I_n";

  const answer = [
    `[단계 1] ${voFormula}`,
    `[단계 2] R_4 = ${n(v.R_4)}kΩ`,
    `[단계 3] A_d = ${n(v.A_d)}, A_c = ${n(v.A_c)}`,
  ].join("\n");

  const Rsum = v.R_1 + v.R_n;
  const solution = [
    "[단계 1] 이상적 OPAMP이므로 V₊=V₋, 두 입력단 전류는 0.",
    `  · V₊ = V_p·R_4/(R_3+R_4) (R_3·R_4 전압분배). 따라서 V₋ = V₊.`,
    `  · 좌측 노드 N(I_n∥R_n∥R_1 접점) KCL: I_n = V_N/R_n + (V_N−V₋)/R_1.`,
    `  · 반전입력 KCL: (V_N−V₋)/R_1 + (V_o−V₋)/R_2 = 0.`,
    `  · 두 식에서 V_N 소거 → ${voFormula}.`,
    "",
    `[단계 2] 값 대입: R_1+R_n = ${n(Rsum)}kΩ, b = R_2/(R_1+R_n) = ${n(v.b)}, V₋ = V_p·R_4/(R_3+R_4).`,
    `  · V_o = (1+b)·V₋ − b·R_n·I_n  ⟹  ${n(v.V_o)} = ${n(1 + v.b)}·V₋ − ${n(v.b)}·${n(v.R_n)}·${n(v.I_n)}.`,
    `  · V₋ = ${n(v.V_minus)}V → R_4/(R_3+R_4) = V₋/V_p = ${n(v.V_minus)}/${n(v.V_p)} = ${n(v.V_minus / v.V_p)}.`,
    `  · 풀면 R_4 = ${n(v.R_4)}kΩ.`,
    "",
    `[단계 3] 두 입력을 V_1=I_n·R_n=${n(v.V_1)}V, V_2=V_p=${n(v.V_p)}V로 보면 V_o = a·V_2 − b·V_1,`,
    `  a = R_4/(R_3+R_4)·(1+b) = ${n(v.a)}, b = ${n(v.b)}.`,
    `  V_d=V_2−V_1, V_c=(V_1+V_2)/2 로 정리하면 V_o = A_d·V_d + A_c·V_c,`,
    `  ∴ A_d = (a+b)/2 = ${n(v.A_d)},  A_c = a−b = ${n(v.A_c)}.`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}
