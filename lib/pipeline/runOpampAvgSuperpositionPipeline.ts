import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateOpampAvgSuperposition,
  matchesOasAsk,
  matchesOasSignature,
  qNum,
  qTex,
  yieldsOasToSibling,
} from "@/lib/generation/topologies/opampAvgSuperpositionR";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampAvgSuperpositionPipeline");

/**
 * (+)단자 3입력 평균 + 2단 중첩 → 미지 저항 도출 (임용 8번 전자회로) — 결정론 파이프라인. GPT 없음.
 *
 *  [단계 1] 연산증폭기의 출력 V₁
 *  [단계 2] a점에서 V₁에 의한 전압과 V₂에 의한 전압을 **각각 미지 저항의 식으로** (중첩의 원리)
 *  [단계 3] [단계 2]를 이용하여 미지 저항[kΩ]
 *
 *  · exam_similar = 원본 — 2단 **입력 직렬 저항 R**이 미지
 *  · exam_variant = **구하는 양 교환** — R은 주어지고 2단 **궤환 저항 R_f**가 미지
 */
export async function runOpampAvgSuperpositionPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  const m = mode === "exam_variant" ? "exam_variant" : "exam_similar";

  return generateInParallel(count, async (idx, seed) => {
    const gen = generateOpampAvgSuperposition({ seed, mode: m, index: idx });
    const v = gen.values, a = gen.answer;
    const unkR = gen.unknown === "R";
    const sym = unkR ? "R" : "R_f";                 // 미지 저항 기호
    const inputsTxt = v.inputs.map((x) => `${x}[V]`).join(", ");
    const gain1 = `(1 + ${v.Rf1}/${v.Rg})`;

    log.info("opamp_avg_superposition_generated", {
      mode: m, inputs: v.inputs, Rin: v.Rin, Rg: v.Rg, Rf1: v.Rf1, Rf2: v.Rf2, V2: v.V2,
      unknown: gen.unknown, V1: qTex(a.V1), Vo: qTex(a.Vo), R: v.R,
    });

    const content =
      `그림은 연산증폭기 응용 회로를 나타낸 것이다. 출력 V_o가 ${qTex(a.Vo)}[V]일 때 ` +
      `제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오. ` +
      `(단, 연산증폭기는 이상적으로 동작한다.)`;

    const conditions = [
      `1단 연산증폭기의 **비반전(+) 단자**에 ${v.inputs.length}개의 입력 ${inputsTxt}가 각각 ${v.Rin}[kΩ]을 거쳐 한 마디에 연결된다`,
      `1단 반전(−) 단자는 ${v.Rg}[kΩ]을 통해 접지되고, 출력 V₁과의 사이에 ${v.Rf1}[kΩ] 궤환 저항이 있다`,
      unkR
        ? `V₁은 저항 R을 거쳐 2단 반전(−) 단자에 연결되고, 2단 궤환 저항은 ${v.Rf2}[kΩ]이다`
        : `V₁은 ${v.R}[kΩ]을 거쳐 2단 반전(−) 단자에 연결되고, 2단 궤환 저항 R_f는 미지이다`,
      `2단 비반전(+) 단자에는 직류 전원 V₂ = ${v.V2}[V]가 연결되어 있다`,
    ];

    const question = [
      `[단계 1] 연산증폭기의 출력 V₁[V]을 구한다.`,
      `[단계 2] a점에서 V₁에 의한 전압[V]과 V₂에 의한 전압[V]을 각각 ${sym}의 식으로 구한다.`,
      `[단계 3] [단계 2]를 이용하여 ${sym}[kΩ]을 구한다.`,
    ].join("\n");

    // [단계 2]의 식 — 미지 저항 기호를 그대로 남긴 형태
    const byV1Expr = unkR ? `−${v.Rf2}×${qTex(a.V1)}/R = −${qTex(a.V1)} × ${v.Rf2}/R` : `−(R_f/${v.R})×${qTex(a.V1)}`;
    const byV1Short = unkR ? `−${v.Rf2 * qNum(a.V1)}/R` : `−${qTex(a.V1)}R_f/${v.R}`;
    const byV2Short = unkR ? `${v.V2}(1 + ${v.Rf2}/R)` : `${v.V2}(1 + R_f/${v.R})`;

    const answer = [
      `[단계 1] V₁ = ${qTex(a.V1)}[V]`,
      `[단계 2] V₁에 의한 전압 = ${byV1Short}[V],  V₂에 의한 전압 = ${byV2Short}[V]`,
      `[단계 3] ${sym} = ${unkR ? qTex(a.R) : qTex(a.Rf2)}[kΩ]`,
    ].join("\n");

    const solution = [
      `[단계 1] 이상적 연산증폭기이므로 (+) 단자로는 전류가 흘러들지 않는다.`,
      `  ${v.inputs.length}개의 입력이 모두 같은 ${v.Rin}[kΩ]을 거쳐 한 마디에 모이므로 그 마디에서 KCL을 세우면`,
      `  ${v.inputs.map((x) => `(${x} − V₊)/${v.Rin}`).join(" + ")} = 0  →  **V₊ = (${v.inputs.join(" + ")})/${v.inputs.length} = ${qTex(a.Vplus)}[V]**`,
      `  (저항이 모두 같으므로 V₊는 세 입력의 **산술 평균**이다.)`,
      `  1단은 (−)가 ${v.Rg}[kΩ]으로 접지되고 ${v.Rf1}[kΩ]으로 궤환되는 **비반전 증폭기**이므로`,
      `  **V₁ = ${gain1}·V₊ = ${gain1} × ${qTex(a.Vplus)} = ${qTex(a.V1)}[V]**.`,
      `[단계 2] 2단은 V₁과 V₂ 두 입력을 가지므로 **중첩의 원리**로 나눈다.`,
      `  · V₂ = 0 (접지)일 때 — ${sym}과 궤환 저항으로 이루어진 **반전 증폭기**:`,
      `    V_o(V₁) = ${byV1Expr} = **${byV1Short}[V]**`,
      `  · V₁ = 0 (접지)일 때 — (+)에 V₂가 인가된 **비반전 증폭기**:`,
      `    V_o(V₂) = ${byV2Short} = **${byV2Short}[V]**`,
      `[단계 3] 두 성분을 더하면 V_o = ${byV1Short} + ${byV2Short} 이고, 이것이 ${qTex(a.Vo)}[V]이다.`,
      unkR
        ? `  정리하면 ${sym} = ${v.Rf2}(${v.V2} − ${qTex(a.V1)})/(${qTex(a.Vo)} − ${v.V2}) = **${qTex(a.R)}[kΩ]**.`
        : `  정리하면 ${sym} = ${v.R}(${qTex(a.Vo)} − ${v.V2})/(${v.V2} − ${qTex(a.V1)}) = **${qTex(a.Rf2)}[kΩ]**.`,
      `  ★ 검산: V_o = V₂ + (${unkR ? `${v.Rf2}/${qTex(a.R)}` : `${qTex(a.Rf2)}/${v.R}`})(V₂ − V₁)` +
        ` = ${v.V2} + ${qTex(a.byV2)} − ${v.V2} ${qNum(a.byV1) < 0 ? "−" : "+"} ${qTex({ n: Math.abs(a.byV1.n), d: a.byV1.d })}` +
        ` = ${qTex(a.Vo)}[V] — 주어진 값과 일치한다.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_oas_${idx + 1}`,
        label: "(가) 연산증폭기 응용 회로",
        role: "original_circuit",
        diagramType: "opamp_avg_superposition_circuit",
        diagram: gen.circuit as unknown as Record<string, unknown>,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * (+)단자 다중 입력 + 2단 + 미지 저항 감지 — 분류기·route 안전망 공용.
 *
 * ★ 실측(2026-08-04, 사용자 신고): 전용 항목이 없어 generic OPAMP 경로로 가서
 *   **(+)단자 3입력이 반전 가산기로 뒤집힌** 회로가 생성됐다("이건 반전증폭기잖아").
 * ★ 형제 `opamp_two_stage_rx`와의 판별선 = **(+) 마디에 접지로 내려가는 미지 저항 R_X가 없다**는 것.
 *   그쪽은 R_X를 구하고, 이쪽은 **2단 경로의 저항**을 구한다.
 */
export function detectOpampAvgSuperposition(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;
  if (yieldsOasToSibling(text)) return false;
  const inv = analysis.componentInventory ?? [];
  const opampCount = inv.filter((c) => String(c?.type ?? "").toUpperCase() === "OPAMP").length;
  const srcCount = inv.filter((c) => String(c?.type ?? "").toUpperCase() === "V").length;
  if (!matchesOasSignature(text, opampCount, srcCount)) return false;
  if (!matchesOasAsk(text)) return false;
  return true;
}
