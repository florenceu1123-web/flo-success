import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampDifferenceAmp } from "@/lib/generation/topologies/opampDifferenceAmp";
import { writeOpampDifferenceAmpText } from "@/lib/generation/topologies/opampDifferenceAmpTextWriter";
import { generateInParallel } from "./_common";
import type { AnalysisResult, FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runOpampDifferenceAmpPipeline");

/**
 * OPAMP 차동증폭기 (임용 9번) — 전용 결정론 파이프라인.
 *   generic GPT 추출이 2입력 차동구조(노턴 입력 + V+ 분배)를 단순 반전증폭으로 축소하는 문제 회피.
 */
export async function runOpampDifferenceAmpPipeline(args: {
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampDifferenceAmp({ seed, mode });
    log.info("opamp_difference_amp_problem", {
      V_o: gen.values.V_o, R_4: gen.values.R_4, A_d: gen.values.A_d, A_c: gen.values.A_c,
    });
    const text = writeOpampDifferenceAmpText({ generation: gen });
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_diffamp_${i + 1}`,
        label: "(가) OPAMP 차동증폭 회로",
        role: "original_circuit",
        diagramType: "analog_netlist",
        diagram: gen.netlist,
      },
    ];
    return {
      id: randomUUID(),
      content: text.content,
      conditions: text.conditions,
      question: text.question,
      answer: text.answer,
      solution: text.solution,
      topicKey,
      figureVariants,
    };
  });
}

/**
 * OPAMP 차동증폭기 detector.
 *   조건: OPAMP 존재 + (차동모드 AND 공통모드) 또는 (차동/differential + 이득/gain) 키워드.
 *   ★ opamp archetype dispatch보다 먼저 라우팅 — generic 추출이 차동구조를 잃는다.
 */
export function detectOpampDifferenceAmp(analysis: AnalysisResult | null | undefined): boolean {
  if (!analysis) return false;
  const inv = analysis.componentInventory ?? [];
  const hasOpamp = inv.some((c) => String(c.type ?? "").toUpperCase() === "OPAMP");
  if (!hasOpamp) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    ...(analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`),
  ].join(" ").toLowerCase();
  const hasDiff = /차동\s*모드|differential\s*mode/.test(text);
  const hasComm = /공통\s*모드|common[\s-]*mode/.test(text);
  const hasGain = /이득|gain/.test(text);
  return (hasDiff && hasComm) || (hasDiff && hasGain);
}
