import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateCSwitchFallThrough,
  matchesCSwitchFallThrough,
  type CSwitchGeneration,
} from "@/lib/generation/topologies/cSwitchFallThrough";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type CodeBlockDiagram, type FigureVariant,
  type GeneratedProblem, type GenerationMode, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runCSwitchFallThroughPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다(복제하면 조용히 드리프트한다). */
export function detectCSwitchFallThrough(a?: Partial<AnalysisResult> | null): boolean {
  return matchesCSwitchFallThrough(a);
}

/**
 * 발문은 **〈해석 절차〉 3단계 서술형**이다 — 원본이 보기 ①~⑤ 객관식이므로
 * 프로젝트 절대원칙(객관식 → 3단계 주관식)을 따른다. 구조·원리는 그대로 두고 형식만 바꾼다.
 */
function buildText(g: CSwitchGeneration) {
  const v = g.values;
  const a = v.arrayName;
  const k = v.init.length;
  const zeroFrom = k;
  const zeroList = `${a}[${zeroFrom}] ~ ${a}[${v.size - 1}]`;

  const content = [
    "다음은 C언어로 작성한 프로그램이다. 〈해석 절차〉에 따라 프로그램의 실행 결과를 구하시오.",
  ].join("\n");

  const conditions = [
    `배열 ${a}는 크기가 ${v.size}인데 초기화 목록에는 ${k}개의 값만 주어져 있다.`,
    "표준 C에서 초기화 목록이 배열 크기보다 짧으면, 남은 원소는 0으로 채워진다.",
    "printf의 출력은 한 줄에 하나씩 나타난다.",
  ];

  const question = [
    "[단계 1] 배열 " + a + `의 원소 ${a}[0] ~ ${a}[${v.size - 1}]의 값을 모두 쓰고, ` +
      `op의 값에 따라 switch문이 어느 레이블로 진입하는지 쓰시오.`,
    "[단계 2] [단계 1]에서 진입한 레이블의 반복문이 끝났을 때 sum의 값을 구하고, 첫 번째 출력값을 쓰시오.",
    "[단계 3] break의 유무를 근거로 그 이후의 실행 흐름을 설명하고, 두 번째 출력값을 쓰시오.",
  ].join("\n");

  const elemStr = g.elements.join(", ");
  const answer = [
    `[단계 1] ${a}[0] ~ ${a}[${v.size - 1}] = ${elemStr} ` +
      `(초기화하지 않은 ${zeroList}은 0). op = ${v.op}이므로 case ${v.op}로 진입한다.`,
    `[단계 2] sum = ${g.out1}, 첫 번째 출력값은 ${g.out1}이다.`,
    `[단계 3] case ${v.op}에는 break가 없으므로 default로 이어서 실행된다(fall-through). ` +
      `sum은 초기화되지 않고 유지되므로 두 번째 출력값은 ${g.out2}이다.`,
  ].join("\n");

  // 단계 2·3의 덧셈 항을 그대로 보여 준다 — 학생이 추적표와 대조할 수 있게.
  const terms = (start: number) => g.elements.slice(start).join(" + ");
  const solution = [
    `[단계 1] 초기화 목록은 ${v.init.length}개(${v.init.join(", ")})뿐이고 배열 크기는 ${v.size}이므로 ` +
      `${zeroList}은 0으로 채워진다. 따라서 ${a} = {${elemStr}}이다. op = ${v.op}이므로 case ${v.op}로 진입한다.`,
    `[단계 2] case ${v.op}의 반복문은 i = ${v.startCase2}부터 ${v.size - 1}까지 돈다.\n` +
      `  sum = ${terms(v.startCase2)} = ${g.out1}\n  → 첫 번째 출력: ${g.out1}`,
    `[단계 3] case ${v.op}의 printf 다음에 break가 없다. switch문은 break를 만나야 빠져나가므로 ` +
      `실행이 default로 그대로 이어진다(fall-through).\n` +
      `  default의 반복문은 i = ${v.startDefault}부터 ${v.size - 1}까지 돌고, sum은 0으로 되돌아가지 않는다.\n` +
      `  sum = ${g.out1} + (${terms(v.startDefault)}) = ${g.out2}\n  → 두 번째 출력: ${g.out2}` +
      (g.defaultAddsZeroOnly
        ? `\n  ※ default가 더하는 구간은 모두 0이므로 두 출력값이 같다 — 이것이 이 문제의 핵심이다.`
        : `\n  ※ default가 초기화된 원소까지 다시 더하므로 두 출력값이 달라진다.`),
    `따라서 실행 결과는 ${g.out1}, ${g.out2} 두 줄이다.`,
  ].join("\n\n");

  return { content, conditions, question, answer, solution };
}

export async function runCSwitchFallThroughPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateCSwitchFallThrough({ seed, index: i, mode });
    log.info("c_switch_fall_through_generated", {
      mode,
      size: gen.values.size,
      initCount: gen.values.init.length,
      starts: `${gen.values.startCase2}/${gen.values.startDefault}`,
      out: `${gen.out1},${gen.out2}`,
    });
    const text = buildText(gen);

    const diagram: CodeBlockDiagram = { code: gen.code, language: "c" };
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_code_${i + 1}`,
        label: "[프로그램]",
        role: "concept_diagram",
        diagramType: "code_block",
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
