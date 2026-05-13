import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { buildFromTopology } from "@/lib/generation/topologyDriven/buildFromTopology";
import { writeTopologyDrivenText } from "@/lib/generation/topologies/topologyDrivenTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runTopologyDrivenPipeline");

/**
 * Generic topology-driven 파이프라인 — analysis.topologySignature.branches를 그대로 따라
 *  netlist를 결정론으로 생성. archetype 가정에서 벗어나는 (SW + 종속전원 + supermesh hybrid 등)
 *  케이스를 처리.
 *
 *  SW 두 상태(open/closed)가 있으면 figure 2개 ((가)·(나)), 없으면 1개.
 */
export async function runTopologyDrivenPipeline(args: {
  analysis: AnalysisResult;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);
  const topology = analysis.topologySignature;
  if (!topology) {
    throw new Error("runTopologyDrivenPipeline: analysis.topologySignature 누락 — 이 파이프라인 호출 전에 검사 필요");
  }

  return generateInParallel(count, async (i, seed) => {
    const gen = buildFromTopology({ topology, mode, seed });
    log.info("topology_driven_generated", {
      hasSwitch: gen.hasSwitch,
      hasDependentSource: gen.hasDependentSource,
      isSupermesh: gen.isSupermesh,
      components: gen.netlistOpen.components.length,
      values: gen.values,
    });

    const text = await writeTopologyDrivenText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [];
    if (gen.hasSwitch && gen.netlistClosed) {
      // SW가 있는 케이스: (가) open / (나) closed — 단, 첫 figure는 ruleSet의 required
      // role(original_circuit) 충족용으로 main_circuit 의미도 함께 가지도록 "original_circuit".
      figureVariants.push({
        id: `fig_open_${i + 1}`,
        label: "(가) SW 열림",
        role: "original_circuit",
        diagramType: "analog_netlist",
        diagram: gen.netlistOpen,
      });
      figureVariants.push({
        id: `fig_closed_${i + 1}`,
        label: "(나) SW 닫힘",
        role: "state_after",
        diagramType: "analog_netlist",
        diagram: gen.netlistClosed,
      });
    } else {
      figureVariants.push({
        id: `fig_main_${i + 1}`,
        label: "주어진 회로",
        role: "original_circuit",
        diagramType: "analog_netlist",
        diagram: gen.netlistOpen,
      });
    }

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
