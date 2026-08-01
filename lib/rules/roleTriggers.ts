import type { FigureRole } from "@/types";
import { isConceptNamingText } from "@/lib/analysis/deviceIdentity";

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
  // switching_circuit topic — 기본적으로 state pair (정의가 두 상태 비교).
  //   ★ 단, semantic이 **명시적으로** hasStateTransition=false면 요구하지 않는다 (2026-07-29 실측 신고).
  //     Vision은 topicKey를 자주 오판한다 — 페이저 중첩 문제(ac_superposition, 스위치 없음·단일 정상상태
  //     figure)가 topicKey=switching_circuit으로 분석돼 state_before/state_after를 요구당하고
  //     **missing_figure_variant 2건**이 사용자 화면에 떴다. 어떤 archetype이 상태쌍을 안 만드는지는
  //     route의 semantic normalize가 이미 알고 있으므로(단일 진실 공급원), 그 판단을 여기서 존중한다.
  if (args.topicKey === "switching_circuit") return args.semantic.hasStateTransition !== false;

  // digital_logic은 state_before/after 트리거에서 제외.
  //   · state_before/after는 analog switching (t<0 vs t>0) 의미 전용.
  //   · FSM/플립플롭의 "상태 전이"는 implementation_circuit + (필요 시 concept_diagram 상태도)로 표현.

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
  // ★ 전자기학은 회로가 아니라 장(field) 도식(em_field_diagram = concept_diagram role)만 쓴다.
  //   회로 figure role(main_circuit·state·equivalent·waveform)은 어느 것도 요구하지 않는다.
  //   ※ 없으면 analyze가 "전자기 유도" 등을 hasWaveformEvolution=true로 판정 시 "waveform"이
  //     잘못 required로 붙어 missing_figure_variant(waveform) 오류 발생(실측: moving_rod_emf).
  //   digital_logic은 waveform_analysis 등에서 waveform이 실제 필요하므로 제외하지 않는다.
  //   ★ C언어·통신·교육학도 회로가 아니므로 동일하게 회로 figure role을 요구하지 않는다.
  if (
    args.subjectKey === "electromagnetics" ||
    args.subjectKey === "c_language" ||
    args.subjectKey === "communications" ||
    args.subjectKey === "pedagogy"
  ) return [];

  // ★ 소자 종류 식별 개념형(설명→명칭 쓰기)도 회로 문제가 아니다.
  //   회로 figure를 요구하면 "다이오드+인덕터 폐루프" 같은 무의미한 회로가 생성되고
  //   analog_circuit_open("전원 없음")까지 연쇄로 터진다(실측 신고).
  if (isConceptNamingText(args.text)) return [];

  const roles = new Set<FigureRole>();

  const state = isStateTransitionProblem(args);
  const explicitEquivalent = isExplicitEquivalentProblem(args);
  const wantsIOWaveform = wantsInputOutputWaveformPair(args);

  if (state) {
    // state 문제 — main_circuit 대신 state_before/after
    roles.add("state_before");
    roles.add("state_after");
  } else if (args.subjectKey !== "digital_logic" && args.subjectKey !== "electromagnetics") {
    // digital_logic은 kmap/implementation_circuit 등 자체 figure role 사용 — main_circuit 불필요.
    // electromagnetics는 회로가 아니라 장 도식(concept_diagram role) — main_circuit 불필요.
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
