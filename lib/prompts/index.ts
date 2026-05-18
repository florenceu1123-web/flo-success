import type { SubjectKey } from "@/types";
import { ELECTRONICS_HINT, ELECTRONICS_GUIDE } from "./electronics";
import { CIRCUIT_THEORY_HINT, CIRCUIT_THEORY_GUIDE } from "./circuitTheory";
import { DIGITAL_LOGIC_HINT, DIGITAL_LOGIC_GUIDE } from "./digital";

export { SYSTEM_PROMPT } from "./system";

const MIXED_SIGNAL_HINT = "전자회로(OPAMP·비교기·트랜지스터)와 디지털논리(FF·게이트·카운터)가 같은 회로에 공존하는 복합형. 임용 8번 (2-bit JK 카운터 + R-2R DAC + 비교기) 등.";
const MIXED_SIGNAL_GUIDE = MIXED_SIGNAL_HINT;

/** SubjectKey → 짧은 한 줄 hint (analyze 등에서 사용) */
export const SUBJECT_HINT: Record<SubjectKey, string> = {
  electronics: ELECTRONICS_HINT,
  circuit_theory: CIRCUIT_THEORY_HINT,
  digital_logic: DIGITAL_LOGIC_HINT,
  mixed_signal: MIXED_SIGNAL_HINT,
};

/** SubjectKey → 생성용 도메인 가이드 (generate에서 사용) */
export const SUBJECT_GUIDE: Record<SubjectKey, string> = {
  electronics: ELECTRONICS_GUIDE,
  circuit_theory: CIRCUIT_THEORY_GUIDE,
  digital_logic: DIGITAL_LOGIC_GUIDE,
  mixed_signal: MIXED_SIGNAL_GUIDE,
};
