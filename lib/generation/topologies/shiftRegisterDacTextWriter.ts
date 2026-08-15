import type { GenerationMode } from "@/types";
import type { CounterDacComparatorGeneration } from "./counterDacComparator";

/**
 * **T 플립플롭 체인** + R-2R DAC + OPAMP(아날로그) 문제의 본문·문항·풀이 — 결정론 생성.
 *  GPT 호출 없음(임용 10번 형식): 시뮬레이션 결과(Q 토글 상태·V_o)를 그대로 서술해 그림·답 일치 보장.
 *
 * ★★ **사용자 지정(2026-08-04): 원본의 D 플립플롭 → T 플립플롭으로 출제**.
 *   배선은 원본과 동일(T_0 = A, T_b = Q_{b-1}, 공통 클럭)하고 소자만 T-FF로 바뀐다.
 *   D-FF는 `Q ← 입력`(한 클럭 지연)이지만 T-FF는 **여기(excitation)** 라
 *   **Q_b(t+1) = Q_b(t) ⊕ T_b(t)** 로 매 클럭 토글을 추적해야 한다.
 */
export type ShiftRegisterDacTextOutput = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

/** 정답 파형에서 특정 신호의 클럭별 논릿값 시퀀스를 뽑는다. */
function seqOf(gen: CounterDacComparatorGeneration, name: string): number[] {
  const sig = (gen.waveformSolution?.signals ?? []).find((s) => s.name === name);
  if (!sig) return [];
  // stepSamples는 마지막에 꼬리 샘플을 한 번 더 붙이므로 클럭 수만큼만 취한다.
  const pts = (sig.samples ?? []).slice();
  return pts.slice(0, Math.max(0, pts.length - 1)).map((p) => Number(p.v));
}

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
  const vStepTex = v.vStepTex ?? String(vStep);
  const voFormula = v.voFormula ?? `V_o = (Σ 2^b·Q_b)×(${vStepTex})[V]`;
  const ffRange = `T_0~T_${bits - 1}`;

  // ㉡ 지점의 클럭 인덱스 (정답 파형 marker에서 역산) 및 그 지점의 V_o·Q 논릿값
  const markers = generation.waveformSolution?.markers ?? [];
  const mk = markers.find((m) => m.label === "㉡");
  const markerIdx = mk ? Math.max(0, Math.round(Number(mk.t) - 0.5)) : 0;
  const markerVo = a.Vplus_at_marker;

  const aSeq = seqOf(generation, "A");
  const qSeqs = qLabels.map((_, b) => seqOf(generation, `Q_${b}`));
  // ㉠ 구간 = 첫 클럭부터 ㉡ 직전까지 (원본의 ㉠는 넓은 구간, ㉡은 끝 부근의 한 지점)
  const spanEnd = Math.max(1, markerIdx);
  const q1Span = (qSeqs[1] ?? []).slice(0, spanEnd);
  const aSpan = aSeq.slice(0, spanEnd);
  const q0Span = (qSeqs[0] ?? []).slice(0, spanEnd);
  const markerQ = qSeqs.map((s) => s[markerIdx] ?? 0);
  const markerQText = qLabels.map((L, b) => `${L}=${markerQ[b]}`).join(", ");
  const weighted = qLabels
    .map((L, b) => `${1 << b}×${markerQ[b]}`)
    .reverse()
    .join(" + ");

  const content =
    `그림 (가)는 입력 신호 A가 ${bits}개의 T 플립플롭(${ffRange})으로 구성된 회로에 인가되고, ` +
    `각 플립플롭 출력 ${qList}이 R-2R 저항망(D/A 변환기)과 연산증폭기를 통해 아날로그 출력 V_o로 변환되는 응용 회로이다. ` +
    `그림 (나)와 같이 입력 A와 클럭이 인가될 때, 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 구하시오. ` +
    `(단, 연산증폭기와 T 플립플롭은 이상적으로 동작하고, T 플립플롭 출력 ${qList}의 초깃값은 모두 0이며, ` +
    `논릿값 1은 ${Vhigh}[V], 논릿값 0은 0[V]이다.)`;

  const conditions = [
    `T 플립플롭 ${bits}개가 클럭 상승에지에 **동기**로 동작한다: T_0 = A, T_b = Q_{b-1} (b ≥ 1)`,
    `T 플립플롭의 여기 관계: Q_b(t+1) = Q_b(t) ⊕ T_b(t) — T=1이면 토글, T=0이면 유지`,
    `D/A 변환: ${voFormula}  (1 LSB = ${vStepTex}[V])`,
    `연산증폭기는 DAC 출력을 버퍼링 — V_o는 ${qList}의 가중합 아날로그 전압`,
    `${qList} 초깃값 = 0, 논릿값 1 = ${Vhigh}[V]`,
  ];

  const question = [
    `[단계 1] 그림 (나)의 ㉠ 구간(첫 번째 클럭부터 ㉡ 직전까지 ${spanEnd}개 클럭)에서의 Q_1의 출력 논릿값을 시간 순서대로 구한다.`,
    `[단계 2] 그림 (가)에서 T 플립플롭 출력 ${qList}에 의한 출력 V_o의 식을 구한다.`,
    `[단계 3] 그림 (나)의 ㉡ 지점에서의 T 플립플롭의 출력 ${qList}의 논릿값을 제시하고, 이를 [단계 2]의 V_o 식에 적용하여 출력 V_o[V]를 구한다.`,
  ].join("\n");

  const answer = [
    `[단계 1] Q_1 : ${q1Span.join(" → ")}`,
    `[단계 2] ${voFormula}`,
    `[단계 3] ㉡ 지점에서 ${markerQText} → V_o = ${markerVo}[V]`,
  ].join("\n");

  const solution = [
    `[단계 1] T 플립플롭은 **여기 관계 Q(t+1) = Q(t) ⊕ T** 를 따른다(T=1이면 토글, T=0이면 유지).`,
    `  이 회로는 T_0 = A, T_1 = Q_0, T_2 = Q_1 … 이고 **공통 클럭에 동기**이므로,`,
    `  매 클럭 갱신에는 반드시 **직전 클럭의 Q 값**을 함께 사용한다(한 단씩 순차 대입하면 틀린다).`,
    `  · Q_0(t+1) = Q_0(t) ⊕ A(t) → A 입력열: ${aSpan.join(" → ")}  ⇒ Q_0: ${q0Span.join(" → ")}`,
    `  · Q_1(t+1) = Q_1(t) ⊕ Q_0(t) → Q_0가 1인 클럭에서만 Q_1이 토글한다.`,
    `  ⇒ ㉠ 구간의 **Q_1 : ${q1Span.join(" → ")}** (그림 (나) 정답 파형 참조).`,
    `[단계 2] R-2R 저항망은 각 비트에 2진 가중치를 부여한다. Q_b의 가중치는 2^b(LSB=Q_0)이며 1 LSB = ${vStepTex}[V].`,
    `  ${voFormula}.`,
    `[단계 3] ㉡ 지점의 논릿값은 ${markerQText} 이므로 [단계 2] 식에 대입하면`,
    `  V_o = (${weighted})×(${vStepTex}) = ${markerVo}[V].`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}
