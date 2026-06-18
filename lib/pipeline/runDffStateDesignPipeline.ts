import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateDffStateDesign } from "@/lib/generation/topologies/dffStateDesign";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDffStateDesignPipeline");

/**
 * D-FF 2개 상태도 순차회로 설계 (임용 9번 정보과) — 결정론 파이프라인. GPT 없음.
 *  [1] 상태도→상태표 다음상태(㉠~㉣), [2] D_A·D_B 입력, [3] 게이트 ㉮·㉯ 도출.
 */
export async function runDffStateDesignPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDffStateDesign({ seed, mode });
    log.info("dff_state_design_generated", {
      cycle: gen.cycleSeq.map((s) => `${(s >> 1) & 1}${s & 1}`).join("→"),
      dA: gen.dAExpr, dB: gen.dBExpr,
    });

    const cycleStr = gen.cycleSeq.map((s) => `${(s >> 1) & 1}${s & 1}`).join(" → ") +
      ` → ${gen.cycleSeq.length ? `${(gen.cycleSeq[0] >> 1) & 1}${gen.cycleSeq[0] & 1}` : ""}`;

    const content = [
      "그림 (가)는 Q_A Q_B 순으로 상태가 표시된 상태도이고, 표 (나)는 D 플립플롭을 이용하여 (가)의 상태도로 동작하는 순서 논리 회로를 설계하는 과정이다.",
      "(나)의 ㉠~㉣과 (다)의 ㉮·㉯를 제시된 <해석 절차>에 따라 단계별로 구하여 서술하시오.",
      "(단, 모든 소자는 이상적으로 동작한다.)",
    ].join(" ");

    const conditions = [
      `상태 순환(입력 없음): ${cycleStr}`,
      `D 플립플롭 2개(Q_A·Q_B). D-FF는 D = 다음 상태(여기표 불필요).`,
      `(나) 상태표의 다음상태 칸 ㉠~㉣, (다)의 게이트 ㉮(D_A)·㉯(D_B)는 빈칸 — 학생 도출.`,
    ];

    const question = [
      `[단계 1] 그림 (가)의 상태도를 이용하여, 표 (나)의 ㉠~㉣에 해당하는 다음 상태(Q_A(t+1) Q_B(t+1)) 값을 순서대로 구한다.`,
      `[단계 2] 표 (나)에서 D 플립플롭 입력 D_A·D_B를 구한다. (D 플립플롭이므로 D = 다음 상태)`,
      `[단계 3] [단계 1]·[단계 2]를 이용하여, 그림 (다)의 ㉮(D_A 구현)·㉯(D_B 구현) 논리 게이트를 각각 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ${gen.nextAnswers.map((a) => `${a.symbol} = ${a.answer}`).join(",  ")}`,
      `[단계 2] D_A = ${gen.dAExpr},  D_B = ${gen.dBExpr}  (각 행은 다음 상태와 동일)`,
      `[단계 3] ㉮: ${gen.dAExpr} → ${gen.dAGate} 게이트,  ㉯: ${gen.dBExpr} → ${gen.dBGate} 게이트`,
    ].join("\n");

    const solution = [
      `[단계 1] 상태도의 각 상태에서 화살표가 가리키는 다음 상태를 읽는다: ${gen.nextAnswers.map((a) => a.answer).join(", ")} (㉠~㉣).`,
      `[단계 2] D 플립플롭은 Q(t+1) = D이므로 D_A = Q_A(t+1), D_B = Q_B(t+1). 각 현재상태(Q_A,Q_B)에 대한 D_A·D_B 표 완성.`,
      `[단계 3] D_A·D_B를 (Q_A, Q_B) 2변수 카르노맵으로 최소화:`,
      `  · D_A = ${gen.dAExpr}  →  ㉮ = ${gen.dAGate} 게이트.`,
      `  · D_B = ${gen.dBExpr}  →  ㉯ = ${gen.dBGate} 게이트.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      { id: `fig_dffsd_diagram_${i + 1}`, label: "(가) 상태도 (입력 없는 순환)", role: "state_diagram", diagramType: "concept_diagram", diagram: gen.stateDiagram },
      { id: `fig_dffsd_table_${i + 1}`, label: "(나) 상태표 (다음상태·D입력, ㉠~㉣ 빈칸)", role: "truth_table", diagramType: "truth_table", diagram: gen.stateTable },
      { id: `fig_dffsd_circuit_${i + 1}`, label: "(다) D-FF 2개 + 게이트(㉮·㉯) 구현 회로", role: "implementation_circuit", diagramType: "dff_state_design_circuit", diagram: gen.circuitDiagram },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
