import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampAnalogSummer } from "@/lib/generation/topologies/opampAnalogSummer";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampAnalogSummerPipeline");

/**
 * 아날로그 시스템 설계 — 2-OPAMP 가산기 (v₀=v₁+v₂) 결정론 파이프라인. GPT 없음.
 *  (라) 입력·출력 파형(v₁·v₂·v₀ given) → 설계. 정답 회로는 solutionFigure.
 *  ★ generic opamp 경로(임의 수치 netlist)와 완전히 다른 유형.
 */
export async function runOpampAnalogSummerPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { count, topicKey, mode } = args;
  const genMode: "exam_similar" | "exam_variant" = mode === "exam_variant" ? "exam_variant" : "exam_similar";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampAnalogSummer({ seed, mode: genMode, index: i });
    const v = gen.values;
    const shapeKo = v.v1shape === "sawtooth" ? "톱니파" : "삼각파";
    log.info("opamp_analog_summer_generated", { mode: genMode, V: v.V, T: v.T, R: v.R, v1shape: v.v1shape });

    const content = [
      `다음 조건을 모두 만족하는 아날로그 시스템을 설계하려 한다.`,
      `(1) 그림 (라)와 같이 v₁(${shapeKo}, 0~${v.V}V)과 v₂(구형파, 0/−${v.V}V)를 입력으로 하여 v₀를 출력한다.`,
      `(2) 설계에 필요한 소자 중 연산 증폭기는 2개만 사용한다.`,
      `(3) 사용되는 모든 저항값은 동일하다. (4) 모든 소자는 이상적인 특성을 가진다.`,
      `<해석 절차>에 따라 v₀와 v₁·v₂의 관계를 구하고 회로를 설계하시오.`,
    ].join(" ");

    const conditions = [
      `입력 v₁: ${shapeKo}, 0~${v.V}V, 주기 ${v.T}ms`,
      `입력 v₂: 구형파, 0 / −${v.V}V, 주기 ${v.T}ms`,
      `출력 v₀: 그림 (라)에 제시 (−${v.V}~+${v.V}V), 저항 R 모두 동일`,
    ];

    const question = [
      `[단계 1] 파형 (라)에서 출력 v₀와 입력 v₁·v₂의 관계식을 구한다.`,
      `[단계 2] 반전 가산기로 중간 출력 v_m을 v₁·v₂로 표현한다.`,
      `[단계 3] 두 번째 연산증폭기(반전 증폭기)를 포함한 전체 회로를 설계하고 v₀를 확인한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] v₀ = v₁ + v₂`,
      `[단계 2] v_m = −(v₁ + v₂)  (반전 가산기, 모든 R 동일)`,
      `[단계 3] v₀ = −v_m = v₁ + v₂  (반전 증폭기, 이득 −1). 회로: 반전 가산기 U₁ → 반전 증폭기 U₂.`,
    ].join("\n");

    const solution = [
      `[단계 1] 파형에서 각 시점의 v₀ 값이 v₁과 v₂의 합과 일치한다(예: v₂=−${v.V}인 구간은 v₀=v₁−${v.V}, v₂=0인 구간은 v₀=v₁).`,
      `  ⇒ v₀ = v₁ + v₂.`,
      `[단계 2] 모든 저항이 R로 같은 반전 가산기: v_m = −(R/R·v₁ + R/R·v₂) = −(v₁ + v₂).`,
      `[단계 3] 반전 증폭기(입력·피드백 저항 모두 R, 이득 −R/R=−1)를 이어 붙이면`,
      `  v₀ = −v_m = v₁ + v₂. 연산증폭기 2개·저항 모두 동일·이상적 소자 조건을 만족한다.`,
    ].join("\n");

    // (다) 시스템 블록도(원본 (다)) + (라) 입력·출력 파형 = 문제 본문 figure. 정답 회로는 solutionFigure.
    const blockDiagram = {
      nodes: [
        { id: "v1", label: "v₁", x: 70, y: 55 },
        { id: "v2", label: "v₂", x: 70, y: 150 },
        { id: "sys", label: "시스템", x: 245, y: 102 },
        { id: "vo", label: "v₀", x: 415, y: 102 },
      ],
      edges: [
        { from: "v1", to: "sys" },
        { from: "v2", to: "sys" },
        { from: "sys", to: "vo" },
      ],
    };
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_summer_block_${i + 1}`,
        label: "(다) 시스템 블록도",
        role: "main_circuit",
        diagramType: "concept_diagram",
        diagram: blockDiagram,
      },
      {
        id: `fig_summer_wave_${i + 1}`,
        label: "(라) 입력 v₁·v₂ 및 출력 v₀ 파형",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveform,
      },
    ];
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_summer_ckt_${i + 1}`,
        label: "설계 회로 (반전 가산기 → 반전 증폭기, 모든 R 동일)",
        role: "implementation_circuit",
        diagramType: "opamp_summer_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return {
      id: randomUUID(),
      content, conditions, question, answer, solution,
      topicKey, figureVariants, solutionFigures,
    };
  });
}

/**
 * 재검출 안전망 — stale analysis로 circuitType이 generic opamp로 와도, 텍스트가
 * "아날로그 시스템 설계 + OPAMP 2개 + 삼각파/구형파 입력 파형"이면 여기서 판별.
 */
export function detectOpampAnalogSummer(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""} ${(analysis.relatedConcepts ?? []).join(" ")}`.toLowerCase();
  // 분류기 0-PRE와 동일 시그니처 (subject 무관·복합형·stale 방어).
  const waveKw = /삼각파|구형파|톱니파|사각파/.test(text);
  const analogOpampKw = /연산\s*증폭기|op[\s.\-]?amp|아날로그/.test(text) ||
    (analysis.componentInventory ?? []).some((c) => String(c.type ?? "").toUpperCase() === "OPAMP") || analysis.topicKey === "opamp";
  const designKw = /설계|저항.*동일|동일한 저항|저항값은 동일|모든 저항|op[\s.\-]?amp\s*2|연산\s*증폭기\s*2|두 개의 연산|2개의 연산|증폭기.*2개|2개.*증폭기|출력하도록/.test(text);
  const guardOut = /저역|고역|대역폭|차단\s*주파수|차단주파수|필터|적분기|미분기|integrator|differentiator|발진/.test(text);
  return waveKw && analogOpampKw && designKw && !guardOut;
}
