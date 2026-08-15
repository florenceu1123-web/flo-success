import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateNumberReprFillBlank, matchesNumberReprFillBlank, neg, type NumberReprGeneration,
} from "@/lib/generation/topologies/numberReprFillBlank";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type GeneratedProblem, type GenerationMode, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runNumberReprFillBlankPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다. */
export function detectNumberReprFillBlank(a?: Partial<AnalysisResult> | null): boolean {
  return matchesNumberReprFillBlank(a);
}

function buildText(g: NumberReprGeneration) {
  const v = g.values, s = g.sol;
  const dual = v.dual;

  const content = [
    "컴퓨터의 데이터 표현과 산술 연산에 대한 다음 〈보기〉의 설명에서",
    "괄호 안 ㉠~㉤에 들어갈 알맞은 값을 각각 쓰시오.",
    "",
    "── 〈보 기〉 ──",
    ...g.items,
  ].join("\n");

  const conditions = [
    "모든 표현은 부호화된 고정 길이 2진수를 사용한다.",
    "초과(overflow)는 **같은 부호의 두 수를 더했을 때 결과의 부호가 달라지는 경우**로 판정한다.",
  ];

  const question = "〈보기〉의 빈칸 ㉠, ㉡, ㉢, ㉣, ㉤에 들어갈 알맞은 값을 각각 쓰시오.";

  const answer = g.answers.map((a) => `${a.mark} : ${a.value}`).join("\n");

  const sumSteps = `${neg(v.x)} → ${s.sumBin.length}비트 2의 보수, ${neg(v.y)} → 같은 방법으로 표현한 뒤 더하면 ${s.sumBin}₂ (십진수 ${neg(s.sumDec)})`;

  const solution = [
    dual
      ? `㉠ 16진수 각 자리를 4비트씩 풀어 쓰면 ${s.hex}₁₆ = ${v.binHex}₂ 이다.`
      : `㉠ 2진수를 **오른쪽부터 4비트씩** 묶어 각 묶음을 16진수 한 자리로 바꾼다 → ${v.binHex}₂ = ${s.hex}₁₆.`,
    "",
    dual
      ? `㉡·㉢ ${s.onesComp}₂를 1의 보수로 읽으면 각 비트를 반전한 값의 음수이므로 −${v.a}이고, ` +
        `같은 비트열을 2의 보수로 읽으면 ${neg(s.twosDec)}이다. 두 표현이 **1만큼 차이**나는 것이 핵심이다.`
      : `㉡ −${v.a}의 1의 보수는 +${v.a}의 각 비트를 반전한 것이다 → ${s.onesComp}₂.\n` +
        `㉢ 같은 비트열을 2의 보수로 해석하면 ${neg(s.twosDec)}이다 — 1의 보수 표현은 2의 보수 표현보다 ` +
        `항상 **1만큼 큰 수**를 나타내므로 −${v.a}의 1의 보수 = ${neg(s.twosDec)}의 2의 보수가 된다.`,
    "",
    `㉣ 1의 보수 덧셈에서는 최상위에서 나온 자리올림을 버리지 않고 **최하위 비트에 다시 더한다**` +
      `(순환 자리올림, end-around carry). 이 추가 덧셈 때문에 2의 보수 덧셈보다 느리다.`,
    "",
    dual
      ? `㉤ ${v.rangeBits}비트 2의 보수의 최댓값은 부호비트가 0이고 나머지가 모두 1인 경우이므로 ${s.rangeMax}이다.`
      : `㉤ ${v.rangeBits}비트 2의 보수의 범위는 ${s.rangeMin} ~ ${s.rangeMax}이다(음수 쪽이 하나 더 많다).`,
    "",
    `※ ㅁ의 검산: ${sumSteps}. 두 피연산자의 부호가 ${v.x < 0 === v.y < 0 ? "같고" : "다르고"} ` +
      `결과의 부호가 ${s.overflow ? "달라졌으므로 **초과가 발생**한다" : "같으므로 **초과가 발생하지 않는다**"}.`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}

export async function runNumberReprFillBlankPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateNumberReprFillBlank({ seed, index: i, mode });
    log.info("number_repr_fill_blank_generated", {
      mode, values: gen.values, hex: gen.sol.hex, overflow: gen.sol.overflow,
    });
    const text = buildText(gen);
    return {
      id: randomUUID(),
      content: text.content,
      conditions: text.conditions,
      question: text.question,
      answer: text.answer,
      solution: text.solution,
      topicKey,
      // ★ 그림 없음 — 순수 텍스트 문항이다(logic_condition_sop 선례).
      figureVariants: [],
    };
  });
}
