import { createLogger } from "@/lib/logger";
import { generateDcSupernode, generateDcSupernodeDual } from "@/lib/generation/topologies/dcSupernode";
import { writeDcSupernodeText } from "@/lib/generation/topologies/dcSupernodeTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDcSupernodePipeline");

export async function runDcSupernodePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  // ★ 기출변형유형 = 쌍대(dual): 슈퍼노드(공유 전압원·노드) → 슈퍼메시(공유 전류원·메시).
  //   V↔I, R↔G, 노드↔메시, 공유 V_s↔공유 I_s, 전류원 I1↔전압원 V1. 결정론 텍스트.
  if (mode === "exam_variant") {
    return generateInParallel(count, async (i, seed) => {
      const gen = generateDcSupernodeDual({ seed });
      const v = gen.values;
      log.info("dc_supernode_dual_generated", { target: gen.targetBranch, I: gen.targetCurrent, values: v });
      const text = {
        content: [
          `그림은 직류 전압원(V₁=${v.V1}V)과 두 저항(R₁=${v.R1d}Ω, R₂=${v.R2d}Ω), 그리고 두 메시가 공유하는 전류원(I_s=${v.Is}A)으로 구성된 회로이다.`,
          `이는 슈퍼노드 회로(공유 전압원·노드 해석)의 **쌍대 회로**(공유 전류원·메시 해석)이다. **슈퍼메시 해석**으로 각 단계 결과를 구하시오.`,
          `(단, I_s가 두 메시의 공유 가지에 있어 단일 메시 KVL이 불가 → 슈퍼메시로 묶어 해석한다.)`,
        ].join(" "),
        conditions: [
          `메시1: V₁ + R₁; 메시2: R₂; 공유 가지: 전류원 I_s=${v.Is}A`,
          `쌍대 관계: 공유 전압원↔공유 전류원, 노드전압↔메시전류, R↔G, 직렬↔병렬`,
        ],
        question: [
          `[단계 1] 슈퍼메시 KVL + 제약(공유 가지 전류 = I_s)으로 메시 전류를 구한다.`,
          `[단계 2] R${gen.targetBranch === "R1" ? "₁" : "₂"}에 흐르는 전류를 구한다.`,
        ].join("\n"),
        answer: [
          `[단계 1] I_R₁ = ${gen.branchCurrents.R1} A,  I_R₂ = ${gen.branchCurrents.R2} A`,
          `[단계 2] ${gen.targetBranch} 전류 = ${gen.targetCurrent} A`,
        ].join("\n"),
        solution: [
          `[단계 1] 공유 전류원 I_s 때문에 두 메시를 슈퍼메시로 묶는다. 슈퍼메시 KVL + 제약(공유 가지 전류=I_s=${v.Is}A) →`,
          `  I_R₁ = ${gen.branchCurrents.R1}A, I_R₂ = ${gen.branchCurrents.R2}A.`,
          `[단계 2] ${gen.targetBranch} 전류 = ${gen.targetCurrent}A.`,
          `  (★ 슈퍼노드(공유 전압원·노드)의 구조적 쌍대 = 슈퍼메시(공유 전류원·메시). 노드전압↔메시전류.)`,
        ].join("\n"),
      };
      return assembleProblem({
        text, netlist: gen.netlist,
        figureLabel: "주어진 회로 (슈퍼메시, 쌍대)", figureRole: "original_circuit",
        figureIdSuffix: i + 1, topicKey,
      });
    });
  }

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDcSupernode({ params: analysis?.circuitType?.params, seed });
    log.info("dc_supernode_generated", {
      target: gen.target, value: gen.targetValue,
      Vn1: gen.Vn1, Vn2: gen.Vn2, Ivs: gen.IvsBranch,
      values: gen.values,
    });
    const text = await writeDcSupernodeText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로 (supernode)", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
