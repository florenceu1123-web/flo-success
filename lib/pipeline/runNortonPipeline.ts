import { createLogger } from "@/lib/logger";
import { generateNorton, type NortonArchetype } from "@/lib/generation/topologies/norton";
import { generateThevenin } from "@/lib/generation/topologies/thevenin";
import { writeNortonText } from "@/lib/generation/topologies/nortonTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runNortonPipeline");

export async function runNortonPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  // ★ 기출변형유형 = 쌍대(dual): 노턴 등가(전류원·병렬 R) → 테브난 등가(전압원·직렬 R).
  //   thevenin→norton의 대칭. voltage_divider 회로 + 테브난 등가 도출. 결정론 텍스트.
  if (mode === "exam_variant") {
    return generateInParallel(count, async (i, seed) => {
      const gen = generateThevenin({ archetype: "voltage_divider", seed });
      const V = gen.values;
      log.info("norton_dual_thevenin_generated", { Vth: gen.answer.Vth, Rth: gen.answer.Rth, values: V });
      const text = {
        content: [
          `그림은 직류 전압원(V₁=${V.V1}V)과 두 저항(R₁=${V.R1}Ω 직렬, R₂=${V.R2}Ω)으로 구성된 2단자(a–b) 회로이다.`,
          `이는 노턴 등가(전류원·병렬 저항) 문제의 **쌍대 회로**(전압원·직렬 저항)이다.`,
          `단자 a–b에서 본 **테브난 등가회로**(전압원 V_th + 직렬 저항 R_th)를 구하시오.`,
        ].join(" "),
        conditions: [
          `전압원 V₁=${V.V1}V — R₁=${V.R1}Ω 직렬 — 단자 a, R₂=${V.R2}Ω (a–b 사이)`,
          `쌍대 관계: 전류원↔전압원, 병렬 R↔직렬 R, 노턴(I_N·R_N)↔테브난(V_th·R_th)`,
        ],
        question: [
          `[단계 1] 단자 a–b 개방전압 V_th(=V_oc)를 구한다.`,
          `[단계 2] 전원을 죽이고 a–b에서 본 등가저항 R_th를 구한다. (테브난 등가: V_th + R_th 직렬)`,
        ].join("\n"),
        answer: [
          `[단계 1] V_th = ${gen.answer.Vth} V`,
          `[단계 2] R_th = ${gen.answer.Rth} Ω   (테브난 등가: ${gen.answer.Vth}V + ${gen.answer.Rth}Ω 직렬)`,
        ].join("\n"),
        solution: [
          `[단계 1] 개방전압: 전압분배 V_th = V₁·R₂/(R₁+R₂) = ${V.V1}·${V.R2}/(${V.R1}+${V.R2}) = ${gen.answer.Vth} V.`,
          `[단계 2] 전압원 단락 → a에서 본 저항 = R₁∥R₂ = ${V.R1}·${V.R2}/(${V.R1}+${V.R2}) = ${gen.answer.Rth} Ω.`,
          `  (★ 노턴 등가 I_N∥R_N의 쌍대 = 테브난 V_th·R_th. V_th=I_N·R_N, R_th=R_N.)`,
        ].join("\n"),
      };
      return assembleProblem({
        text, netlist: gen.netlist,
        figureLabel: "주어진 회로 (테브난 형식, 쌍대)", figureRole: "original_circuit",
        figureIdSuffix: i + 1, topicKey,
      });
    });
  }

  const archetype: NortonArchetype = "current_source_with_parallel_R";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateNorton({ archetype, params: analysis?.circuitType?.params, seed });
    log.info("norton_generated", { archetype: gen.archetype, In: gen.answer.In, Rn: gen.answer.Rn, values: gen.values });
    const text = await writeNortonText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
