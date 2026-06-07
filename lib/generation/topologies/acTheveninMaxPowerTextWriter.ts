import type { AcTheveninMaxPowerGeneration } from "./acTheveninMaxPower";

/**
 * 2전원 테브난 최대전력 (임용 10번) 결정론 텍스트 라이터.
 *   [단계 1] 단자 a-b 테브난 등가 임피던스 Z_th
 *   [단계 2] 단자 a-b 테브난 등가 전압 V_th (중첩)
 *   [단계 3] 부하 R_L 최대 평균 전력 (R_L = |Z_th|, P_max)
 */

export type AcTheveninMaxPowerTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export function writeAcTheveninMaxPowerText(args: {
  generation: AcTheveninMaxPowerGeneration;
}): AcTheveninMaxPowerTextOutput {
  const { values, solution } = args.generation;

  const content =
    `다음 그림은 2개의 교류 전원(전압원 V = ${values.VsLabel}, 전류원 I = ${values.IsLabel})이 포함된 ` +
    `RLC 회로이고, 부하 저항 R_L에 공급되는 전력을 구하려고 한다. 제시된 <해석 절차>에 따라 ` +
    `각 단계별로 풀이 과정과 함께 결과를 서술하시오.`;

  const conditions = [
    `전압원 V·전류원 I는 모두 페이저 표기(${values.VsLabel}, ${values.IsLabel})이며, ` +
      `리액턴스는 임피던스로 표시한다(예: j${values.XL1}Ω, −j${values.XC1}Ω).`,
    `부하 R_L은 순저항이며, 단자 a-b에 연결된다.`,
  ];

  const step1 = `[단계 1] 단자 a-b에서 회로를 바라본 테브난 등가 임피던스 Z_th [Ω]를 구한다. (전압원은 단락, 전류원은 개방)`;
  const step2 = `[단계 2] 단자 a-b에서의 테브난 등가 전압 V_th [V]를 중첩의 원리로 구한다.`;
  const step3 = `[단계 3] 부하 R_L에 최대 평균 전력이 전달되도록 하는 R_L [Ω]과 그때의 최대 평균 전력 P_max를 구한다.`;
  const question = `<해석 절차>\n${step1}\n${step2}\n${step3}`;

  const answer = [
    `[단계 1] Z_th = ${solution.ZthLabel}`,
    `[단계 2] V_th = ${solution.VthLabel}`,
    `[단계 3] R_L = ${formatRL(solution.ZthMag)} Ω (= |Z_th|), P_max = ${solution.PmaxLabel}`,
  ].join(" / ");

  const sol1 =
    `[단계 1] 전압원을 단락, 전류원을 개방한 뒤 단자 a-b에서 본 등가 임피던스를 구한다. ` +
    `상단망(R_top ${values.R1}Ω, L j${values.XL1}Ω, C −j${values.XC1}Ω)과 하단망(R ${values.R2}Ω, C −j${values.XC2}Ω)의 ` +
    `병렬 합성으로 Z_th = ${solution.ZthLabel}.`;

  const sol2 =
    `[단계 2] 두 전원이 단자 a-b에 기여하는 전압을 중첩으로 합한다. ` +
    `R_L을 개방한 상태에서 페이저 해석하면 V_th = ${solution.VthLabel}. (|V_th| = ${solution.VthMag} V)`;

  const sol3 =
    `[단계 3] 순저항 부하의 최대 전력 전달 조건은 R_L = |Z_th| = ${formatRL(solution.ZthMag)} Ω. ` +
    `이때 I = V_th/(Z_th + R_L), P_max = ½·|I|²·R_L = ${solution.PmaxLabel}.`;

  return { content, conditions, question, answer, solution: [sol1, sol2, sol3].join("\n") };
}

/** |Z_th| 표시 — 정수에 가까우면 정수, 아니면 소수 둘째자리. */
function formatRL(x: number): string {
  if (Math.abs(x - Math.round(x)) < 0.05) return `${Math.round(x)}`;
  return `${Math.round(x * 100) / 100}`;
}
