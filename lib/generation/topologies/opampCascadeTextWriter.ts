import type { GenerationMode } from "@/types";
import type { OpampCascadeGeneration } from "./opampCascade";

export type OpampCascadeTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * 임용 10번 (2-OPAMP cascade, 전역 피드백) textWriter — 결정론.
 *
 *  ⚠️ 이전 구현은 GPT 호출로 텍스트를 만들었는데, GPT prompt가 "R_2·R_6는 분석에 영향 없음 /
 *  V⁺ 모두 GND"라는 잘못된(렌더러 도면과 다른) 토폴로지를 박아서 그림·풀이 불일치가 발생
 *  (사용자 신고). 토폴로지·수식·풀이가 모두 generator의 닫힌형 해와 일치하도록 결정론으로 교체.
 *
 *  원본 해석 절차 (임용 10번):
 *    [단계 1] 회로에서 V_s/V_o를 R_4와 R_5의 값을 이용하여 구한다.
 *    [단계 2] 회로에서 V⁺를 R_2와 R_6의 값을 이용하여 구하고,
 *             V⁻ = β·V_i + α·V_o 의 α를 R_1과 R_3의 값을 이용하여 구한다.
 *    [단계 3] [단계 1]과 [단계 2]에서 구한 결과를 이용하여 V_o/V_i (와 V_s/V_i)를 구한다.
 */
export async function writeOpampCascadeText(args: {
  generation: OpampCascadeGeneration;
  mode: GenerationMode;
  topicLabel?: string;
  contextHint?: string;
}): Promise<OpampCascadeTextOutput> {
  const { generation } = args;
  const { values: v, answer: a } = generation;

  // 분수 표기 helpers — β = R_3/(R_1+R_3) 등을 "90/100 = 9/10" 형태로
  const frac = (num: number, den: number): string => {
    const g = gcd(num, den);
    const rn = num / g;
    const rd = den / g;
    return rd === 1 ? `${rn}` : `${rn}/${rd}`;
  };
  const betaFrac = frac(v.R_3, v.R_1 + v.R_3);
  const alphaFrac = frac(v.R_1, v.R_1 + v.R_3);
  const kFrac = frac(v.R_6, v.R_2 + v.R_6);
  const fmt = (x: number): string => {
    // 정수면 정수로, 아니면 소수 표기 (최대 3자리)
    if (Number.isInteger(x)) return String(x);
    return String(Math.round(x * 1000) / 1000);
  };

  const content = [
    `그림은 연산증폭기 응용 회로이다.`,
    `이 회로는 V_i를 입력으로 받아 U_1과 U_2 두 개의 연산 증폭기로 출력 V_s를 만들며,`,
    `U_2의 출력 V_s가 R_2와 R_6를 통해 U_1의 V⁺ 단자로 되먹임되는 구조이다.`,
    `제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오.`,
    `(단, 연산증폭기는 안정한 선형영역에서 동작하며, 입력 임피던스는 무한대이고 출력 임피던스는 영(0)이다.)`,
  ].join(" ");

  const conditions = [
    `R_1 = ${v.R_1} kΩ (V_i → V⁻(U_1)), R_3 = ${v.R_3} kΩ (U_1 피드백)`,
    `R_4 = ${v.R_4} kΩ (V_o → V⁻(U_2)), R_5 = ${v.R_5} kΩ (U_2 피드백)`,
    `R_2 = ${v.R_2} kΩ (V_s → V⁺(U_1) 전역 피드백), R_6 = ${v.R_6} kΩ (V⁺(U_1) → GND)`,
    `V⁺(U_2)는 GND. OPAMP 이상적 (선형영역, R_in=∞, R_out=0)`,
  ];

  const question = [
    `[단계 1] 회로에서 V_s/V_o를 R_4와 R_5의 값을 이용하여 구한다.`,
    `[단계 2] 회로에서 V⁺(U_1)를 R_2와 R_6의 값을 이용하여 구하고,`,
    `  V⁻(U_1) = β·V_i + α·V_o 의 β와 α를 R_1과 R_3의 값을 이용하여 구한다.`,
    `[단계 3] [단계 1]과 [단계 2]에서 구한 결과를 이용하여 V_o/V_i와 V_s/V_i를 구한다.`,
  ].join("\n");

  const answer = [
    `[단계 1] V_s/V_o = −R_5/R_4 = ${fmt(a.Vs_over_Vo)}`,
    `[단계 2] V⁺(U_1) = (R_6/(R_2+R_6))·V_s = (${kFrac})·V_s,  β = R_3/(R_1+R_3) = ${betaFrac},  α = R_1/(R_1+R_3) = ${alphaFrac}`,
    `[단계 3] V_o/V_i = ${fmt(a.Vo_over_Vi)},  V_s/V_i = ${fmt(a.Vs_over_Vi)}`,
  ].join("\n");

  const solution = [
    `[단계 1] U_2 단 해석 — V⁺(U_2) = GND이므로 가상접지에 의해 V⁻(U_2) = 0.`,
    `  V⁻(U_2)에 KCL: (V_o − 0)/R_4 + (V_s − 0)/R_5 = 0  →  V_s = −(R_5/R_4)·V_o`,
    `  ∴ V_s/V_o = −${v.R_5}/${v.R_4} = ${fmt(a.Vs_over_Vo)}`,
    ``,
    `[단계 2] U_1의 V⁺ — 이상 OPAMP는 입력으로 전류가 흐르지 않으므로 R_2·R_6는 V_s에 대한 전압 분배:`,
    `  V⁺(U_1) = V_s·R_6/(R_2+R_6) = V_s·${v.R_6}/${v.R_2 + v.R_6} = (${kFrac})·V_s`,
    `  U_1의 V⁻ — R_1(V_i 쪽)과 R_3(V_o 쪽)의 중첩 (전류가 OPAMP로 유입되지 않으므로 두 저항의 직렬 분배):`,
    `  V⁻(U_1) = V_i·R_3/(R_1+R_3) + V_o·R_1/(R_1+R_3) = (${betaFrac})·V_i + (${alphaFrac})·V_o`,
    `  ∴ β = ${betaFrac}, α = ${alphaFrac}`,
    ``,
    `[단계 3] 이상 OPAMP의 가상 단락 V⁺(U_1) = V⁻(U_1)에 [단계 1]·[단계 2] 결과 대입:`,
    `  (${kFrac})·V_s = (${betaFrac})·V_i + (${alphaFrac})·V_o,   V_s = ${fmt(a.Vs_over_Vo)}·V_o 이므로`,
    `  (${kFrac})·(${fmt(a.Vs_over_Vo)})·V_o − (${alphaFrac})·V_o = (${betaFrac})·V_i`,
    `  V_o·(${fmt(round3(a.vPlusCoef * a.Vs_over_Vo))} − ${alphaFrac}) = (${betaFrac})·V_i`,
    `  ∴ V_o/V_i = ${fmt(a.Vo_over_Vi)}`,
    `  ∴ V_s/V_i = (V_s/V_o)·(V_o/V_i) = (${fmt(a.Vs_over_Vo)})·(${fmt(a.Vo_over_Vi)}) = ${fmt(a.Vs_over_Vi)}`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
