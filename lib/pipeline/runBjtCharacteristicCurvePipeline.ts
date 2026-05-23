import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateBjtCharacteristicCurve } from "@/lib/generation/topologies/bjtCharacteristicCurve";
import { writeBjtCharacteristicCurveText } from "@/lib/generation/topologies/bjtCharacteristicCurveTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runBjtCharacteristicCurvePipeline");

/**
 * BJT/MOSFET 출력특성곡선 파이프라인 — 단일 figure(diagramType="characteristic_curve").
 *
 * 결정론 데이터(영역명·ON/OFF)는 generator가 산출, textWriter가 GPT로 문장 작성하되
 * answer 필드는 솔버 강제(enforced).
 */
export async function runBjtCharacteristicCurvePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateBjtCharacteristicCurve({ params: analysis?.circuitType?.params, mode, seed, index: i });
    log.info("characteristic_curve_generated", {
      device: gen.values.device,
      curveCount: gen.values.curveCount,
      regions: gen.regionAnswers.map((r) => `${r.marker}:${r.nameKr}/${r.switchState}`),
    });

    const text = await writeBjtCharacteristicCurveText({ generation: gen, mode, topicLabel, contextHint });

    const figureLabel = gen.values.device === "bjt"
      ? "BJT 출력특성곡선 (I_C-V_CE)"
      : "MOSFET 출력특성곡선 (I_D-V_DS)";

    // role을 main_circuit으로 — 단일 figure 문제이므로 main_circuit alias 그룹으로 validator 통과.
    // (figure 자체는 회로 netlist가 아닌 특성곡선 graph지만, 이 문제의 "주 figure" 역할).
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_curve_${i + 1}`,
        label: figureLabel,
        role: "main_circuit",
        diagramType: "characteristic_curve",
        diagram: gen.diagram,
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
    };
  });
}
