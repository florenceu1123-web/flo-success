import { createLogger } from "@/lib/logger";
import { generateDcMesh, generateDcMeshDual } from "@/lib/generation/topologies/dcMesh";
import { writeDcMeshText } from "@/lib/generation/topologies/dcMeshTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDcMeshPipeline");

export async function runDcMeshPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  // ★ 기출변형유형 = 쌍대(dual): 메시 해석(전압원·메시전류) → 노드 해석(전류원·노드전압).
  //   V↔I, R↔G, 메시↔노드, 직렬↔병렬. 결정론 텍스트(GPT 없음).
  if (mode === "exam_variant") {
    return generateInParallel(count, async (i, seed) => {
      const gen = generateDcMeshDual({ seed });
      const v = gen.values;
      log.info("dc_mesh_dual_generated", { target: gen.targetBranch, V: gen.targetVoltage, values: v });
      const tgt = gen.targetBranch; // "R1"|"R2"|"R3"
      const tgtDesc = tgt === "R2" ? "R₂(브리지, 두 노드 사이)" : tgt === "R1" ? "R₁(D₁–접지)" : "R₃(D₂–접지)";
      const g = (R: number) => Math.round((1 / R) * 1000 * 1000) / 1000; // mS
      const text = {
        content: [
          `그림은 두 직류 전류원(I₁=${v.I1}A, I₂=${v.I2}A)과 세 저항(R₁=${v.R1d}Ω, R₂=${v.R2d}Ω, R₃=${v.R3d}Ω)으로 구성된 회로이다.`,
          `이는 메시 해석 회로(전압원·메시전류)의 **쌍대 회로**(전류원·노드전압)이다. **노드 해석**으로 각 단계 결과를 구하시오.`,
          `(단, R₂는 두 노드 D₁·D₂를 잇는 브리지 저항이고, 접지는 하단 공통 노드이다.)`,
        ].join(" "),
        conditions: [
          `노드 D₁: 전류원 I₁ 주입 + R₁(D₁–GND) + R₂(D₁–D₂)`,
          `노드 D₂: 전류원 I₂ 주입 + R₃(D₂–GND) + R₂(D₁–D₂)`,
          `쌍대 관계: 전압원↔전류원, R↔G(컨덕턴스), 메시전류↔노드전압, 직렬↔병렬`,
        ],
        question: [
          `[단계 1] 노드 방정식(KCL)을 세워 노드 전압 V_D₁, V_D₂를 구한다.`,
          `[단계 2] ${tgtDesc} 양단 전압을 구한다.`,
        ].join("\n"),
        answer: [
          `[단계 1] V_D₁ = ${gen.nodeVoltages.D1} V,  V_D₂ = ${gen.nodeVoltages.D2} V`,
          `[단계 2] ${tgt} 양단 전압 = ${gen.targetVoltage} V`,
        ].join("\n"),
        solution: [
          `[단계 1] 컨덕턴스 G₁=1/R₁=${g(v.R1d)}mS, G₂=1/R₂=${g(v.R2d)}mS, G₃=1/R₃=${g(v.R3d)}mS.`,
          `  KCL@D₁: I₁ = G₁·V_D₁ + G₂·(V_D₁−V_D₂)`,
          `  KCL@D₂: I₂ = G₃·V_D₂ + G₂·(V_D₂−V_D₁)`,
          `  연립 → V_D₁ = ${gen.nodeVoltages.D1}V, V_D₂ = ${gen.nodeVoltages.D2}V.`,
          `[단계 2] ${tgt === "R1" ? "V_R₁ = V_D₁" : tgt === "R3" ? "V_R₃ = V_D₂" : "V_R₂ = V_D₁ − V_D₂"} = ${gen.targetVoltage}V.`,
          `  (★ 원본 메시회로에서 ${tgt}에 흐르는 전류 × R₀의 쌍대 — 메시전류↔노드전압.)`,
        ].join("\n"),
      };
      return assembleProblem({
        text, netlist: gen.netlist,
        figureLabel: "주어진 회로 (노드 해석, 쌍대)", figureRole: "original_circuit",
        figureIdSuffix: i + 1, topicKey,
      });
    });
  }

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDcMesh({ params: analysis?.circuitType?.params, seed });
    log.info("dc_mesh_generated", { target: gen.targetBranch, I: gen.targetCurrent, values: gen.values });
    const text = await writeDcMeshText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
