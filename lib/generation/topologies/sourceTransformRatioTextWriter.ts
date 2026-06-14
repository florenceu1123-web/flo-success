/**
 * 전원변환 + 전압비 → 미지 R 문제 텍스트 (결정론, GPT 호출 없음).
 *   정답·풀이는 generator 값으로 강제 — 내부 component id는 노출하지 않는다.
 */

import type { SourceTransformRatioGeneration } from "./sourceTransformRatio";

export type SourceTransformRatioTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/** 정수면 그대로, 아니면 소수 표기 (불필요한 0 제거) */
function num(x: number): string {
  return Number.isInteger(x) ? String(x) : String(Number(x.toFixed(3)));
}

export function writeSourceTransformRatioText(args: {
  generation: SourceTransformRatioGeneration;
}): SourceTransformRatioTextOutput {
  const v = args.generation.values;
  const [a, b, c] = v.ratio;
  const ratioStr = `${a}:${b}:${c}`;

  const content =
    `그림 (가)는 전류원이 포함된 저항회로이고, (나)는 (가)를 전원변환한 회로이다. ` +
    `저항 R_1, R_2, R_3에 걸리는 전압이 각각 V_1, V_2, V_3일 때, 전압비는 V_1:V_2:V_3 = ${ratioStr}이다. ` +
    `제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오.`;

  const conditions = [
    "모든 소자는 이상적으로 동작한다.",
    "그림 (나)의 R_1, R_2는 (가)의 전원변환으로 얻어지는 직렬 저항이다.",
    `그림 (가)의 소자값: 전류원 ${num(v.I_s)}mA, R_p = ${num(v.R_p)}Ω, R_m = ${num(v.R_m)}Ω, R_a = ${num(v.R_a)}Ω.`,
  ];

  const question = [
    `[단계 1] 그림 (가)의 전류원 부분(전류원 ${num(v.I_s)}mA ∥ ${num(v.R_p)}Ω)을 전원변환하여 그림 (나)의 전압 V_s[V]를 구한다.`,
    `[단계 2] 전압비 V_1:V_2:V_3 = ${ratioStr}을 이용하여 그림 (나)에서 저항 R_3[Ω]을 구한다.`,
    `[단계 3] 그림 (나)의 전체 전류 I[mA]와 R_3에 흐르는 전류 I_3[mA]를 각각 구한다.`,
  ].join("\n");

  const answer = [
    `[단계 1] V_s = ${num(v.V_s)}V`,
    `[단계 2] R_3 = ${num(v.R_x)}Ω`,
    `[단계 3] I = ${num(v.I)}mA, I_3 = ${num(v.I_x)}mA`,
  ].join("\n");

  // R_1=R_p, R_2=R_m (전원변환으로 직렬 저항은 그대로). P = R_a∥R_3.
  const solution = [
    `[단계 1] 전원변환: 전류원 ${num(v.I_s)}mA와 병렬저항 ${num(v.R_p)}Ω을 전압원으로 변환하면`,
    `  V_s = I_s · R_p = ${num(v.I_s)}mA × ${num(v.R_p)}Ω = ${num(v.V_s)}V (직렬저항 R_1 = ${num(v.R_p)}Ω).`,
    `  따라서 (나)는 V_s = ${num(v.V_s)}V, R_1 = ${num(v.R_p)}Ω, R_2 = ${num(v.R_m)}Ω, 그리고 R_a(${num(v.R_a)}Ω) ∥ R_3 직렬 회로이다.`,
    ``,
    `[단계 2] R_1, R_2에는 같은 전류 I가 흐르므로 V_1:V_2 = R_1:R_2 = ${num(v.R_p)}:${num(v.R_m)} = ${a}:${b} (전압비와 일치).`,
    `  V_3는 병렬부 (R_a ∥ R_3) 양단 전압이고 V_2:V_3 = R_2:(R_a∥R_3) = ${b}:${c}.`,
    `  ∴ R_a ∥ R_3 = R_2 · ${c}/${b} = ${num(v.R_m)} × ${c}/${b} = ${num(v.P)}Ω.`,
    `  ${num(v.R_a)}·R_3/(${num(v.R_a)}+R_3) = ${num(v.P)} → R_3 = ${num(v.R_a)}·${num(v.P)}/(${num(v.R_a)}−${num(v.P)}) = ${num(v.R_x)}Ω.`,
    ``,
    `[단계 3] 전체 저항 R_total = R_1 + R_2 + (R_a∥R_3) = ${num(v.R_p)} + ${num(v.R_m)} + ${num(v.P)} = ${num(v.R_p + v.R_m + v.P)}Ω.`,
    `  I = V_s / R_total = ${num(v.V_s)}V / ${num(v.R_p + v.R_m + v.P)}Ω = ${num(v.I)}mA.`,
    `  V_3 = I · (R_a∥R_3) = ${num(v.I)}mA × ${num(v.P)}Ω = ${num(v.V3)}V.`,
    `  I_3 = V_3 / R_3 = ${num(v.V3)}V / ${num(v.R_x)}Ω = ${num(v.I_x)}mA.`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}
