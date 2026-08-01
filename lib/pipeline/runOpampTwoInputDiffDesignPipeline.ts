/**
 * 2입력 2-OPAMP 캐스케이드 (가) + 차동증폭기 설계 (나) — 임용 5번. 결정론 파이프라인. GPT 없음.
 *  (가)·(나) 2-figure + 3단계 풀이 (V_o 관계식 / R₁·R₂ 설계 / V₁·V₂ 대입).
 */
import { createLogger } from "@/lib/logger";
import { generateOpampTwoInputDiffDesign } from "@/lib/generation/topologies/opampTwoInputDiffDesign";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampTwoInputDiffDesignPipeline");

/** stale analysis 재검출 안전망 — 2-OPAMP 캐스케이드 + 두 입력(v₁·v₂) + V_o 관계식 (임용 5번). */
export function detectOpampTwoInputDesign(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const txt = [
    analysis.topic ?? "", analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  const inv = analysis.componentInventory ?? [];
  const opN = inv.filter((c) => String(c.type ?? "").toUpperCase() === "OPAMP").length;
  const opampCtx = opN >= 1 || analysis.topicKey === "opamp" || /연산\s*증폭|op[\s.\-]?amp/.test(txt);
  const hasV1V2 = /v_?1|v₁/.test(txt) && /v_?2|v₂/.test(txt);
  const cascade = opN >= 2 || /직렬.{0,4}연결|직렬로|캐스케이드|cascade|2단|두 개의 연산|2개의 연산/.test(txt);
  const relation = /관계식|관계\s*식|출력\s*전압을?\s*(구|만들|도출)|동일한?[\s\S]{0,14}(출력|v_?o)/.test(txt);
  const transferFn = /v_?o\s*\/\s*v_?i|v_?s\s*\/\s*v_?i|전달함수|이득을 구/.test(txt);
  return opampCtx && hasV1V2 && cascade && relation && !transferFn;
}

export async function runOpampTwoInputDiffDesignPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { count, topicKey } = args;
  const mode: "exam_similar" | "exam_variant" =
    args.mode === "exam_variant" ? "exam_variant" : "exam_similar";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampTwoInputDiffDesign({ mode, seed, index: i });
    const p = gen.params;
    const s = gen.solved;
    log.info("opamp_two_input_generated", { params: p, R1na: s.R1na, R2na: s.R2na, Vo3: s.Vo3 });

    const figGa: FigureVariant = {
      id: `fig_opamp2_ga_${i + 1}`,
      label: "그림 (가) — 2-OPAMP 캐스케이드",
      role: "original_circuit",
      diagramType: "opamp_two_input_cascade",
      diagram: { Ri1: p.Ri1, R0: p.R0, Rf2: s.Rf2 },
    };
    const figNa: FigureVariant = {
      id: `fig_opamp2_na_${i + 1}`,
      label: "그림 (나) — 차동증폭기 (R₁·R₂ 설계)",
      role: "main_circuit",
      diagramType: "opamp_two_input_diff",
      diagram: { Rv1: p.Rv1 },
    };

    const content = [
      `그림 (가)와 그림 (나)는 연산증폭기를 응용한 회로이다. (가)는 2단(반전 → 반전가산) 캐스케이드로 입력 V₁·V₂로 출력 V_o를 만들고, (나)는 단일 연산증폭기 차동회로이다.`,
      `제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 연산증폭기는 이상적으로 동작한다.)`,
    ].join(" ");

    const conditions = [
      `(가) OP1(반전): V₂─R(${p.Ri1}kΩ)─(−), 피드백 R(${p.Ri1}kΩ), (+)=GND → out₁=−V₂.`,
      `(가) OP2(반전가산): out₁─R(${p.R0}kΩ)·V₁─R(${p.R0}kΩ)를 (−)에 가산, 피드백 R_f(${s.Rf2}kΩ), (+)=GND.`,
      `(나): V₁─R_v1(${p.Rv1}kΩ)─(−), V₂─R₁(설계)─(+), (+)─R₂(설계)─GND, 피드백 R₂.`,
    ];

    const question = [
      `[단계 1] 그림 (가)에서 입력 V₁·V₂와 출력 V_o 사이의 관계식을 구한다.`,
      `[단계 2] 그림 (나)의 증폭기가 (가)와 동일한 V₁·V₂에 대해 동일한 V_o를 출력하도록 R₁[kΩ]과 R₂[kΩ]를 각각 구한다.`,
      `[단계 3] 그림 (나)에 V₁=${p.v1}[V], V₂=${p.v2}[V]를 인가할 때 출력 V_o[V]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] V_o = ${p.k}(V₂ − V₁) = ${p.k}V₂ − ${p.k}V₁`,
      `[단계 2] R₁ = ${s.R1na} kΩ,  R₂ = ${s.R2na} kΩ`,
      `[단계 3] V_o = ${p.k}(${p.v2} − ${p.v1}) = ${s.Vo3} V`,
    ].join("\n");

    const solution = [
      `[단계 1] (가) OP1은 반전증폭(입력·피드백 저항 같음) → out₁ = −V₂. OP2는 반전가산: V_o = −(R_f/R)·out₁ − (R_f/R)·V₁ = −(${s.Rf2}/${p.R0})·(−V₂) − (${s.Rf2}/${p.R0})·V₁ = ${p.k}V₂ − ${p.k}V₁ = ${p.k}(V₂ − V₁).`,
      `[단계 2] (나)는 차동증폭기: V_o = −(R₂/R_v1)V₁ + (1+R₂/R_v1)·R₂/(R₁+R₂)·V₂. (가)의 V_o=${p.k}(V₂−V₁)와 일치시키면 반전항 R₂/R_v1=${p.k} → R₂=${p.k}·${p.Rv1}=${s.R2na}kΩ. 비반전항 (1+${p.k})·R₂/(R₁+R₂)=${p.k} → R₁=R_v1=${s.R1na}kΩ.`,
      `[단계 3] V_o = ${p.k}(V₂−V₁) = ${p.k}(${p.v2}−${p.v1}) = ${s.Vo3}V.`,
    ].join("\n");

    return {
      id: `opamp2_${i + 1}`,
      topicKey: topicKey ?? "opamp",
      content, conditions, question, answer, solution,
      figureVariants: [figGa, figNa],
    } as GeneratedProblem;
  });
}
