import { createLogger } from "@/lib/logger";
import { generateSwitchedRlc5leg } from "@/lib/generation/topologies/switchedRlc5leg";
import { writeSwitchedRlc5legText } from "@/lib/generation/topologies/switchedRlc5legTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runSwitchedRlc5legPipeline");

export async function runSwitchedRlc5legPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateSwitchedRlc5leg({ params: analysis?.circuitType?.params, seed });
    log.info("switched_rlc_5leg_generated", { values: gen.values });

    const text = await writeSwitchedRlc5legText({ generation: gen, mode, topicLabel, contextHint });

    // ★ figure 정책: validator가 main_circuit + state_before + state_after 모두 요구.
    //   v_C(t) waveform은 단계 3의 학생 도출 정답이라 figure로 노출 안 함 (학습 의도 보존).
    //   세 figure는 동일 netlist 공유 (SW arm 방향 차이 시각화는 v2에서 추가).
    const stateBefore: FigureVariant = {
      id: `fig_state_before_${i + 1}`,
      label: "회로 상태 — t<0 (SW=A, 직류 정상상태)",
      role: "state_before",
      diagramType: "analog_netlist",
      diagram: gen.netlist,
    };
    const stateAfter: FigureVariant = {
      id: `fig_state_after_${i + 1}`,
      label: "회로 상태 — t≥0 (SW=B, 전환 직후)",
      role: "state_after",
      diagramType: "analog_netlist",
      diagram: gen.netlist,
    };

    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: "Switched RLC 회로 (6-leg, 임용 9번)",
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
      extraFigures: [stateBefore, stateAfter],
    });
  });
}
