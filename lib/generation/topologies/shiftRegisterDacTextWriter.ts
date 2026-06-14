import type { GenerationMode } from "@/types";
import type { CounterDacComparatorGeneration } from "./counterDacComparator";

/**
 * D 플립플롭 시프트레지스터 + R-2R DAC + OPAMP(아날로그) 문제의 본문·문항·풀이 — 결정론 생성.
 *  GPT 호출 없음(임용 10번 형식): 시뮬레이션 결과(시프트 상태·V_o)를 그대로 서술해 그림·답 일치 보장.
 */
export type ShiftRegisterDacTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export function writeShiftRegisterDacText(args: {
  generation: CounterDacComparatorGeneration;
  mode: GenerationMode;
  topicLabel?: string;
}): ShiftRegisterDacTextOutput {
  const { generation } = args;
  const v = generation.values;
  const a = generation.answer;
  const bits = v.bits;
  const qLabels = v.qLabels ?? Array.from({ length: bits }, (_, b) => `Q_${b}`);
  const qList = qLabels.join(", ");
  const Vhigh = v.vLogicHigh ?? v.V_CC;
  const vStep = v.vStep ?? Vhigh / (1 << bits);
  const voFormula = v.voFormula ?? `V_o = (Σ 2^b·Q_b)·${vStep}`;

  // ㉡ 지점의 Q 상태 (정답 파형에서 markerIdx의 비트값)
  const markerVo = a.Vplus_at_marker;

  const content =
    `그림 (가)는 입력 신호 A가 ${bits}개의 D 플립플롭(D_0~D_${bits - 1})을 거쳐 시프트되고, ` +
    `각 플립플롭 출력 ${qList}이 R-2R 저항망(D/A 변환기)과 연산증폭기를 통해 아날로그 출력 V_o로 변환되는 응용 회로이다. ` +
    `그림 (나)와 같이 입력 A와 클럭이 인가될 때, 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 구하시오. ` +
    `(단, 연산증폭기와 D 플립플롭은 이상적으로 동작하고, D 플립플롭 출력 ${qList}의 초깃값은 모두 0이며, ` +
    `논릿값 1은 ${Vhigh}[V], 논릿값 0은 0[V]이다.)`;

  const conditions = [
    `D 플립플롭 ${bits}개로 구성된 시프트레지스터: 입력 A → D_0 → D_1 → … (클럭 상승에지 동기)`,
    `각 클럭에서 Q_0 ← A, Q_b ← Q_{b-1} (시프트)`,
    `D/A 변환: ${voFormula}  (1 LSB = ${vStep}[V])`,
    `연산증폭기는 DAC 출력을 버퍼링 — V_o는 ${qList}의 가중합 아날로그 전압`,
    `${qList} 초깃값 = 0, 논릿값 1 = ${Vhigh}[V]`,
  ];

  const question = [
    `[단계 1] 그림 (나)의 ㉠ 구간에서의 Q_1의 출력 논릿값을 시간 순서대로 구한다.`,
    `[단계 2] 그림 (가)에서 D 플립플롭 출력 ${qList}에 의한 출력 V_o의 식을 구한다.`,
    `[단계 3] 그림 (나)의 ㉡ 지점에서의 D 플립플롭의 출력 ${qList}의 논릿값을 제시하고, 이를 [단계 2]의 V_o 식에 적용하여 출력 V_o[V]를 구한다.`,
  ].join("\n");

  const answer = [
    `[단계 1] Q_1은 입력 A가 한 클럭 지연되어 나타남: Q_1(t) = A(t−1) (그림 (나) 정답 파형 참조).`,
    `[단계 2] ${voFormula}`,
    `[단계 3] ㉡ 지점에서 V_o = ${markerVo}[V]`,
  ].join("\n");

  const solution = [
    `[단계 1] 시프트레지스터는 매 클럭 상승에지에서 Q_0←A, Q_1←Q_0, Q_2←Q_1로 한 칸씩 이동한다.`,
    `  각 단은 한 클럭씩 지연시키므로 Q_b(t) = A(t−b). 따라서 Q_1(t) = A(t−1).`,
    `  ㉠ 구간의 A 입력열을 한 클럭 지연시켜 Q_1 파형을 얻는다.`,
    `[단계 2] R-2R 저항망은 각 비트에 2진 가중치를 부여한다. Q_b의 가중치는 2^b(LSB=Q_0)이며 1 LSB = ${vStep}[V].`,
    `  ${voFormula}.`,
    `[단계 3] ㉡ 지점의 ${qList} 논릿값을 [단계 2] 식에 대입하면 V_o = ${markerVo}[V].`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}
