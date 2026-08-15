import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateR2rLadderDac, matchesR2rLadderDac, type R2rGeneration,
} from "@/lib/generation/topologies/r2rLadderDac";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem, type GenerationMode,
  type R2rLadderDacDiagram, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runR2rLadderDacPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다. */
export function detectR2rLadderDac(a?: Partial<AnalysisResult> | null): boolean {
  return matchesR2rLadderDac(a);
}

/** 기약분수 문자열 — 소수를 쓰면 route의 전역 분수 변환기가 제멋대로 바꾼다(CLAUDE.md 1-4-3). */
function frac(x: number): string {
  for (let q = 1; q <= 64; q += 1) {
    const p = x * q;
    if (Math.abs(p - Math.round(p)) < 1e-9) {
      const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
      const n = Math.round(p), d = q / g(Math.abs(n) || 1, q), nn = n / g(Math.abs(n) || 1, q);
      return d === 1 ? `${nn}` : `\\dfrac{${nn}}{${d}}`;
    }
  }
  return String(Number(x.toFixed(3)));
}

/** 저항 표기 — 정수면 정수로. */
const kohm = (v: number) => `${Number(v.toFixed(2))}`;

/**
 * 발문은 **〈해석 절차〉 3단계 서술형** — 원본이 보기 ①~⑤ 객관식이므로 절대원칙을 따른다.
 */
function buildText(g: R2rGeneration) {
  const v = g.values;
  const word = v.word.join("");
  const bitsDesc = ["D", "C", "B", "A"].map((n, i) => `${n}=${v.word[i]}`).join(", ");

  const content = [
    "그림은 4비트 사다리형(Ladder) D/A 변환회로이다.",
    `디지털 입력이 DCBA = ${word}인 경우 아날로그 출력전압 \\( V_o \\)[V]를`,
    "〈해석 절차〉에 따라 구하시오.",
  ].join(" ");

  const conditions = [
    `사다리의 직렬 저항은 \\( R = ${kohm(v.rSeries)} \\)[kΩ], 션트·종단 저항은 \\( 2R = ${kohm(v.rShunt)} \\)[kΩ]이다.`,
    `디지털 입력 '1'은 ${v.vRef}[V], '0'은 0[V]로 입력됨을 의미한다.`,
    `연산증폭기는 이상적이며, 귀환 저항 \\( R_f = ${kohm(v.rf)} \\)[kΩ], 접지측 저항 \\( R_g = ${kohm(v.rg)} \\)[kΩ]이다.`,
    "A가 최하위 비트(LSB), D가 최상위 비트(MSB)이다.",
  ];

  const question = [
    "[단계 1] R-2R 사다리망의 성질을 이용하여, 사다리 출력단에서 본 개방 전압 " +
      "\\( V_L \\)을 디지털 입력의 10진값과 기준 전압으로 나타내는 식을 세우시오.",
    `[단계 2] 주어진 입력 DCBA = ${word}에 대해 \\( V_L \\)의 값을 구하시오.`,
    "[단계 3] 연산증폭기의 구성을 밝히고 전압이득을 구한 뒤, 출력전압 \\( V_o \\)를 구하시오.",
  ].join("\n");

  const answer = [
    `[단계 1] \\( V_L = V_{ref} \\times \\dfrac{(DCBA)_2}{2^4} \\) — 사다리를 들여다본 저항이 비트 값과 무관하게 ` +
      `항상 \\( R \\)이므로 각 비트가 2의 거듭제곱으로 가중된다.`,
    `[단계 2] \\( (${word})_2 = ${g.decimal} \\) 이므로 ` +
      `\\( V_L = ${v.vRef} \\times \\dfrac{${g.decimal}}{16} = ${frac(g.vLadder)} \\)[V].`,
    `[단계 3] (+)단자 입력·(−)단자 분압이므로 **비반전 증폭기**이고 ` +
      `\\( A_v = 1 + \\dfrac{R_f}{R_g} = ${frac(g.gain)} \\). ` +
      `따라서 \\( V_o = A_v \\times V_L = ${frac(g.vOut)} \\)[V].`,
  ].join("\n");

  const solution = [
    `[단계 1] R-2R 사다리는 **직렬 R·션트 2R**이라, 어느 마디에서 오른쪽을 보아도 등가저항이 항상 \\( 2R \\)이다.\n` +
      `  그래서 각 비트가 만드는 기여가 한 단씩 지날 때마다 정확히 **절반**으로 줄고, 결과적으로\n` +
      `  \\( V_L = V_{ref}\\left(\\dfrac{D}{2} + \\dfrac{C}{4} + \\dfrac{B}{8} + \\dfrac{A}{16}\\right) ` +
      `= V_{ref} \\times \\dfrac{(DCBA)_2}{16} \\) 이 된다.\n` +
      `  ★ 마디방정식을 하나씩 풀 필요가 없다는 것이 이 회로의 요점이다.`,
    `[단계 2] ${bitsDesc} 이므로 \\( (${word})_2 = ${g.decimal} \\).\n` +
      `  \\( V_L = ${v.vRef} \\times \\dfrac{${g.decimal}}{16} = ${frac(g.vLadder)} \\)[V]`,
    `[단계 3] 사다리 출력이 연산증폭기의 **(+)단자**로 들어가고, (−)단자에는 \\( R_g \\)(접지)와 ` +
      `\\( R_f \\)(귀환)가 분압을 이룬다 → **비반전 증폭기**.\n` +
      `  \\( A_v = 1 + \\dfrac{R_f}{R_g} = 1 + \\dfrac{${kohm(v.rf)}}{${kohm(v.rg)}} = ${frac(g.gain)} \\)\n` +
      `  이상적 연산증폭기라 (+)단자로 전류가 흐르지 않으므로 사다리는 부하 효과를 받지 않는다.\n` +
      `  \\( V_o = ${frac(g.gain)} \\times ${frac(g.vLadder)} = ${frac(g.vOut)} \\)[V]`,
  ].join("\n\n");

  return { content, conditions, question, answer, solution };
}

export async function runR2rLadderDacPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateR2rLadderDac({ seed, index: i, mode });
    const v = gen.values;
    log.info("r2r_ladder_dac_generated", {
      mode, R: v.rSeries, twoR: v.rShunt, vRef: v.vRef,
      word: v.word.join(""), gain: gen.gain, vOut: gen.vOut,
    });
    const text = buildText(gen);

    const diagram: R2rLadderDacDiagram = {
      seriesLabel: `${kohm(v.rSeries)}kΩ`,
      shuntLabel: `${kohm(v.rShunt)}kΩ`,
      rfLabel: `${kohm(v.rf)}kΩ`,
      rgLabel: `${kohm(v.rg)}kΩ`,
      bitLabels: ["A", "B", "C", "D"],
      outLabel: "V_o",
    };

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_dac_${i + 1}`,
        label: "4비트 사다리형(Ladder) D/A 변환회로",
        role: "main_circuit",
        diagramType: "r2r_ladder_dac_circuit",
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
