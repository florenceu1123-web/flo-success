/**
 * 임용 5번(2전원 RLC phasor) classifier 안정성 smoke.
 *
 *  목적: Vision 요약문구·inventory 표기가 변동(열화)해도 AC phasor 회로가
 *        transient(rc/rl/rlc_step)로 떨어지지 않고 universal_ac로 흡수되는지 검증.
 *        (transient type은 waveform figure를 강제 → phasor 정상상태 문제에서
 *         missing_waveform·missing_figure_variant 오류 유발.)
 *
 *  실행: npx tsx scripts/smokeImyong5AcPhasorClassify.ts
 */
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType";
import type { AnalysisResult } from "../types";

function show(label: string, a: AnalysisResult) {
  const cls = classifyCircuitType(a, "circuit_theory");
  const NORMALIZED = new Set([
    "universal_ac", "ac_superposition", "ac_parallel_branches",
    "rlc_resonance_max_power",
  ]);
  const ok = NORMALIZED.has(cls.type);
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${cls.type}  — ${cls.reasoning}`);
  return cls.type;
}

// 정상 Vision (오전 로그 재현) — 텍스트에 페이저/교류 키워드 + inventory 임피던스 표기.
const RICH = {
  topic: "RLC 회로의 페이저 해석",
  interpretation:
    "두 개의 교류 전원이 포함된 RLC 회로에서 페이저 전압과 전류를 구하는 문제입니다. " +
    "각 소자에 흐르는 전류를 계산하고 평균 전력을 구합니다. 페이저 해석.",
  relatedConcepts: ["페이저 해석", "평균 전력", "임피던스", "교류 회로"],
  fillInTheBlanks: [],
  subjectKey: "circuit_theory",
  topicKey: "rlc_response",
  componentInventory: [
    { id: "V1", type: "V", value: "√8∠45°V" },
    { id: "V2", type: "V", value: "2∠180°V" },
    { id: "R1", type: "R", value: "1Ω" },
    { id: "R2", type: "R", value: "1Ω" },
    { id: "C1", type: "C", value: "-j2Ω" },
    { id: "C2", type: "C", value: "-j2Ω" },
    { id: "L", type: "L", value: "j3Ω" },
  ],
  semantic: { hasStateTransition: false, hasEquivalentTransformation: false, hasWaveformEvolution: true, requiresMultiFigure: false },
} as unknown as AnalysisResult;

// 열화 Vision — 텍스트에서 AC 키워드 빠지고 inventory도 임피던스 표기 없이 magnitude만.
//   (Vision이 "주파수 영역"을 시간응답으로 요약하고 -j2Ω를 2Ω로 단순화하는 실제 변동 재현.)
const DEGRADED = {
  topic: "RLC 회로 해석",
  interpretation:
    "주어진 RLC 회로에서 각 소자에 흐르는 전류를 구하고, 저항에서 소비되는 전력과 " +
    "전원이 공급하는 전력을 단계별로 계산하는 문제입니다.",
  relatedConcepts: ["RLC 회로", "전류", "전력", "회로 해석"],
  fillInTheBlanks: [],
  subjectKey: "circuit_theory",
  topicKey: "rlc_response",
  componentInventory: [
    { id: "V1", type: "V", value: "2.83V" },
    { id: "V2", type: "V", value: "2V" },
    { id: "R1", type: "R", value: "1Ω" },
    { id: "R2", type: "R", value: "1Ω" },
    { id: "C1", type: "C", value: "2Ω" },
    { id: "C2", type: "C", value: "2Ω" },
    { id: "L", type: "L", value: "3Ω" },
  ],
  semantic: { hasStateTransition: false, hasEquivalentTransformation: false, hasWaveformEvolution: true, requiresMultiFigure: false },
} as unknown as AnalysisResult;

console.log("\n[임용 5번 2전원 RLC phasor — classifier 안정성]");
console.log("  (✓ = normalize 리스트 = waveform 면제 / ✗ = transient 등으로 떨어짐 → 오류)\n");
const t1 = show("정상 Vision (키워드+임피던스)", RICH);
const t2 = show("열화 Vision (AC 시그니처 누락)", DEGRADED);

const NORMALIZED = new Set(["universal_ac", "ac_superposition", "ac_parallel_branches", "rlc_resonance_max_power"]);
const allOk = NORMALIZED.has(t1) && NORMALIZED.has(t2);
console.log(`\n결과: ${allOk ? "PASS — 두 케이스 모두 AC 정상상태로 흡수" : "FAIL — 열화 케이스가 transient로 떨어짐 (waveform 강제 → 오류)"}`);
process.exit(allOk ? 0 : 1);
