import { createLogger } from "@/lib/logger";
import { generateOpamp } from "@/lib/generation/topologies/opamp";
import { writeOpampText } from "@/lib/generation/topologies/opampTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampPipeline");

export async function runOpampPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  // analysis로부터 OPAMP 개수·구조 키워드를 추출해 archetype을 강제 선택.
  // (analyze가 OPAMP를 inventory/branches에 명시 추출해야 동작 — analyzeImage prompt 보강과 짝.)
  const opampCount = analysis?.componentInventory?.filter((c) => c.type === "OPAMP").length ?? 0;
  const interpretation = (analysis?.interpretation ?? "").toLowerCase();
  const cascadeKeywords = ["cascade", "두 단", "2단", "직렬", "두 opamp", "2 opamp", "두 연산증폭기"];
  const isCascade = opampCount >= 2 || cascadeKeywords.some((k) => interpretation.includes(k.toLowerCase()));
  const forcedArchetype = isCascade ? "cascade" : undefined;
  if (forcedArchetype) {
    log.info("opamp_archetype_forced", { archetype: forcedArchetype, opampCount, reason: isCascade ? "OPAMP ≥ 2 또는 cascade 키워드" : "" });
  }

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpamp({ params: analysis?.circuitType?.params, seed, archetype: forcedArchetype });
    log.info("opamp_generated", {
      archetype: gen.archetype,
      Vout: gen.Vout, Vminus: gen.Vminus, Vplus: gen.Vplus,
      values: gen.values,
    });
    const text = await writeOpampText({ generation: gen, mode, topicLabel, contextHint });
    // cascade archetype은 (가)·(나) 두 figure — (나)는 단계 2의 등가 single OPAMP template.
    const extraFigures = gen.secondaryNetlist
      ? [{
          id: `fig_secondary_${i + 1}`,
          label: gen.secondaryLabel ?? "(나) 등가 회로",
          role: "main_circuit",
          diagramType: "analog_netlist" as const,
          diagram: gen.secondaryNetlist,
        }]
      : undefined;
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: `(가) OPAMP 회로 (${gen.archetype})`, figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey, extraFigures,
    });
  });
}
