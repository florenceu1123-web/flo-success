import type { FigureRole } from "@/types";

type Semantic = {
  hasStateTransition?: boolean;
  hasEquivalentTransformation?: boolean;
  hasWaveformEvolution?: boolean;
};

export type ResolveFigureRolesArgs = {
  subjectKey: string;
  topicKey?: string;
  /** 본문/조건/질문 합친 텍스트 (키워드 인식용) */
  text: string;
  semantic: Semantic;
};

const EQUIVALENT_TOPICS = new Set([
  "thevenin",
  "norton",
  "source_transformation",
  "equivalent_circuit",
  "small_signal_equivalent",
  "impedance_equivalent",
]);

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

/**
 * state pair (state_before/state_after) 트리거 — 보수적으로 결정.
 *
 * 트리거 조건 (어느 하나):
 *   1. semantic.hasStateTransition === true (analyze가 명시적으로 판정)
 *   2. 본문에 (스위치/SW/switch 키워드) AND (열려/닫혀/open/closed/t<0/t>0 등 상태어) 함께
 *
 * 다음 단독으론 트리거 안 함:
 *   - "(가)/(나)" 만 — RC 응답 문제(파형+회로)에도 흔히 등장
 *   - transient_rc/transient_rl — 파형 측정 문제일 수도, 스위치 문제일 수도
 *   - 스위치 키워드 단독 — "스위치 회로" 일반 언급일 수도
 *   - 상태어 단독 — "정상상태에서 …" 일반 언급일 수도
 *   - supermesh/supernode topic 단독 — 기본 형태는 단일 DC 회로 (switch 동반 아님)
 */
function isStateTransitionProblem(args: ResolveFigureRolesArgs): boolean {
  // switching_circuit topic — 항상 state pair (이건 정의가 두 상태 비교)
  if (args.topicKey === "switching_circuit") return true;

  // digital_logic — semantic.hasStateTransition (FSM/플립플롭) 신뢰
  if (args.subjectKey === "digital_logic" && args.semantic.hasStateTransition === true) {
    return true;
  }

  // analog (circuit_theory/electronics) — semantic 단독 신뢰 안 함.
  //  · GPT가 transient_rc/RL 응답을 "상태 변화"로 misclassify하는 경우 잦음.
  //  · 본문에 switch keyword + state word가 함께 등장해야 state pair 트리거.
  const text = args.text;
  const hasSwitchKeyword = hasAny(text, ["스위치", "SW", "switch"]);
  const hasStateWord = hasAny(text, [
    "열려", "닫혀", "닫은 후", "연 후",
    "open", "closed",
    "t<0", "t>0", "t=0",
  ]);
  return hasSwitchKeyword && hasStateWord;
}

function isExplicitEquivalentProblem(args: ResolveFigureRolesArgs): boolean {
  const text = args.text;
  const explicitTopic = EQUIVALENT_TOPICS.has(args.topicKey ?? "");
  const explicitKeyword = hasAny(text, [
    "테브난", "노턴", "등가회로", "소스 변환", "전원 변환",
    "임피던스 등가", "소신호 등가",
    "small-signal", "equivalent circuit",
  ]);
  return explicitTopic || explicitKeyword;
}

/**
 * waveform 문제: 입력 파형과 출력 파형을 따로 요구할지 결정.
 * - 본문에 "입력 파형/출력 파형/오실로스코프/probe/측정/V_s(t)/V_c(t)" 등 신호 측정 표현
 * - semantic.hasWaveformEvolution true이면서 (위 텍스트 시그널 또는 transient_rc/rl/rlc topic)
 */
function wantsInputOutputWaveformPair(args: ResolveFigureRolesArgs): boolean {
  if (!args.semantic.hasWaveformEvolution) return false;
  const text = args.text;
  return hasAny(text, [
    "입력 파형", "출력 파형",
    "오실로스코프", "probe", "프로브",
    "측정한 파형", "측정 파형",
    "Ch1", "Ch2", "CH1", "CH2",
    "V_s(t)", "V_c(t)", "Vs(t)", "Vc(t)",
    "v_s(t)", "v_c(t)",
  ]) || ["transient_rc", "transient_rl", "rlc_response"].includes(args.topicKey ?? "");
}

/**
 * Trigger 기반 figure role 결정.
 *  - state 문제 → state_before/after (main_circuit 대신)
 *  - 그 외 → main_circuit
 *  - 명시적 등가 → equivalent_circuit
 *  - waveform: pair signal이면 input_waveform + output_waveform, 아니면 generic waveform
 */
export function resolveRequiredFigureRoles(args: ResolveFigureRolesArgs): FigureRole[] {
  const roles = new Set<FigureRole>();

  const state = isStateTransitionProblem(args);
  const explicitEquivalent = isExplicitEquivalentProblem(args);
  const wantsIOWaveform = wantsInputOutputWaveformPair(args);

  if (state) {
    // state 문제 — main_circuit 대신 state_before/after
    roles.add("state_before");
    roles.add("state_after");
  } else if (args.subjectKey !== "digital_logic") {
    // digital_logic은 kmap/implementation_circuit 등 자체 figure role 사용 — main_circuit 불필요
    roles.add("main_circuit");
  }

  if (explicitEquivalent) roles.add("equivalent_circuit");

  if (args.semantic.hasWaveformEvolution) {
    if (wantsIOWaveform) {
      roles.add("input_waveform");
      roles.add("output_waveform");
    } else {
      roles.add("waveform");
    }
  }

  return [...roles];
}
