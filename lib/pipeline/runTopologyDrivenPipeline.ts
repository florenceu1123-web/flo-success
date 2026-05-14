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
    // ★ analysis의 단자 라벨·부하 placeholder를 netlist로 pass-through.
    //   Thevenin·등가회로 문제의 단자 a/b·R_L이 시각화에 표시되도록.
    if (analysis.nodeAnnotations?.length) {
      gen.netlistOpen.nodeAnnotations = [...(gen.netlistOpen.nodeAnnotations ?? []), ...analysis.nodeAnnotations];
      if (gen.netlistClosed) gen.netlistClosed.nodeAnnotations = [...(gen.netlistClosed.nodeAnnotations ?? []), ...analysis.nodeAnnotations];
    }
    if (analysis.loadPlaceholders?.length) {
      gen.netlistOpen.loadPlaceholders = [...(gen.netlistOpen.loadPlaceholders ?? []), ...analysis.loadPlaceholders];
      if (gen.netlistClosed) gen.netlistClosed.loadPlaceholders = [...(gen.netlistClosed.loadPlaceholders ?? []), ...analysis.loadPlaceholders];
    }

    // ★ Thevenin·max_power_transfer 자동 보강 — GPT가 단자 a/b·R_L 추출 누락했어도
    //   본문 키워드가 hit하면 자동으로 단자 a/b(=가장 오른쪽 top node·GND)·R_L 추가.
    //   또한 circuitType이 thevenin/max_power_transfer로 분류돼도 trigger.
    const analysisText = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""} ${(analysis.relatedConcepts ?? []).join(" ")}`;
    const isThevLike =
      /테브난|테브닌|thevenin|등가\s*회로|최대\s*전력|최대전력|R_L|RL|maximum\s*power/i.test(analysisText) ||
      analysis.circuitType?.type === "thevenin" ||
      analysis.circuitType?.type === "max_power_transfer" ||
      analysis.circuitType?.type === "norton";
    log.info("thev_like_check", { isThevLike, circuitType: analysis.circuitType?.type, textSample: analysisText.slice(0, 120) });
    if (isThevLike) {
      // 가장 오른쪽 top node를 단자 a 후보로
      const topNodes = new Set<string>();
      for (const c of gen.netlistOpen.components) {
        for (const p of c.pins) {
          if (p.node.startsWith("n") && !["GND", "ground"].includes(p.node)) topNodes.add(p.node);
        }
      }
      const sortedTops = [...topNodes].sort();
      const lastTop = sortedTops[sortedTops.length - 1];
      if (lastTop) {
        // 단자 a/b가 없으면 자동 추가
        const existAnnLabels = new Set((gen.netlistOpen.nodeAnnotations ?? []).map((a) => a.label));
        const annAdds: NonNullable<typeof gen.netlistOpen.nodeAnnotations> = [];
        if (!existAnnLabels.has("a")) annAdds.push({ node: lastTop, label: "a", style: "terminal_dot" });
        if (!existAnnLabels.has("b")) annAdds.push({ node: "GND", label: "b", style: "terminal_dot" });
        if (annAdds.length > 0) {
          gen.netlistOpen.nodeAnnotations = [...(gen.netlistOpen.nodeAnnotations ?? []), ...annAdds];
          if (gen.netlistClosed) gen.netlistClosed.nodeAnnotations = [...(gen.netlistClosed.nodeAnnotations ?? []), ...annAdds];
        }
        // R_L 자동 추가
        if (!gen.netlistOpen.loadPlaceholders?.length) {
          const rl = { betweenNodes: [lastTop, "GND"] as [string, string], label: "R_L", emphasize: true };
          gen.netlistOpen.loadPlaceholders = [rl];
          if (gen.netlistClosed) gen.netlistClosed.loadPlaceholders = [rl];
          log.info("rl_auto_added", { betweenNodes: [lastTop, "GND"] });
        }
      }
    }
    log.info("topology_driven_generated", {
      hasSwitch: gen.hasSwitch,
      hasDependentSource: gen.hasDependentSource,
      isSupermesh: gen.isSupermesh,
      components: gen.netlistOpen.components.length,
      values: gen.values,
      nodeAnnotations: analysis.nodeAnnotations?.length ?? 0,
      loadPlaceholders: analysis.loadPlaceholders?.length ?? 0,
    });
    // 시각화 디버그용: 각 component의 type·id·pin 노드 dump
    log.info("netlist_dump", {
      ground: gen.netlistOpen.ground,
      components: gen.netlistOpen.components.map((c) => ({
        id: c.id,
        type: c.type,
        pinNodes: c.pins.map((p) => p.node),
        sides: c.pins.map((p) => p.side),
      })),
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
