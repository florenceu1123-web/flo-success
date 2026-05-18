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
  const opampCount = analysis?.componentInventory?.filter((c) => c.type === "OPAMP").length ?? 0;
  const interpretation = (analysis?.interpretation ?? "").toLowerCase();
  const topic = (analysis?.topic ?? "").toLowerCase();
  const fullText = `${interpretation} ${topic}`;
  // cascade 키워드 — "직렬"은 너무 광범위(회로이론 "직렬 회로"와 충돌)이라 제거. 명확한 multi-OPAMP 시그니처만.
  const cascadeKeywords = [
    "cascade", "두 단 증폭", "2단 증폭", "두 단의 연산", "2단의 연산",
    "두 opamp", "2 opamp", "두 연산증폭기", "두 연산 증폭기", "다단 증폭",
  ];
  const finiteGainKeywords = [
    // 한국어
    "개방 루프 이득", "개방루프", "유한 이득", "유한이득", "직류 이득",
    "차단 주파수", "복소 주파수", "복소주파수",
    "블록도", "블록 도", "블럭도", "신호 흐름", "신호흐름",
    "연산 증폭기 응용", "연산증폭기 응용",
    // 영어
    "open loop", "open-loop", "block diagram", "signal flow", "dc gain",
    // 수식/심볼
    "a(s)", "ω_0", "ω0", "a_0",
    // 그리스 — 임용 11번 블록도에 명시
    "α",
  ];
  const positiveFeedbackKeywords = [
    // 한국어 정귀환/정궤환 표현 — GPT가 다양하게 번역
    "정귀환", "정궤환", "정 귀환", "정 궤환",
    "양의 귀환", "양 귀환", "양의 궤환", "양 궤환",
    "양의 피드백", "양 피드백", "양의 되먹임", "양 되먹임",
    "positive feedback",
    // 임용 6번 본문 특유 표현
    "비반전 입력 단자의 전압", "비반전 입력 전압", "비반전 입력에 걸리는 전압", "피드백 계수",
    "v+ = β", "v+=β", "v^+ = β", "β·v_out", "β v_out",
    "b·ω_0/(s+d·ω_0)", "b와 d를 β와", "k를 구하시오",
    // 임용 6번에 등장하는 D = -10^4 (positive feedback 시그니처)
    "d = -10", "d=-10",
  ];
  const isCascade = opampCount >= 2 || cascadeKeywords.some((k) => fullText.includes(k.toLowerCase()));
  const matchedFiniteGain = finiteGainKeywords.find((k) => fullText.includes(k.toLowerCase()));
  const matchedPositiveFb = positiveFeedbackKeywords.find((k) => fullText.includes(k.toLowerCase()));
  const isPositiveFb = Boolean(matchedPositiveFb);
  const isFiniteGain = Boolean(matchedFiniteGain);
  // 우선순위: positive_feedback > inverting_finite_gain > cascade
  const forcedArchetype = isPositiveFb
    ? "positive_feedback"
    : (isFiniteGain ? "inverting_finite_gain" : (isCascade ? "cascade" : undefined));
  log.info("opamp_archetype_decision", {
    forced: forcedArchetype ?? "(none — random pick)",
    opampCount,
    isPositiveFb,
    matchedPositiveFb: matchedPositiveFb ?? null,
    isFiniteGain,
    matchedFiniteGain: matchedFiniteGain ?? null,
    isCascade,
    textPreview: fullText.slice(0, 300),
  });

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpamp({ params: analysis?.circuitType?.params, seed, archetype: forcedArchetype });
    log.info("opamp_generated", {
      archetype: gen.archetype,
      Vout: gen.Vout, Vminus: gen.Vminus, Vplus: gen.Vplus,
      values: gen.values,
    });
    const text = await writeOpampText({ generation: gen, mode, topicLabel, contextHint });
    // (나) figure — archetype별 다른 종류:
    //  · cascade: 등가 single OPAMP template (analog_netlist)
    //  · inverting_finite_gain: 블록도 (block_diagram)
    const extraFigures = gen.secondaryBlockDiagram
      ? [{
          id: `fig_block_${i + 1}`,
          label: gen.secondaryLabel ?? "(나) 블록도",
          role: "concept_diagram",
          diagramType: "block_diagram" as const,
          diagram: gen.secondaryBlockDiagram,
        }]
      : gen.secondaryNetlist
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
