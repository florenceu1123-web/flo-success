import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateFunctionGenerator } from "@/lib/generation/topologies/functionGenerator";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runFunctionGeneratorPipeline");

/**
 * 비정현파 발진기(함수발생기) — 결정론 파이프라인 (임용 29번). GPT 없음.
 *  (가) 슈미트 비교기(구형파) + (나) 적분기(삼각파). 3단계 수치 유도:
 *   [1] 구형파 진폭 ±V_sat, [2] 삼각파 진폭 (R₃/R₂)V_sat, [3] 발진 주파수 f=R₂/(4R₁R₃C).
 */
export async function runFunctionGeneratorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateFunctionGenerator({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("function_generator_generated", { ...v, ...a });

    const content = [
      "그림은 두 개의 이상적 연산 증폭기로 구성된 비정현파 발진기(함수 발생기) 회로이다.",
      "(가)단은 슈미트 트리거 비교기로 구형파를, (나)단은 적분기로 삼각파를 출력하며, 두 단은 피드백 루프로 연결되어 발진한다.",
      `연산 증폭기의 포화 전압은 ±${v.Vsat}[V]이고, R₁=${v.R1_k}kΩ, R₂=${v.R2_k}kΩ, R₃=${v.R3_k}kΩ, C=${v.C_uF}µF이다.`,
      "(가) 출력의 구형파 진폭, (나) 출력의 삼각파 진폭, 그리고 발진 주파수를 구하시오.",
    ].join(" ");

    const conditions = [
      `(가) 비교기: (−)입력 접지, (+)입력은 R₂(↔(가) 출력)·R₃(↔(나) 출력) 분압 → 출력 ±V_sat 구형파.`,
      `(나) 적분기: (가) 출력 → R₁ → (−)입력, C 피드백, (+)입력 접지 → 삼각파.`,
      `포화 전압 ±${v.Vsat}V, R₁=${v.R1_k}kΩ, R₂=${v.R2_k}kΩ, R₃=${v.R3_k}kΩ, C=${v.C_uF}µF.`,
    ];

    const question = [
      `[단계 1] (가) 출력(구형파)의 진폭을 구하시오.`,
      `[단계 2] (나) 출력(삼각파)의 진폭을 구하시오.`,
      `[단계 3] 이 발진기의 발진 주파수 f를 구하시오.`,
    ].join("\n");

    const answer = [
      `[단계 1] 구형파 진폭 = ±${a.squarePeak} V`,
      `[단계 2] 삼각파 진폭 = ±${a.triPeak} V`,
      `[단계 3] f = ${a.freqHz} Hz`,
    ].join("\n");

    const solution = [
      `[단계 1] (가)는 비교기이므로 출력은 포화 전압으로 스위칭한다 → 구형파 진폭 = ±V_sat = ±${a.squarePeak}V.`,
      `[단계 2] (가) 출력이 반전되는 문턱은 비교기 (+)입력이 0이 될 때다. R₂·R₃ 분압에서 (가)/R₂ + (나)/R₃ = 0 → (나) = −(R₃/R₂)(가). 따라서 삼각파 진폭 = (R₃/R₂)·V_sat = (${v.R3_k}/${v.R2_k})·${v.Vsat} = ±${a.triPeak}V.`,
      `[단계 3] 적분기 기울기 = V_sat/(R₁C). 반주기 동안 삼각파는 2·(삼각파 진폭)만큼 이동하므로 T/2 = 2·V_tri/(V_sat/(R₁C)) = 2(R₃/R₂)R₁C. ∴ f = 1/T = R₂/(4R₁R₃C) = ${v.R2_k}kΩ/(4·${v.R1_k}kΩ·${v.R3_k}kΩ·${v.C_uF}µF) = ${a.freqHz}Hz.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_funcgen_${i + 1}`,
        label: "(가)(나) 비정현파 발진기 (비교기 + 적분기)",
        role: "original_circuit",
        diagramType: "function_generator_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
