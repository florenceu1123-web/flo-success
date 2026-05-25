import { createLogger } from "@/lib/logger";
import { generateUniversalAcPwl } from "@/lib/generation/topologies/universalAcPwl";
import { writeUniversalAcPwlText } from "@/lib/generation/topologies/universalAcPwlTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
  type WaveformDiagram,
} from "@/types";

const log = createLogger("lib/pipeline/runUniversalAcPwlPipeline");

/**
 * Universal AC PWL pipeline (임용 6번 형식 — SW + 다이오드 + AC clamp).
 *
 *  path:
 *    1) generateUniversalAcPwl — params·seed 기반 변형 수치 + netlist + 시뮬 답 추출
 *       (내부에서 simulateTimeStepPwl + extractImyong6Answers 호출)
 *    2) writeUniversalAcPwlText — GPT로 문제 문장·풀이 작성, 솔버 수치 강제
 *    3) assembleProblem — netlist를 figure로, text와 묶어 GeneratedProblem 반환
 */
export async function runUniversalAcPwlPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateUniversalAcPwl({ params: analysis?.circuitType?.params, seed });
    log.info("generated", {
      values: gen.values,
      answer: gen.answer,
    });
    const text = await writeUniversalAcPwlText({ generation: gen, mode, topicLabel, contextHint });

    // 추가 figure: v_i(t) 입력 파형 (문제용) + v_o(t) 출력 파형 (풀이용)
    const viDiagram: WaveformDiagram = {
      signals: [{ name: "v_i(t)", samples: gen.viWaveform, shape: "linear" }],
      unit: { time: "ms", value: "V" },
      xAxis: { symbol: "t", unit: "ms" },
      markers: [
        { t: gen.values.T_ms / 2, label: "T/2" },
        { t: gen.values.T_ms, label: "T" },
      ],
    };
    const voDiagram: WaveformDiagram = {
      signals: [{ name: "v_o(t)", samples: gen.voWaveform, shape: "linear" }],
      unit: { time: "ms", value: "V" },
      xAxis: { symbol: "t", unit: "ms" },
      yMarkers: [
        { v: gen.answer.step3_Vo_max, label: "V_o,max" },
        { v: gen.answer.step3_Vo_min, label: "V_o,min" },
      ],
    };
    const extraFigures: FigureVariant[] = [
      {
        id: `fig_vi_${i + 1}`,
        label: "v_i(t) 입력 파형 (한 주기)",
        role: "input_waveform",
        diagramType: "waveform",
        diagram: viDiagram,
      },
      {
        id: `fig_vo_${i + 1}`,
        label: "v_o(t) 출력 파형 (정상상태 한 주기)",
        role: "solution_waveform",
        diagramType: "waveform",
        diagram: voDiagram,
      },
    ];

    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: "SW + 다이오드 + 교류 클램프 회로 (임용 6번 형식)",
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
      extraFigures,
    });
  });
}
