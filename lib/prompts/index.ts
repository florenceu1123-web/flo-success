import type { SubjectKey } from "@/types";
import { ELECTRONICS_HINT, ELECTRONICS_GUIDE } from "./electronics";
import { CIRCUIT_THEORY_HINT, CIRCUIT_THEORY_GUIDE } from "./circuitTheory";
import { DIGITAL_LOGIC_HINT, DIGITAL_LOGIC_GUIDE } from "./digital";

export { SYSTEM_PROMPT } from "./system";

/** SubjectKey → 짧은 한 줄 hint (analyze 등에서 사용) */
export const SUBJECT_HINT: Record<SubjectKey, string> = {
  electronics: ELECTRONICS_HINT,
  circuit_theory: CIRCUIT_THEORY_HINT,
  digital_logic: DIGITAL_LOGIC_HINT,
};

/** SubjectKey → 생성용 도메인 가이드 (generate에서 사용) */
export const SUBJECT_GUIDE: Record<SubjectKey, string> = {
  electronics: ELECTRONICS_GUIDE,
  circuit_theory: CIRCUIT_THEORY_GUIDE,
  digital_logic: DIGITAL_LOGIC_GUIDE,
};
