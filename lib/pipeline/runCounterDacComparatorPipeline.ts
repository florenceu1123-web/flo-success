import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateCounterDacComparator, generateShiftRegisterDac } from "@/lib/generation/topologies/counterDacComparator";
import { writeCounterDacComparatorText } from "@/lib/generation/topologies/counterDacComparatorTextWriter";
import { writeShiftRegisterDacText } from "@/lib/generation/topologies/shiftRegisterDacTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runCounterDacComparatorPipeline");

export async function runCounterDacComparatorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  // ★ 원본 구조 도출 — D 플립플롭 시프트레지스터(임용10)와 JK 카운터(임용8)는 근본 구조가 다르다.
  //   분석 텍스트의 FF 종류 키워드 + Q 출력 라벨 개수로 결정 (inventory FF 추출이 불안정해 텍스트 우선).
  const { structure, bits } = deriveShiftOrCounter(analysis);
  log.info("counter_dac_structure", { structure, bits });

  return generateInParallel(count, async (i, seed) => {
    const isShift = structure === "d_shift_register";
    const gen = isShift
      ? generateShiftRegisterDac({ bits, seed, mode })
      : generateCounterDacComparator({ params: analysis?.circuitType?.params, seed, mode });
    log.info("counter_dac_comparator_generated", {
      structure,
      values: gen.values,
      answer: gen.answer,
    });
    const text = isShift
      ? writeShiftRegisterDacText({ generation: gen, mode, topicLabel })
      : await writeCounterDacComparatorText({ generation: gen, mode, topicLabel, contextHint });

    const bitsGen = gen.values.bits;
    const qWave = isShift
      ? Array.from({ length: bitsGen }, (_, b) => `Q_${b}`).join("·")
      : (bitsGen >= 3 ? "Q_A'·Q_B'·Q_C'" : "Q_A'·Q_B'");

    // (가) 단일 mixed_circuit + (나) waveform 템플릿(클럭만 채움, 나머지 blank)
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_mixed_${i + 1}`,
        label: isShift
          ? `(가) 응용회로 (${bitsGen}-bit D 시프트레지스터 + R-2R DAC + OPAMP)`
          : `(가) 응용회로 (${bitsGen}-bit JK 카운터 + DAC + 비교기)`,
        role: "main_circuit",
        diagramType: "mixed_circuit",
        diagram: gen.mixedCircuit,
      },
      {
        id: `fig_waveform_${i + 1}`,
        label: `(나) ${isShift ? "클럭·A·" : "클럭·"}${qWave}·V_o 파형`,
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveformTemplate,
      },
    ];

    // 정답·풀이 영역: 채워진 파형 — 학생이 단계 1·3에서 도시할 내용의 정답.
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_waveform_solution_${i + 1}`,
        label: `(나) 파형 — 정답 (${qWave}·V_o 채워진 형태)`,
        role: "solution_waveform",
        diagramType: "waveform",
        diagram: gen.waveformSolution,
      },
    ];

    return {
      id: randomUUID(),
      content: text.content,
      conditions: text.conditions,
      question: text.question,
      answer: text.answer,
      solution: text.solution,
      topicKey,
      figureVariants,
      solutionFigures,
    };
  });
}

/**
 * 분석에서 FF 구조(시프트레지스터 vs 카운터)와 비트 수 도출.
 *  - FF 종류: "D 플립플롭"·"D-FF" 키워드 → 시프트레지스터, "JK" → 카운터 (둘 다면 JK 우선).
 *  - 비트 수: Q 출력 라벨(Q_0·Q_1·Q_2 또는 Q_A·Q_B·Q_C) 개수 ∪ FF inventory 개수, 2~4 clamp.
 *    inventory FF 추출이 자주 D(diode)로 오인되므로 텍스트의 Q 라벨 카운트를 우선.
 */
function deriveShiftOrCounter(analysis?: AnalysisResult | null): {
  structure: "jk_counter" | "d_shift_register";
  bits: number;
} {
  const text = [
    analysis?.topic ?? "",
    analysis?.interpretation ?? "",
    (analysis?.relatedConcepts ?? []).join(" "),
    (analysis?.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");

  const isJK = /JK|J-K/i.test(text);
  const isD = /D\s*플립플롭|D[-\s]?F\s*\/?\s*F|D\s*flip|시프트|shift\s*register/i.test(text);
  const structure: "jk_counter" | "d_shift_register" =
    isJK && !isD ? "jk_counter" : isD ? "d_shift_register" : "jk_counter";

  const qNum = new Set(Array.from(text.matchAll(/Q[_]?([0-9])/g)).map((m) => m[1]));
  const qAlpha = new Set(
    Array.from(text.matchAll(/Q[_]?([A-D])(?![A-Za-z])/g)).map((m) => m[1].toUpperCase()),
  );
  const ffInv = (analysis?.componentInventory ?? []).filter((c) =>
    /FF|플립플롭/i.test(String(c.type ?? "")),
  ).length;
  let bits = Math.max(qNum.size, qAlpha.size, ffInv);
  bits = Math.min(4, Math.max(2, bits || 3));

  return { structure, bits };
}
