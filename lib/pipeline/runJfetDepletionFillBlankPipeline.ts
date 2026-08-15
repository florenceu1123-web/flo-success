import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateJfetDepletionFillBlank, matchesJfetDepletionFillBlank, type JfetGeneration,
} from "@/lib/generation/topologies/jfetDepletionFillBlank";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem, type GenerationMode,
  type JfetDepletionPanelsDiagram, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runJfetDepletionFillBlankPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다. */
export function detectJfetDepletionFillBlank(a?: Partial<AnalysisResult> | null): boolean {
  return matchesJfetDepletionFillBlank(a);
}

function buildText(g: JfetGeneration) {
  const v = g.values;
  const marks = g.answers.map((a) => a.mark).join(", ");

  const content = [
    "그림 (가)~(라)는 n채널 JFET의 \\( V_{DS} \\) 값에 따른 공핍층의 변화를 개념적으로 나타낸 것이다.",
    `이에 대한 다음 〈보기〉의 설명에서 괄호 안 ${marks}에 들어갈 알맞은 용어·값 또는 식을 각각 쓰시오.`,
    "",
    "── 〈보 기〉 ──",
    ...g.items,
  ].join("\n");

  const conditions = [
    `JFET의 동작특성에서 선형동작구간은 \\( V_{DS} = 0 \\sim ${v.linearMax} \\)[V]이며, 핀치오프 전압은 \\( V_P = ${v.vp} \\)[V]이다.`,
    "네 그림 모두 \\( V_{GS} = 0 \\)[V]이고, 소자는 이상적이라고 가정한다.",
    `(가)~(라)의 \\( V_{DS} \\)는 각각 ${v.vdsList.join(", ")}[V]이다.`,
  ];

  const question = `〈보기〉의 빈칸 ${marks}에 들어갈 알맞은 용어·값 또는 식을 각각 쓰시오.`;
  const answer = g.answers.map((a) => `${a.mark} : ${a.value}`).join("\n");
  const solution = g.answers.map((a) => `${a.mark} ${a.value}\n  · ${a.why}`).join("\n\n");

  return { content, conditions, question, answer, solution };
}

export async function runJfetDepletionFillBlankPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateJfetDepletionFillBlank({ seed, index: i, mode });
    const v = gen.values;
    log.info("jfet_depletion_fill_blank_generated", {
      mode, vp: v.vp, linearMax: v.linearMax, vds: v.vdsList.join("/"), vgsEx: v.vgsExample,
    });
    const text = buildText(gen);

    const diagram: JfetDepletionPanelsDiagram = {
      vdsList: v.vdsList,
      pinchOff: v.vp,
      vgs: 0,
    };

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_jfet_${i + 1}`,
        label: "(가)~(라) n채널 JFET의 V_DS별 공핍층 변화",
        role: "main_circuit",
        diagramType: "jfet_depletion_panels",
        diagram,
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
