import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateNumberRepresentationRing, generateBinarySubtraction, SCHEME_LABEL_OF } from "@/lib/generation/topologies/numberRepresentationRing";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runNumberRepresentationPipeline");

/**
 * n비트 2진수 **음수 표현 방식 판별** (임용 4번) 감지 — 라우팅용.
 *
 * ★ 실측 신고(2026-07-30): `universal_digital`(K-map·논리식)로 dispatch돼 전혀 다른 문제가 나왔다
 *   (generic_dispatch_warning 로그로 즉시 확인). 이 유형은 회로가 아니라 **수 표현 체계** 문항이다.
 *
 * 시그니처: (2진수·비트) + (음수 표현 | 보수 | 부호 비트 | 부호-크기) — 회로·게이트 문맥이 아니다.
 */
export function detectNumberRepresentation(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const binaryCtx = /2진수|이진수|binary|비트|bit/.test(text);
  const negativeRep =
    /음수\s*표현|음수를?\s*표현|보수|complement|부호\s*비트|부호[-\s]?크기|sign[-\s]?magnitude|표현\s*방식/.test(text);
  // 회로·논리 설계 문맥이면 이 유형이 아니다(디지털 회로 archetype 소관).
  if (/플립플롭|카운터|카르노|k-?map|게이트|논리식|상태도|상태표|mux|멀티플렉서|여기표/.test(text)) return false;
  return binaryCtx && negativeRep;
}

/**
 * n비트 음수 표현 방식 판별 (임용 4번) — 결정론 파이프라인. GPT 없음.
 *  (가)·(나) 원형 다이어그램을 보고 각각의 표현 방식을 쓰는 문항.
 */
export async function runNumberRepresentationPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    // ★ 변형유형 = 보수를 이용한 **2진수 뺄셈** (사용자 지정 2026-07-30).
    if (mode === "exam_variant") {
      const sub = generateBinarySubtraction({ seed });
      const v = sub.values, a = sub.answer;
      const schemeLabel = SCHEME_LABEL_OF[v.scheme];
      log.info("binary_subtraction_generated", { bits: v.bits, scheme: v.scheme, a: v.a, b: v.b, result: a.result });

      const carryRule = v.scheme === "twos_complement"
        ? "최상위에서 발생한 자리올림은 버린다"
        : "최상위에서 자리올림이 발생하면 그 1을 최하위 자리에 다시 더한다(순환 자리올림)";

      const content =
        `그림은 ${v.bits}비트 ${schemeLabel}으로 10진수의 양수와 음수를 표현한 것이다. ` +
        `이 표현 방식을 이용하여 뺄셈 \\( ${v.a} - ${v.b} \\)를 2진수로 계산하려고 한다. ` +
        `제시된 절차에 따라 단계별로 구하여 서술하시오.`;

      const conditions = [
        `피감수 A = ${v.a}₁₀ = ${a.aBin}₂, 감수 B = ${v.b}₁₀ = ${a.bBin}₂ (${v.bits}비트)`,
        `뺄셈은 A + (−B)로 계산하며, ${carryRule}.`,
      ];

      const question = [
        `[단계 1] ${schemeLabel}에서 −${v.b}에 해당하는 ${v.bits}비트 2진수를 구한다.`,
        `[단계 2] A + (−B)를 2진 덧셈으로 계산한다. (${carryRule})`,
        `[단계 3] [단계 2]의 결과를 10진수로 나타내고, ${v.a} − ${v.b}의 값과 일치함을 보인다.`,
      ].join("\n");

      const answer = [
        `[단계 1] −${v.b} = ${a.negB}₂`,
        `[단계 2] ${a.aBin}₂ + ${a.negB}₂ = ${a.sumBin}₂ (자리올림 ${a.carryOut ? "발생 → " + (v.scheme === "twos_complement" ? "버림" : "최하위에 재가산") : "없음"})`,
        `[단계 3] ${a.sumBin}₂ = ${a.result}₁₀`,
      ].join("\n");

      const solution = [
        v.scheme === "twos_complement"
          ? `[단계 1] 2의 보수는 각 비트를 반전한 뒤 1을 더한다: ${v.b} = ${a.bBin}₂ → 반전 → +1 → **${a.negB}₂**.`
          : `[단계 1] 1의 보수는 각 비트를 반전한다: ${v.b} = ${a.bBin}₂ → **${a.negB}₂**.`,
        `[단계 2] ${a.aBin}₂ + ${a.negB}₂를 ${v.bits}비트로 더하면 ${a.sumBin}₂이다. ` +
          (a.carryOut
            ? v.scheme === "twos_complement"
              ? "최상위 자리올림이 났지만 2의 보수 뺄셈에서는 이를 버린다(결과가 양수라는 뜻)."
              : "최상위 자리올림이 났으므로 그 1을 최하위 자리에 다시 더했다(순환 자리올림)."
            : "자리올림이 없으므로 결과는 음수이며 보수 형태로 표현돼 있다."),
        // ★ 음수 결과(피감수 < 감수)는 합이 보수 형태로 남으므로 **다시 보수를 취해 크기를 읽는다**.
        `[단계 3] 부호 비트가 1이므로 결과는 음수다. ${a.sumBin}₂에 다시 ` +
          (v.scheme === "twos_complement" ? "2의 보수(반전 후 +1)" : "1의 보수(반전)") +
          `를 취하면 크기 ${Math.abs(a.result)}을 얻으므로 ${a.sumBin}₂ = ${a.result}₁₀ = ${v.a} − ${v.b} ✔`,
      ].join("\n");

      const figs: FigureVariant[] = [{
        id: `fig_numsub_${i + 1}`,
        label: `${v.bits}비트 ${schemeLabel} 대응표`,
        role: "main_circuit",
        diagramType: "number_ring_diagram",
        diagram: sub.diagram,
      }];

      return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants: figs };
    }

    const gen = generateNumberRepresentationRing({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("number_representation_generated", { mode, bits: v.bits, schemeA: v.schemeA, schemeB: v.schemeB });

    const content =
      `그림 (가)와 (나)는 ${v.bits}비트의 2진수로 10진수의 양수와 음수를 표현하여 나타낸 것이다. ` +
      `(가)와 (나)에서 사용된 음수 표현 방식을 각각 순서대로 쓰시오.`;

    const conditions = [
      `각 그림은 ${v.bits}비트 코드(바깥)와 그에 대응하는 10진수(안쪽)를 원형으로 배치한 것이다.`,
      "상위 1비트는 부호를 나타내며, 두 그림은 서로 다른 음수 표현 방식을 사용한다.",
    ];

    const question = "(가)와 (나)에서 사용된 음수 표현 방식을 각각 순서대로 쓰시오.";
    const answer = `(가) ${a.labelA}, (나) ${a.labelB}`;
    const solution = [
      `(가): ${a.reasonA} → **${a.labelA}**. 표현 범위는 ${a.rangeA}.`,
      `(나): ${a.reasonB} → **${a.labelB}**. 표현 범위는 ${a.rangeB}.`,
      "판별 요령: 0의 개수(하나면 2의 보수), 최상위 코드가 −0인지 −1인지, 부호 비트만 다른 쌍이 ±같은 크기인지를 본다.",
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_numring_a_${i + 1}`,
        label: "(가)",
        role: "main_circuit",
        diagramType: "number_ring_diagram",
        diagram: gen.diagramA,
      },
      {
        id: `fig_numring_b_${i + 1}`,
        label: "(나)",
        role: "comparison_diagram",
        diagramType: "number_ring_diagram",
        diagram: gen.diagramB,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
