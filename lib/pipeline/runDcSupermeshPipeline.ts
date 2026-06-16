import { createLogger } from "@/lib/logger";
import { generateDcSupermesh, generateDcSupermeshDual } from "@/lib/generation/topologies/dcSupermesh";
import { writeDcSupermeshText } from "@/lib/generation/topologies/dcSupermeshTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDcSupermeshPipeline");

export async function runDcSupermeshPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  // ★ 기출변형유형 = 쌍대(dual): 슈퍼메시(공유 전류원·메시) → 슈퍼노드(공유 전압원·노드).
  //   V↔I, R↔G, 메시↔노드, 공유 I_s↔공유 V_s. 결정론 텍스트(GPT 없음).
  if (mode === "exam_variant") {
    return generateInParallel(count, async (i, seed) => {
      const gen = generateDcSupermeshDual({ seed });
      const v = gen.values;
      log.info("dc_supermesh_dual_generated", { target: gen.targetBranch, V: gen.targetVoltage, values: v });
      const tgtDesc = gen.targetBranch === "R1" ? "R₁(D₁–접지)" : "R₃(D₂–접지)";
      const text = {
        content: [
          `그림은 두 직류 전류원(I₁=${v.I1}A, I₂=${v.I2}A)과 두 저항(R₁=${v.R1d}Ω, R₃=${v.R3d}Ω), 그리고 두 노드 D₁·D₂ 사이의 전압원(V_s=${v.Vs}V)으로 구성된 회로이다.`,
          `이는 슈퍼메시 회로(공유 전류원·메시 해석)의 **쌍대 회로**(공유 전압원·노드 해석)이다. **슈퍼노드 해석**으로 각 단계 결과를 구하시오.`,
          `(단, V_s가 두 비접지 노드 D₁·D₂ 사이에 있어 슈퍼노드로 묶어 해석한다.)`,
        ].join(" "),
        conditions: [
          `노드 D₁: 전류원 I₁ + R₁(D₁–GND); 노드 D₂: 전류원 I₂ + R₃(D₂–GND)`,
          `D₁–D₂ 사이 전압원 V_s=${v.Vs}V → 슈퍼노드 (V_D₁ − V_D₂ = ${v.Vs})`,
          `쌍대 관계: 공유 전류원↔공유 전압원, 메시전류↔노드전압, R↔G, 직렬↔병렬`,
        ],
        question: [
          `[단계 1] 슈퍼노드(D₁+D₂) KCL + 제약 V_D₁−V_D₂=${v.Vs}V로 노드 전압을 구한다.`,
          `[단계 2] ${tgtDesc} 양단 전압을 구한다.`,
        ].join("\n"),
        answer: [
          `[단계 1] V_D₁ = ${gen.nodeVoltages.D1} V,  V_D₂ = ${gen.nodeVoltages.D2} V`,
          `[단계 2] ${gen.targetBranch} 양단 전압 = ${gen.targetVoltage} V`,
        ].join("\n"),
        solution: [
          `[단계 1] 슈퍼노드 KCL: I₁ + I₂ = V_D₁/R₁ + V_D₂/R₃. 제약: V_D₁ − V_D₂ = ${v.Vs}.`,
          `  연립 → V_D₁ = ${gen.nodeVoltages.D1}V, V_D₂ = ${gen.nodeVoltages.D2}V.`,
          `[단계 2] ${gen.targetBranch === "R1" ? "V_R₁ = V_D₁" : "V_R₃ = V_D₂"} = ${gen.targetVoltage}V.`,
          `  (★ 슈퍼메시(공유 전류원·메시)의 구조적 쌍대 = 슈퍼노드(공유 전압원·노드). 메시전류↔노드전압.)`,
        ].join("\n"),
      };
      return assembleProblem({
        text, netlist: gen.netlist,
        figureLabel: "주어진 회로 (슈퍼노드, 쌍대)", figureRole: "original_circuit",
        figureIdSuffix: i + 1, topicKey,
      });
    });
  }

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDcSupermesh({ params: analysis?.circuitType?.params, seed });
    log.info("dc_supermesh_generated", {
      target: gen.targetBranch,
      I: gen.targetCurrent,
      iMesh1: gen.iMesh1,
      iMesh2: gen.iMesh2,
      values: gen.values,
    });
    const text = await writeDcSupermeshText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로 (supermesh)", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
