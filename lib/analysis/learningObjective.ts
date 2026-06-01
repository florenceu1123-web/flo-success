/**
 * Learning Objective 추출 (2026-05-31 사용자 박음, step 1 starter).
 *
 * 회로 형식(OPAMP·RLC 등)이 아닌 "학생이 무엇을 학습하는가"를 textHint에서 inferring.
 * Pipeline dispatch의 1차 신호 — Image stream(Evidence)과 Text stream(Objective)이 합쳐져
 * Router로.
 *
 * 핵심: "이 문제는 OpAmp 문제가 아니라 Transfer Function + Oscillation 문제다."
 */

/**
 * 학습 목표 boolean flags. 다중 매치 가능 (한 문제가 여러 목표 동시 다룸).
 */
export type LearningObjective = {
  asks_transfer_function: boolean;       // V_out(s)/V_in(s) 도출
  asks_oscillation_frequency: boolean;   // 특성방정식 근·발진 주파수
  asks_average_power: boolean;           // 평균전력 (전원·R·L/C)
  asks_max_power_transfer: boolean;      // R_L 최대 전력 전달
  asks_transient_response: boolean;      // RC/RL step·v(t)·i(t) 도출
  asks_frequency_response: boolean;      // 공진·주파수응답 곡선
  asks_equivalent_circuit: boolean;      // Thevenin/Norton 등가
  asks_region_identification: boolean;   // BJT/MOSFET 영역 (포화/활성/차단)
  asks_logic_minimization: boolean;      // K-map·최소 SOP·POS
  asks_state_analysis: boolean;          // FSM·상태표·다음 상태
};

/**
 * 빈 objective (모두 false).
 */
function emptyObjective(): LearningObjective {
  return {
    asks_transfer_function: false,
    asks_oscillation_frequency: false,
    asks_average_power: false,
    asks_max_power_transfer: false,
    asks_transient_response: false,
    asks_frequency_response: false,
    asks_equivalent_circuit: false,
    asks_region_identification: false,
    asks_logic_minimization: false,
    asks_state_analysis: false,
  };
}

/**
 * textHint (topic·interpretation·conditions·question·fillInTheBlanks 합친 텍스트)에서
 * learning objective flags 추출.
 */
export function extractLearningObjective(textHint: string): LearningObjective {
  const text = textHint.toLowerCase();
  const obj = emptyObjective();

  // Transfer Function — V_out(s)/V_in(s) 또는 전달함수·전달특성
  if (/전달\s*함수|전달\s*특성|transfer\s*function|v_out\s*\(s\)\s*\/\s*v_in|v_o\s*\/\s*v_in/i.test(text)) {
    obj.asks_transfer_function = true;
  }
  // Oscillation — 발진·oscillator·특성방정식·근으로 주파수
  if (/발진|oscillat|특성방정식.*근|특성방정식의?\s*근|발진\s*조건|barkhausen/i.test(text)) {
    obj.asks_oscillation_frequency = true;
  }
  // Average Power — 평균전력 (단, "최대 평균전력"은 max_power로 별도)
  if (/평균\s*전력|average\s*power/i.test(text) && !/최대\s*평균\s*전력|최대\s*전력|p_?max/i.test(text)) {
    obj.asks_average_power = true;
  }
  // Maximum Power Transfer — R_L 최대 전력 전달
  if (/최대\s*전력|최대\s*평균\s*전력|p_?max|maximum\s*power|r_?l.*최대|최대.*r_?l/i.test(text)) {
    obj.asks_max_power_transfer = true;
  }
  // Transient — RC/RL step·v(t)·i(t)·과도응답
  if (/과도\s*응답|transient|v\(t\)|i\(t\)|시간\s*응답|step\s*response|t\s*=\s*0/i.test(text)) {
    obj.asks_transient_response = true;
  }
  // Frequency Response — 공진·주파수응답
  if (/공진|resonan|주파수\s*응답|frequency\s*response|보드\s*선도|bode/i.test(text)) {
    obj.asks_frequency_response = true;
  }
  // Equivalent Circuit — 테브난·노턴 등가
  if (/테브난|thevenin|노턴|norton|등가\s*회로|equivalent\s*circuit|v_?th|r_?th|i_?n/i.test(text)) {
    obj.asks_equivalent_circuit = true;
  }
  // Region Identification — BJT/MOSFET 영역 (포화·활성·차단)
  if (/포화\s*영역|활성\s*영역|차단\s*영역|동작\s*영역|영역\s*식별|saturation|cutoff|active\s*region|triode/i.test(text)) {
    obj.asks_region_identification = true;
  }
  // Logic Minimization — K-map·SOP·POS·최소화
  if (/k-?map|카르노|sop|pos|최소화된?\s*불|최소합|최소곱|민텀|maxterm|minterm/i.test(text)) {
    obj.asks_logic_minimization = true;
  }
  // State Analysis — FSM·상태표·다음 상태
  if (/상태표|다음\s*상태|상태\s*전이도|fsm|finite\s*state|state\s*table|state\s*diagram|상태\s*기계/i.test(text)) {
    obj.asks_state_analysis = true;
  }

  return obj;
}

/**
 * objective의 true flag만 추출 (로깅용).
 */
export function listObjectives(obj: LearningObjective): string[] {
  return Object.entries(obj)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
}
