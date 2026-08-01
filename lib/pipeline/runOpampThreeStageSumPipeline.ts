import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampThreeStageSum } from "@/lib/generation/topologies/opampThreeStageSum";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampThreeStageSumPipeline");

/**
 * 3-OPAMP 응용회로 (임용 2번 전자) — 결정론 파이프라인. GPT 없음.
 *  [1] V_x = −(Rf1/Rin1)·V1, [2] V_o=목표 되는 R_f = −V_o/(V_x/Ra + V_buf/Rb).
 */
export async function runOpampThreeStageSumPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampThreeStageSum({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("opamp_three_stage_sum_generated", {
      mode, V1: v.V1, Rin1: v.Rin1, Rf1: v.Rf1, V2: v.V2, Ra: v.Ra, Rb: v.Rb, Vo: v.Vo,
      Vx: a.Vx, Rf: a.Rf,
    });

    const content = [
      "그림은 연산 증폭기를 응용한 회로이다.",
      `전압 V_x[V]를 구하고, 출력 전압 V_o = ${v.Vo}[V]가 되기 위한 저항 R_f[kΩ]를 구하여 순서대로 쓰시오.`,
      "(단, 연산 증폭기는 이상적으로 동작한다.)",
    ].join(" ");

    let conditions: string[], question: string, answer: string, solution: string, figLabel: string;

    if (a.nonInv) {
      // ★ 변형: U3 = 비반전 가산기. V_+ = (V_x·Rb+V_buf·Ra)/(Ra+Rb), V_o = (1+R_f/R_g)·V_+.
      const Vp = a.Vplus as number, Rg = v.Rg as number;
      conditions = [
        `1단(반전증폭): ${v.V1}[V] 입력 → ${v.Rin1}[kΩ] 직렬, ${v.Rf1}[kΩ] 피드백, (+)접지 → V_x.`,
        `2단(버퍼): ${v.V2}[V] → (+)입력, 단위 이득 → V_buf = ${v.V2}[V].`,
        `3단(★비반전★ 가산): V_x → ${v.Ra}[kΩ], V_buf → ${v.Rb}[kΩ]가 ★(+)단자★에 연결, (−)단자에 R_g=${Rg}[kΩ](접지)·R_f(피드백) → V_o.`,
      ];
      question = [
        `[단계 1] 1단 반전 증폭기의 출력 전압 V_x[V]를 구한다.`,
        `[단계 2] 출력 전압 V_o = ${v.Vo}[V]가 되기 위한 저항 R_f[kΩ]를 구한다.`,
      ].join("\n");
      answer = [
        `[단계 1] V_x = −(R_f1/R_in1)·V1 = −(${v.Rf1}/${v.Rin1})·${v.V1} = ${a.Vx}[V]`,
        `[단계 2] R_f = R_g·(V_o/V_+ − 1) = ${Rg}·(${v.Vo}/${Vp} − 1) = ${a.Rf}[kΩ]  (V_+=${Vp}[V])`,
      ].join("\n");
      solution = [
        `[단계 1] 1단은 반전 증폭기((+)접지). V_x = −(R_f1/R_in1)·V1 = −(${v.Rf1}/${v.Rin1})·${v.V1} = ${a.Vx}[V]. 2단 버퍼: V_buf=${v.V2}[V].`,
        `[단계 2] 3단은 비반전 가산기. (+)단자 전압 V_+ = (V_x·Rb+V_buf·Ra)/(Ra+Rb) = (${a.Vx}·${v.Rb}+${v.V2}·${v.Ra})/(${v.Ra}+${v.Rb}) = ${Vp}[V].`,
        `  비반전 이득: V_o = (1+R_f/R_g)·V_+ → ${v.Vo} = (1+R_f/${Rg})·${Vp} → R_f = R_g·(V_o/V_+ − 1) = ${Rg}·(${v.Vo}/${Vp}−1) = ${a.Rf}[kΩ].`,
      ].join("\n");
      figLabel = "연산 증폭기 응용 회로 (반전증폭 + 버퍼 + ★비반전★가산)";
    } else {
      conditions = [
        `1단(반전증폭): ${v.V1}[V] 입력 → ${v.Rin1}[kΩ] 직렬, ${v.Rf1}[kΩ] 피드백, (+)접지 → V_x.`,
        `2단(버퍼): ${v.V2}[V] → (+)입력, 단위 이득 → V_buf = ${v.V2}[V].`,
        `3단(반전가산): V_x → ${v.Ra}[kΩ], V_buf → ${v.Rb}[kΩ]가 (−)에 가산, R_f 피드백, (+)접지 → V_o.`,
      ];
      question = [
        `[단계 1] 1단 반전 증폭기의 출력 전압 V_x[V]를 구한다.`,
        `[단계 2] 출력 전압 V_o = ${v.Vo}[V]가 되기 위한 저항 R_f[kΩ]를 구한다.`,
      ].join("\n");
      answer = [
        `[단계 1] V_x = −(R_f1/R_in1)·V1 = −(${v.Rf1}/${v.Rin1})·${v.V1} = ${a.Vx}[V]`,
        `[단계 2] R_f = ${a.Rf}[kΩ]  (V_o = −R_f·(V_x/${v.Ra} + V_buf/${v.Rb}) = ${v.Vo}[V])`,
      ].join("\n");
      solution = [
        `[단계 1] 1단은 반전 증폭기((+)접지). 가상 단락으로 V_x = −(R_f1/R_in1)·V1 = −(${v.Rf1}/${v.Rin1})·${v.V1} = ${a.Vx}[V].`,
        `[단계 2] 2단 버퍼: V_buf = ${v.V2}[V]. 3단은 반전 가산기: V_o = −R_f·(V_x/${v.Ra} + V_buf/${v.Rb}).`,
        `  ${v.Vo} = −R_f·(${a.Vx}/${v.Ra} + ${v.V2}/${v.Rb}) = −R_f·(${a.Vx / v.Ra + v.V2 / v.Rb}).  ∴ R_f = ${a.Rf}[kΩ].`,
      ].join("\n");
      figLabel = "연산 증폭기 응용 회로 (반전증폭 + 버퍼 + 반전가산)";
    }

    const figureVariants: FigureVariant[] = [
      { id: `fig_op3sum_${i + 1}`, label: figLabel, role: "original_circuit", diagramType: "opamp_three_stage_sum_circuit", diagram: gen.circuitDiagram },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
