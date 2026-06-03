import type { AcDcSuperpositionGeneration } from "./acDcSuperposition";

/**
 * 직류+교류 중첩 (acDcSuperposition) 결정론 텍스트 라이터.
 *
 * ★ GPT 호출 없음 — generator의 닫힌형 해를 그대로 서술 (그림·수식·풀이 불일치 원천 차단,
 *   opamp_cascade 패턴과 동일). 원본 임용 2022 B-6의 3단계 해석 절차 방향 보존:
 *   [단계 1] 직류만 연결 → I_DC (직류 정상상태, L 단락)
 *   [단계 2] 교류만 연결 → 전류 분배비 + i_ac(t) (페이저 정상상태)
 *   [단계 3] 둘 다 연결 → 중첩 i(t) = I_DC + i_ac(t)
 */

export type AcDcSuperpositionTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/**
 * 닫힌형 해 기반 문제 텍스트 생성 (결정론).
 */
export function writeAcDcSuperpositionText(args: {
  generation: AcDcSuperpositionGeneration;
  mode: string;
}): AcDcSuperpositionTextOutput {
  const { values, solution } = args.generation;
  const isL = values.reactiveKind === "L";
  const blockName = isL ? "인덕터" : "커패시터";
  const multiReactive = values.reactives.length >= 2;
  const rTotalExpr = values.resistors.map((r) => r.label).join(" + ");
  const measured = values.reactives[0];

  // ── 본문 ──
  const circuitName = isL ? "RL 응용 회로" : "RC 응용 회로";
  const content =
    `다음 그림은 직류 전압원과 교류 전압원이 스위치로 연결된 ${circuitName}이다. ` +
    `저항 ${values.resistors[0].label}에 흐르는 전류를 i(t)라 한다.` +
    (multiReactive
      ? ` ${blockName} ${measured.label}에 흐르는 전류를 i₁(t)라 한다.`
      : "") +
    ` 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오.`;

  // ── 조건 ──
  const conditions = [
    `각 단계별 해석은 정상 상태 응답(steady state response)으로 하고, ` +
      `각 단계에서의 ${blockName}에 흐르는 전류의 초기 값은 영(0)으로 한다.`,
    `스위치 SW₁이 단자2에 연결되면 직류 전압원(${values.Vdc}V)이 회로에 연결되고, ` +
      `단자1에 연결되면 직류 전압원은 단락(bypass)된다.`,
    `스위치 SW₂가 단자4에 연결되면 교류 전압원(${values.VacLabel})이 회로에 연결되고, ` +
      `단자3에 연결되면 교류 전압원은 단락(bypass)된다.`,
  ];

  // ── <해석 절차> (질문) ──
  const step1 =
    `[단계 1] 스위치 SW₁이 단자2에 연결되고 스위치 SW₂가 단자3에 연결된 경우의 ` +
    `i(t)를 I_DC라고 할 때, I_DC[mA]를 구한다.`;
  const step2 = multiReactive
    ? `[단계 2] SW₁이 단자1에 연결되고 SW₂가 단자4에 연결된 경우의 i(t), i₁(t)를 ` +
      `각각 i_ac(t), i_1ac(t)라고 할 때, i_1ac(t)/i_ac(t)와 i_ac(t)[mA]를 각각 구한다.`
    : `[단계 2] SW₁이 단자1에 연결되고 SW₂가 단자4에 연결된 경우의 i(t)를 ` +
      `i_ac(t)라고 할 때, i_ac(t)[mA]를 구한다.`;
  const step3 =
    `[단계 3] SW₁이 단자2에 연결되고 SW₂가 단자4에 연결된 경우, ` +
    `[단계 1]과 [단계 2]를 이용하여 i(t)[mA]를 구한다.`;
  const question = `<해석 절차>\n${step1}\n${step2}\n${step3}`;

  // ── 정답 ──
  const answerParts = [
    `[단계 1] I_DC = ${solution.iDcMilli} mA`,
    multiReactive
      ? `[단계 2] i_1ac(t)/i_ac(t) = ${solution.dividerRatioLabel}, i_ac(t) = ${solution.iAcExpression}`
      : `[단계 2] i_ac(t) = ${solution.iAcExpression}`,
    `[단계 3] i(t) = ${solution.totalExpression}`,
  ];
  const answer = answerParts.join(" / ");

  // ── 풀이 (닫힌형 해 그대로 서술) ──
  const omega = values.omega;
  const eqLabel = isL
    ? `L_eq = ${formatEq(values.eqValue)} H`
    : `C_eq = ${formatEq(values.eqValue * 1e6)} μF`;
  const reactance = isL
    ? omega * values.eqValue
    : 1 / (omega * values.eqValue);
  const phaseSign = isL ? "−" : "+";

  const sol1 = isL
    ? `[단계 1] 직류 전원만 연결된 경우 — 직류 정상상태에서 인덕터는 단락(short)으로 동작한다. ` +
      `따라서 회로는 직류 전압원 ${values.Vdc}V와 직렬 저항 ${rTotalExpr} = ${values.rTotal}Ω만의 회로가 되고, ` +
      `I_DC = ${values.Vdc}V / ${values.rTotal}Ω = ${solution.iDcMilli} mA.`
    : `[단계 1] 직류 전원만 연결된 경우 — 직류 정상상태에서 커패시터는 개방(open)으로 동작한다. ` +
      `따라서 직류 전류는 흐르지 못하고 I_DC = 0 mA.`;

  const dividerSol = multiReactive
    ? (isL
        ? ` 병렬 ${blockName} 전류 분배: i_1ac/i_ac = ${eqLabel.split(" = ")[1]}/${measured.label} = ${solution.dividerRatioLabel}.`
        : ` 병렬 ${blockName} 전류 분배: i_1ac/i_ac = ${measured.label}/${eqLabel.split(" = ")[1]} = ${solution.dividerRatioLabel}.`)
    : "";

  const sol2 =
    `[단계 2] 교류 전원만 연결된 경우 — 페이저 정상상태 해석. ` +
    `병렬 ${blockName} 등가 ${eqLabel}, ` +
    (isL
      ? `리액턴스 X_L = ωL_eq = ${omega}×${formatEq(values.eqValue)} = ${reactance}Ω. `
      : `리액턴스 X_C = 1/(ωC_eq) = ${reactance}Ω. `) +
    `합성 임피던스 Z = ${values.rTotal} ${isL ? "+" : "−"} j${reactance} Ω → |Z| = ${values.rTotal}√2 Ω, 위상 ${isL ? "+" : "−"}45°. ` +
    `교류 전압원 진폭 ${values.VacRms}√2 V이므로 전류 진폭 = ${values.VacRms}√2 / ${values.rTotal}√2 = ${solution.iAcPeakMilli} mA. ` +
    `따라서 i_ac(t) = ${solution.iAcExpression}.` +
    dividerSol;

  const sol3 =
    `[단계 3] 직류·교류 전원이 모두 연결된 경우 — 회로가 선형이므로 중첩의 원리를 적용한다. ` +
    `i(t) = I_DC + i_ac(t) = ${solution.totalExpression}. ` +
    `(직류 성분 위에 진폭 ${solution.iAcPeakMilli} mA의 정현파가 ${phaseSign}45° 위상으로 실려 흐른다.)`;

  const solution_text = [sol1, sol2, sol3].join("\n");

  return { content, conditions, question, answer, solution: solution_text };
}

/** 등가값 표시 — 0.1 → "0.1", 0.25 → "0.25", 분수 느낌 안 나는 깔끔한 소수 */
function formatEq(x: number): string {
  return `${Math.round(x * 1000) / 1000}`;
}
