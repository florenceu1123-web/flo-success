import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampTwoStage } from "@/lib/generation/topologies/opampTwoStage";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampTwoStagePipeline");

/**
 * 2단 OPAMP (1단 비반전 → 2단 반전) — 결정론 파이프라인 (임용 2번 형식). GPT 없음.
 *  V_P 주어질 때 [1] V_i=V_P/A₁, [2] V_o=−A₂·V_P 도출.
 */
export async function runOpampTwoStagePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampTwoStage({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("opamp_two_stage_generated", { A1: v.A1, G2: v.G2, VP: v.VP, Vi: a.Vi, Vo: a.Vo });

    const content = [
      "그림 (가)는 연산 증폭기를 응용한 회로이다.",
      `전압 V_P = ${v.VP}[V]일 때, 입력 전압 V_i[V]와 출력 전압 V_o[V]를 구하여 순서대로 쓰시오.`,
      "(단, 연산 증폭기는 이상적으로 동작한다.)",
    ].join(" ");

    const conditions = [
      `1단: 비반전 증폭 (V_i가 (+)입력, ${v.Rg1_k}kΩ→GND, ${v.Rf1_k === 0 ? "0Ω(단락)" : v.Rf1_k + "kΩ"} 피드백) → V_P = (1+Rf1/Rg1)·V_i = ${v.A1}·V_i.`,
      `2단: T자 피드백 반전 증폭. V_P → ${v.Ra_k}kΩ → 마디 N → ${v.Rb_k}kΩ → op2(−), (+)→GND.`,
      `  피드백: op2(−) → ${v.Rf2_k}kΩ → V_o, 그리고 마디 N → ${v.Rf3_k}kΩ → V_o (T자).`,
      `주어진 조건: V_P = ${v.VP}V.`,
    ];

    const question = [
      `[단계 1] 1단(비반전)의 이득으로부터 입력 전압 V_i를 구한다.`,
      `[단계 2] 2단(T자 피드백 반전)의 이득으로부터 출력 전압 V_o를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] V_i = V_P / A₁ = ${v.VP}/${v.A1} = ${a.Vi} V`,
      `[단계 2] V_o = G₂·V_P = ${v.G2}·${v.VP} = ${a.Vo} V`,
    ].join("\n");

    const solution = [
      `[단계 1] 1단은 비반전 증폭기: A₁ = 1 + Rf1/Rg1 = ${v.A1}. V_P = A₁·V_i이므로 V_i = V_P/A₁ = ${a.Vi}V.`,
      `[단계 2] 2단은 T자 피드백 반전 증폭기. op2(−)는 가상접지(0V). 마디 N·op2(−) KCL 연립:`,
      `  · op2(−): N/Rb = −V_o/Rf2 → N = −(Rb/Rf2)·V_o`,
      `  · N: (V_P−N)/Ra = N/Rb + (N−V_o)/Rf3`,
      `  정리하면 이득 G₂ = V_o/V_P = −1 / [Ra·((Rb/Rf2)(1/Ra+1/Rb+1/Rf3) + 1/Rf3)] = ${v.G2}.`,
      `  ⟹ V_o = G₂·V_P = ${a.Vo}V.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_op2stage_${i + 1}`,
        label: "(가) 2단 OPAMP 응용 회로 (비반전 → 반전)",
        role: "original_circuit",
        diagramType: "opamp_two_stage_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
