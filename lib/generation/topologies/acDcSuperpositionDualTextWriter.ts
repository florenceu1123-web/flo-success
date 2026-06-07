import type { AcDcSuperpositionDualGeneration } from "./acDcSuperpositionDual";

/**
 * 직류+교류 중첩 **쌍대(dual) 회로** 결정론 텍스트 라이터 (기출변형유형).
 *
 * 원본(전압원·직렬 R·병렬 L·i 측정)의 쌍대:
 *   전류원·병렬 R·직렬 C·v 측정. 3단계 해석 방향 보존:
 *   [단계 1] 직류만 → V_DC (C 개방)
 *   [단계 2] 교류만 → 전압 분배비 + v_ac(t) (페이저 정상상태)
 *   [단계 3] 둘 다 → 중첩 v(t) = V_DC + v_ac(t)
 */

export type AcDcSuperpositionDualTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export function writeAcDcSuperpositionDualText(args: {
  generation: AcDcSuperpositionDualGeneration;
}): AcDcSuperpositionDualTextOutput {
  const { values, solution } = args.generation;
  const measured = values.caps[0];
  const omega = values.omega;
  const xCeq = 1 / (omega * values.Ceq);

  // ── 본문 ──
  const content =
    `다음 그림은 직류 전류원과 교류 전류원이 스위치로 연결된 RC 응용 회로이다. ` +
    `저항 R(${values.R}Ω) 양단의 전압을 v(t)라 한다. ` +
    `직렬 커패시터 ${measured.id}(${measured.label}) 양단의 전압을 v₁(t)라 한다. ` +
    `제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오.`;

  // ── 조건 ──
  const conditions = [
    `각 단계별 해석은 정상 상태 응답(steady state response)으로 하고, ` +
      `각 단계에서의 커패시터 양단 전압의 초기 값은 영(0)으로 한다.`,
    `스위치 SW₁이 단자2에 연결되면 직류 전류원(${values.IdcMilli} mA)이 회로에 연결되고, ` +
      `단자1에 연결되면 직류 전류원은 개방(open)된다.`,
    `스위치 SW₂가 단자4에 연결되면 교류 전류원(${values.IacLabel})이 회로에 연결되고, ` +
      `단자3에 연결되면 교류 전류원은 개방(open)된다.`,
  ];

  // ── <해석 절차> ──
  const step1 =
    `[단계 1] 스위치 SW₁이 단자2에 연결되고 스위치 SW₂가 단자3에 연결된 경우의 ` +
    `v(t)를 V_DC라고 할 때, V_DC[V]를 구한다.`;
  const step2 =
    `[단계 2] SW₁이 단자1에 연결되고 SW₂가 단자4에 연결된 경우의 v(t), v₁(t)를 ` +
    `각각 v_ac(t), v_1ac(t)라고 할 때, v_1ac(t)/v_ac(t)와 v_ac(t)[V]를 각각 구한다.`;
  const step3 =
    `[단계 3] SW₁이 단자2에 연결되고 SW₂가 단자4에 연결된 경우, ` +
    `[단계 1]과 [단계 2]를 이용하여 v(t)[V]를 구한다.`;
  const question = `<해석 절차>\n${step1}\n${step2}\n${step3}`;

  // ── 정답 ──
  const answer = [
    `[단계 1] V_DC = ${solution.vDcVolts} V`,
    `[단계 2] v_1ac(t)/v_ac(t) = ${solution.dividerRatioLabel}, v_ac(t) = ${solution.vAcExpression}`,
    `[단계 3] v(t) = ${solution.totalExpression}`,
  ].join(" / ");

  // ── 풀이 ──
  const sol1 =
    `[단계 1] 직류 전류원만 연결된 경우 — 직류 정상상태에서 커패시터는 개방(open)으로 동작한다. ` +
    `따라서 직류 전류 ${values.IdcMilli} mA는 모두 저항 R로 흐르고, ` +
    `V_DC = ${values.IdcMilli} mA × ${values.R}Ω = ${solution.vDcVolts} V.`;

  const sol2 =
    `[단계 2] 교류 전류원만 연결된 경우 — 페이저 정상상태 해석. ` +
    `직렬 커패시터 등가 C_eq = ${values.CeqLabel}, ` +
    `리액턴스 X_Ceq = 1/(ωC_eq) = ${xCeq}Ω = R. ` +
    `병렬 어드미턴스 Y = 1/R + jωC_eq = (1 + j)/R → |Y| = √2/R, 위상 +45°. ` +
    `따라서 전압 v = I/Y 는 위상 −45°, 진폭 = ${values.IacRmsMilli} mA × ${values.R}Ω = ${solution.vAcPeakVolts} V. ` +
    `즉 v_ac(t) = ${solution.vAcExpression}. ` +
    `직렬 커패시터 전압 분배: v_1ac/v_ac = C_eq/${measured.id} = ${solution.dividerRatioLabel} ` +
    `→ v₁(t) = ${solution.vReactiveExpression}.`;

  const sol3 =
    `[단계 3] 직류·교류 전류원이 모두 연결된 경우 — 회로가 선형이므로 중첩의 원리를 적용한다. ` +
    `v(t) = V_DC + v_ac(t) = ${solution.totalExpression}. ` +
    `(직류 ${solution.vDcVolts} V 위에 진폭 ${solution.vAcPeakVolts} V의 정현파가 −45° 위상으로 실린다.)`;

  const solution_text = [sol1, sol2, sol3].join("\n");

  return { content, conditions, question, answer, solution: solution_text };
}
