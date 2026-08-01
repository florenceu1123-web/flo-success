import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateLogicConditionSop } from "@/lib/generation/topologies/logicConditionSop";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runLogicConditionSopPipeline");

/**
 * 재검출 안전망 — stale analysis로 circuitType이 combinational_gate 등으로 와도, 텍스트가
 * "조합논리 + 간소화 + 동작조건(말)"이고 FF/순차/MUX/파형/다중출력이 아니면 여기서 판별.
 * (분류기와 동일 시그니처.)
 */
export function detectLogicConditionSop(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const blanksText = (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" ");
  const text = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""} ${(analysis.relatedConcepts ?? []).join(" ")} ${blanksText}`.toLowerCase();
  const has = (arr: string[]) => arr.some((k) => text.includes(k.toLowerCase()));
  const combKw = has(["조합논리회로", "조합 논리회로", "조합논리", "조합 논리", "combinational"]);
  const simplifyKw = has(["간소화", "가장 간단", "간단한 논리식", "최소화", "최소 sop", "최소 표현", "논리식으로 표현", "논리식으로 나타", "간략화"]);
  const conditionKw = has(["동작 조건", "동작조건", "조건을 만족", "조건을 모두 만족", "무관하게", "같으면", "다르면", "이면 출력 f", "일 때 출력 f"]);
  const seqOther = has([
    "플립플롭", "flip-flop", "flipflop", "카운터", "counter", "순차", "sequential",
    "멀티플렉서", "multiplexer", "2×1 mux", "2x1 mux", "파형", "타이밍", "waveform", "timing",
    "출력 g", "출력 f, g", "출력 f와 g", "두 출력",
  ]);
  return combKw && simplifyKw && conditionKw && !seqOther;
}

/**
 * 동작 조건(말) → 최소 SOP 간소화 (임용 25번 디지털논리) — 결정론 파이프라인. GPT 없음.
 *  그림 없음(원본과 동일). 진리표는 풀이용 solutionFigure.
 *  ★ generic combinational_gate 경로(K-map 주어짐+2출력+구현회로)와 완전히 다른 유형.
 */
export async function runLogicConditionSopPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { count, topicKey, mode } = args;
  const genMode: "exam_similar" | "exam_variant" = mode === "exam_variant" ? "exam_variant" : "exam_similar";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateLogicConditionSop({ seed, mode: genMode, index: i });
    log.info("logic_condition_sop_generated", {
      mode: genMode, dominant: gen.values.dominant, rel: gen.values.rel,
      minterms: gen.minterms.join(","), sop: gen.sopText, terms: gen.termCount,
    });

    const content = [
      `다음 동작 조건을 모두 만족하는 조합논리회로가 있다. 입력은 A, B, C이고 출력은 F이다.`,
      `출력 F를 가장 간소화한 논리식(SOP)으로 나타내려 한다. <해석 절차>에 따라 각 단계별 풀이과정과 함께 구하시오.`,
    ].join(" ");

    const conditions = gen.conditions.map((c, k) => `(조건 ${k + 1}) ${c}`);

    const question = [
      `[단계 1] 동작 조건으로부터 진리표를 작성하고 F=1인 최소항(minterm)을 구한다.`,
      `[단계 2] 카르노맵으로 인접 최소항을 묶어 간소화한다.`,
      `[단계 3] 가장 간소화한 논리식 F(SOP)를 구한다.`,
    ].join("\n");

    const mintermStr = gen.minterms.map((m) => `m${sub(m)}`).join(", ");
    const answer = [
      `[단계 1] F=1 최소항: ${mintermStr} (F(A,B,C)=Σm(${gen.minterms.join(",")}))`,
      `[단계 3] F = ${gen.sopText}`,
    ].join("\n");

    const solution = [
      `[단계 1] 두 동작 조건을 입력 A,B,C의 8가지 경우에 적용하면 진리표가 결정된다.`,
      `  F=1인 최소항: Σm(${gen.minterms.join(",")}).`,
      `[단계 2] 카르노맵에서 인접한 1들을 최대 그룹으로 묶어 변수를 소거한다(가장 큰 묶음이 가장 간소).`,
      `[단계 3] 각 묶음을 곱항으로, 전체를 합(OR)으로 결합한 최소 SOP:`,
      `  ⇒ F = ${gen.sopText}  (${gen.termCount}개 곱항).`,
    ].join("\n");

    // 그림 없음(원본과 동일) — 진리표는 풀이 영역 보조 figure.
    const figureVariants: FigureVariant[] = [];
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_lcs_tt_${i + 1}`,
        label: "진리표 (풀이)",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.truthTable,
      },
    ];

    return {
      id: randomUUID(),
      content, conditions, question, answer, solution,
      topicKey, figureVariants, solutionFigures,
    };
  });
}

/** 최소항 아래첨자 (m0, m3 …) — 숫자를 유니코드 아래첨자로. */
function sub(n: number): string {
  const map: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };
  return String(n).split("").map((c) => map[c] ?? c).join("");
}
