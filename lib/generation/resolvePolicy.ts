import { GENERATION_POLICIES, type GenerationMode, type GenerationPolicy } from "@/types";

/** Pipeline 4단계: 모드 → 정책 객체 매핑. */
export function resolvePolicy(mode: GenerationMode): GenerationPolicy {
  return GENERATION_POLICIES[mode];
}
