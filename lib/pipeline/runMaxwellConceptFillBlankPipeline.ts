import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateMaxwellConceptFillBlank, matchesMaxwellConceptFillBlank, type MaxwellGeneration,
} from "@/lib/generation/topologies/maxwellConceptFillBlank";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type GeneratedProblem, type GenerationMode, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runMaxwellConceptFillBlankPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다. */
export function detectMaxwellConceptFillBlank(a?: Partial<AnalysisResult> | null): boolean {
  return matchesMaxwellConceptFillBlank(a);
}

function buildText(g: MaxwellGeneration) {
  const marks = g.answers.map((a) => a.mark).join(", ");
  const content = [
    "Maxwell 방정식에 대한 다음 〈보기〉의 설명에서",
    `괄호 안 ${marks}에 들어갈 알맞은 용어 또는 식을 각각 쓰시오.`,
    "",
    "── 〈보 기〉 ──",
    ...g.items,
  ].join("\n");

  const conditions = [
    "E는 전계의 세기, D는 전속밀도, H는 자계의 세기, B는 자속밀도, J는 전류밀도, ρ_v는 체적전하밀도이다.",
    "매질은 선형·등방성이며, 표피 깊이는 양도체(σ ≫ ωε) 조건에서 정의한다.",
  ];

  const question = `〈보기〉의 빈칸 ${marks}에 들어갈 알맞은 용어 또는 식을 각각 쓰시오.`;
  const answer = g.answers.map((a) => `${a.mark} : ${a.value}`).join("\n");
  const solution = g.answers.map((a) => `${a.mark} ${a.value}\n  · ${a.why}`).join("\n\n");

  return { content, conditions, question, answer, solution };
}

export async function runMaxwellConceptFillBlankPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateMaxwellConceptFillBlank({ seed, index: i, mode });
    log.info("maxwell_concept_fill_blank_generated", { mode, picks: gen.values.picks.join(",") });
    const text = buildText(gen);
    return {
      id: randomUUID(),
      content: text.content, conditions: text.conditions, question: text.question,
      answer: text.answer, solution: text.solution, topicKey,
      // ★ 그림 없음 — 순수 개념 텍스트 문항이다.
      figureVariants: [],
    };
  });
}
