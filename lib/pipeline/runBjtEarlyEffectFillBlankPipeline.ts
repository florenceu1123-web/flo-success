import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateBjtEarlyEffectFillBlank,
  matchesBjtEarlyEffectFillBlank,
  type BjtEarlyGeneration,
} from "@/lib/generation/topologies/bjtEarlyEffectFillBlank";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem, type GenerationMode, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runBjtEarlyEffectFillBlankPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다(복제하면 조용히 드리프트한다). */
export function detectBjtEarlyEffectFillBlank(a?: Partial<AnalysisResult> | null): boolean {
  return matchesBjtEarlyEffectFillBlank(a);
}

function buildText(g: BjtEarlyGeneration) {
  const marks = g.answers.map((a) => a.mark).join(", ");

  // ★★ 발문·조건에 "Early"를 쓰지 않는다 — 그 말 자체가 ㉠의 정답인 문항이 있다.
  //    원본 발문은 "Early 효과를 나타낸 것이다"였지만, 빈칸형에서는 그대로 두면 답을 알려준다.
  const content = [
    "그림 (가), (나)는 npn 쌍극성 접합 트랜지스터(BJT)의 공통 이미터(CE) 접속 시",
    "활성영역에서 나타나는 현상을 설명한 것이다. 다음 〈보기〉의 설명에서",
    `괄호 안 ${marks}에 들어갈 알맞은 용어 또는 식을 각각 쓰시오.`,
    "",
    "── 〈보 기〉 ──",
    ...g.items,
  ].join("\n");

  const conditions = [
    "(가)는 트랜지스터의 세로 단면으로, 빗금친 부분은 각 접합의 공핍층이다.",
    "\\( W_B \\)는 공핍층이 확장되기 전의 베이스폭, \\( W_B^{eff} \\)는 중성 베이스 영역의 폭(유효 베이스폭)이다.",
    "(나)는 \\( V_{BE} \\)를 일정하게 유지했을 때의 \\( I_C \\)–\\( V_{CE} \\) 특성곡선이며, 활성영역의 직선을 왼쪽으로 연장하여 그렸다.",
    "트랜지스터는 활성영역에서 동작하고, 온도는 일정하다고 가정한다.",
  ];

  const question = `〈보기〉의 빈칸 ${marks}에 들어갈 알맞은 용어 또는 식을 각각 쓰시오.`;
  const answer = g.answers.map((a) => `${a.mark} : ${a.value}`).join("\n");
  const solution = g.answers.map((a) => `${a.mark} ${a.value}\n  · ${a.why}`).join("\n\n");

  return { content, conditions, question, answer, solution };
}

export async function runBjtEarlyEffectFillBlankPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateBjtEarlyEffectFillBlank({ seed, index: i, mode });
    log.info("bjt_early_effect_fill_blank_generated", {
      mode,
      picks: gen.values.picks.join(","),
      roMasked: gen.roNote !== "r_o = 1/(dI_C/dV_CE)",
    });
    const text = buildText(gen);

    // ★ 그림 (가)·(나)는 원본 그대로 유지한다(사용자 지정) — 형식만 빈칸형으로 바꾼다.
    //   (나)의 r_o 주석은 생성기가 정한 값을 그대로 쓴다(정답이면 빈칸 기호로 바뀌어 온다).
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_struct_${i + 1}`,
        label: "(가) npn BJT 단면도 — CBJ·EBJ 공핍층과 유효 베이스폭",
        role: "main_circuit",
        diagramType: "bjt_early_structure",
        diagram: { caption: "(가)" },
      },
      {
        id: `fig_curve_${i + 1}`,
        label: "(나) 출력특성곡선 — 활성영역 직선의 연장",
        role: "concept_diagram",
        diagramType: "bjt_early_curve",
        diagram: { roNote: gen.roNote, caption: "(나)" },
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
