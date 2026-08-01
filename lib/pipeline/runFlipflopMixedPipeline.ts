import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateFfMixedApplication } from "@/lib/generation/topologies/ffMixedApplication";
import { writeFfMixedText } from "@/lib/generation/topologies/ffMixedTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runFlipflopMixedPipeline");

/**
 * 안전망 감지 — stale/오분류 analysis(프론트 캐시의 fsm·sequential_dff_generic·ff_with_waveform 등)라도
 * 텍스트·inventory가 "T 플립플롭 + JK 플립플롭 혼합"(임용 9번)이면 flipflop_mixed_app로 교정.
 * 두 종류(T·JK)가 모두 존재하는 것이 명확한 시그니처 → 오탐 위험 낮음.
 */
export function detectFfMixedApp(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => (typeof b === "string" ? b : (b as { text?: string })?.text ?? "")).join(" "),
  ].join(" ").toLowerCase();
  const inv = analysis.componentInventory ?? [];
  const upc = (t: unknown) => String(t ?? "").toUpperCase();
  const lvc = (v: unknown) => String(v ?? "").toLowerCase();

  const hasTFf = /t[\s-]?플립플롭|t[\s-]?ff|t[\s-]?플립|t\s*flip/.test(text) ||
    inv.some((c) => ["T", "TFF", "T-FF"].includes(upc(c.type)) || /t[\s-]?플립플롭|t[\s-]?ff/.test(lvc(c.value)));
  const hasJkFf = /jk[\s-]?플립플롭|j-?k[\s-]?플립플롭|jk[\s-]?ff|j-?k[\s-]?ff|제이케이/.test(text) ||
    inv.some((c) => ["JK", "JKFF", "JK-FF"].includes(upc(c.type)) || /jk[\s-]?플립플롭|j-?k[\s-]?ff/.test(lvc(c.value)));
  // MUX가 있으면 dff_mux_sequential 계열 → 양보
  const hasMux = /mux|멀티플렉서|multiplex/.test(text) || inv.some((c) => upc(c.type) === "MUX");
  return hasTFf && hasJkFf && !hasMux;
}

/**
 * T-FF + JK-FF 혼합 응용회로 pipeline.
 *
 * Figure 셋:
 *  (가) implementation_circuit — logic_network (T-FF + JK-FF + 조합부)
 *  (나) state_table             — truth_table (다중 column, 일부 셀 빈칸 ㄱ/ㄴ/ㄷ...)
 *  (다) waveform                — waveform (X·CLK·Q_A·Q_B 시뮬, t₁~t₄ 마커)
 */
export async function runFlipflopMixedPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateFfMixedApplication({ params: analysis?.circuitType?.params, seed });
    log.info("ff_mixed_generated", {
      expressions: gen.expressions,
      blanks: gen.blankAnswers.map((b) => `${b.symbol}=${b.answer}`),
    });

    const text = await writeFfMixedText({ generation: gen, mode, topicLabel, contextHint });

    // (가) 회로 + (나) 상태표(ㄱ/ㄴ/ㄷ blank) + (다) 파형 템플릿(Q_A·Q_B blank)
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_impl_${i + 1}`,
        label: "(가) 구현 회로 (T-FF + JK-FF + 조합부)",
        role: "implementation_circuit",
        diagramType: "ff_mixed_app_circuit",   // 전용 세로 스택 렌더러 (T-FF 위 · JK-FF 아래)
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_state_table_${i + 1}`,
        label: "(나) 상태표",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.stateTable,
      },
      {
        id: `fig_waveform_${i + 1}`,
        label: "(다) 입력 X·클럭 및 상태 Q_A·Q_B 파형",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveformTemplate,
      },
    ];

    // 정답·풀이 영역: Q_A·Q_B 채워진 파형
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_waveform_solution_${i + 1}`,
        label: "(다) 파형 — 정답 (Q_A·Q_B 채워진 형태)",
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
