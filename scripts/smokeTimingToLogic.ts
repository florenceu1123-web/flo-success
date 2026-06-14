/**
 * 임용 8번 (타이밍 도표 → 카르노맵·회로·NAND 도출) smoke.
 *
 *  검증:
 *   1. classifier가 "타이밍 도표 + 카르노맵 작성 + NAND/회로 도시" 분석을
 *      waveform_analysis + params.timingGivenDeriveCircuit 로 분류하는가.
 *   2. writeTimingToLogicText가 3단계(카르노맵→회로→NAND) 텍스트 + NAND 형태를 만드는가.
 *   3. generateWaveformAnalysis가 8조합 타이밍(A·B·C·F) + 정답 kmap을 만드는가 (규칙 기반).
 *
 *  실행: npx tsx scripts/smokeTimingToLogic.ts
 */
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType";
import { generateWaveformAnalysis } from "../lib/generation/topologies/waveformAnalysis";
import { writeTimingToLogicText } from "../lib/generation/topologies/timingToLogicTextWriter";
import type { AnalysisResult } from "../types";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("  ✗ FAIL:", msg); failed++; }
  else console.log("  ✓", msg);
}

// ── 1. classifier ──
console.log("[classifier]");
const analysis = {
  topic: "타이밍 도표 기반 논리회로 분석",
  interpretation: "입력 A, B, C와 출력 F의 타이밍 도표(timing diagram)로부터 F의 카르노 도를 작성하고, 최소화하여 논리회로를 도시한 뒤 2입력 NAND 게이트만으로 도시한다.",
  relatedConcepts: ["타이밍 도표", "카르노맵", "NAND 게이트", "불 함수 최소화"],
  signals: { inputs: ["A", "B", "C"], outputs: ["F"] },
  semantic: { hasStateTransition: false, hasEquivalentTransformation: false, hasWaveformEvolution: true, requiresMultiFigure: true },
  fillInTheBlanks: [{ sentence: "출력 F를 2입력 NAND 게이트만으로 도시한다.", answer: "NAND" }],
} as unknown as AnalysisResult;
const cls = classifyCircuitType(analysis, "digital_logic");
assert(cls.type === "waveform_analysis", `circuitType = ${cls.type} (waveform_analysis 기대)`);
assert(cls.params?.timingGivenDeriveCircuit === true, `timingGivenDeriveCircuit = ${cls.params?.timingGivenDeriveCircuit}`);

// ── 2 & 3. generator + textwriter ──
console.log("[generator + textwriter]");
for (const seed of [1, 42, 4242, 777]) {
  const gen = generateWaveformAnalysis({ seed });
  const sigNames = gen.waveformDiagram.signals.map((s) => s.name);
  const hasABCF = ["A", "B", "C", "F"].every((n) => sigNames.includes(n));
  const t = writeTimingToLogicText({ generation: gen });
  const has3Steps = t.question.includes("[단계 1]") && t.question.includes("[단계 2]") && t.question.includes("[단계 3]");
  const hasNand = t.answer.includes("NAND") && /\)'/.test(t.answer);
  const hasF = t.answer.includes(gen.fExpression);
  assert(hasABCF && has3Steps && hasNand && hasF,
    `seed=${seed}: F=${gen.fExpression} | A·B·C·F 파형 + 3단계 + NAND형 + F정답 ok`);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
if (failed > 0) process.exit(1);
