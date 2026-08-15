import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateMaxPowerTwoSourceRatio, matchesMaxPowerTwoSourceRatio, mHTex, numTex, uFTex,
  type MaxPowerTwoSourceGeneration,
} from "@/lib/generation/topologies/maxPowerTwoSourceRatio";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem,
  type GenerationMode, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runMaxPowerTwoSourceRatioPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다. */
export function detectMaxPowerTwoSourceRatio(a?: Partial<AnalysisResult> | null): boolean {
  return matchesMaxPowerTwoSourceRatio(a);
}

function buildText(g: MaxPowerTwoSourceGeneration) {
  const v = g.values, s = g.sol;
  const dual = v.dual;
  const elemName = dual ? "정전용량" : "인덕턴스";
  const elemSym = dual ? "C" : "L";
  const elemVal = dual ? uFTex(s.loadElem) : mHTex(s.loadElem);
  const sElem = dual ? mHTex(v.Xs / v.w) : uFTex(1 / (v.w * v.Xs));
  const pElem = dual ? uFTex(1 / (v.w * v.Xp)) : mHTex(v.Xp / v.w);
  const sSign = dual ? "+j" : "−j";
  const pSign = dual ? "−j" : "+j";
  const thSign = s.thIm >= 0 ? "+j" : "−j";
  const loadSign = s.thIm >= 0 ? "−j" : "+j";

  const content =
    `그림 (가)와 (나)의 각 회로에서 부하에 **최대전력을 공급하기 위해 필요한 부하 저항과 ${elemName}** 을 구하려고 한다. ` +
    `각 부하에 공급되는 최대전력을 각각 P_max1[W], P_max2[W]라 한다.`;

  const conditions = [
    `두 회로는 **전원의 크기만 다르고 회로망은 완전히 같다** — v₁(t) = ${v.V1}cos(${v.w}t)[V], v₂(t) = ${numTex(s.V2)}cos(${v.w}t)[V].`,
    `직렬 소자는 ${sElem}, 병렬부는 ${v.Rp}[Ω]과 ${pElem}이다.`,
    "모든 소자는 이상적이며 정상상태로 동작한다.",
  ];

  const question = [
    "〈해석 절차〉에 따라 각 단계의 풀이 과정과 결과를 기술하시오.",
    "",
    `[단계 1] ω = ${v.w}[rad/s]에서 각 소자의 임피던스를 구하고, 부하 단자에서 본 **테브난 임피던스 Z_th**를 구하시오.`,
    `[단계 2] 최대전력 전달 조건을 쓰고, (가)·(나) 각 회로에서 필요한 **부하 저항 R와 ${elemName} ${elemSym}** 을 구하시오. ` +
      `두 회로의 값이 어떤 관계인지도 밝히시오.`,
    `[단계 3] P_max1과 P_max2를 구하고, η₁ = P_max2/P_max1 과 η₂ = R₂/R₁ + ${elemSym}₂/${elemSym}₁ 의 값을 구하시오.`,
  ].join("\n");

  const answer = [
    `[단계 1] 직렬 소자 = ${sSign}${numTex(v.Xs)}[Ω], 병렬부 = ${v.Rp} ∥ ${pSign}${numTex(v.Xp)} = ${numTex(s.parRe)}${s.parIm >= 0 ? "+j" : "−j"}${numTex(Math.abs(s.parIm))}[Ω]`,
    `  · **Z_th = ${numTex(s.thRe)} ${thSign}${numTex(Math.abs(s.thIm))}[Ω]**  (부하를 떼면 전류가 0이라 V_th = 전원 전압 그대로)`,
    "",
    `[단계 2] 최대전력 조건은 **켤레 정합 Z_L = Z_th\\*** → Z_L = ${numTex(s.RL)} ${loadSign}${numTex(s.XL)}[Ω]`,
    `  · **R₁ = R₂ = ${numTex(s.RL)}[Ω]**, **${elemSym}₁ = ${elemSym}₂ = ${elemVal}**`,
    `  · ★ 부하 값은 **회로망만으로 결정**되므로 전원 크기와 무관하다 → 두 회로의 값이 같다.`,
    "",
    `[단계 3] 정합 시 허수부가 상쇄되어 |I| = |V|/(2R), P_max = |V|²/(8R)`,
    `  · P_max1 = ${v.V1}²/(8×${numTex(s.RL)}) = ${numTex(s.P1)}[W], P_max2 = ${numTex(s.V2)}²/(8×${numTex(s.RL)}) = ${numTex(s.P2)}[W]`,
    `  · **η₁ = ${numTex(s.eta1)}**, **η₂ = 1 + 1 = ${numTex(s.eta2)}**`,
  ].join("\n");

  const solution = [
    `[단계 1] ω = ${v.w}에서 직렬 소자의 임피던스는 ${sSign}${numTex(v.Xs)}[Ω]이고, 병렬부는`,
    `${v.Rp} ∥ ${pSign}${numTex(v.Xp)} = ${numTex(s.parRe)}${s.parIm >= 0 ? " + j" : " − j"}${numTex(Math.abs(s.parIm))}[Ω]이다.`,
    `부하를 떼어 놓으면 회로에 전류가 흐르지 않으므로 직렬 소자와 병렬부에 전압 강하가 없다 —`,
    `즉 **V_th는 전원 전압 그대로**이고, 전원을 단락하고 본 임피던스가 Z_th = ${numTex(s.thRe)} ${thSign}${numTex(Math.abs(s.thIm))}[Ω]이다.`,
    "",
    `[단계 2] 부하가 임피던스일 때 최대전력 전달 조건은 **Z_L = Z_th의 켤레복소수**이다.`,
    `따라서 Z_L = ${numTex(s.RL)} ${loadSign}${numTex(s.XL)}[Ω] → R = ${numTex(s.RL)}[Ω]이고,`,
    dual
      ? `리액턴스 크기 ${numTex(s.XL)} = 1/(ωC)에서 C = ${elemVal}이다.`
      : `리액턴스 크기 ${numTex(s.XL)} = ωL에서 L = ${elemVal}이다.`,
    `★★ 여기서 **Z_th는 전원 크기와 전혀 무관**하다(전원을 단락하고 본 임피던스이므로).`,
    `그러므로 (가)와 (나)의 부하 값은 **완전히 같다** — R₁ = R₂, ${elemSym}₁ = ${elemSym}₂.`,
    "",
    `[단계 3] 켤레 정합이면 Z_th + Z_L = 2R이 되어 허수부가 사라지므로 |I| = |V|/(2R)이고,`,
    `P_max = ½|I|²R = |V|²/(8R)이다. 즉 **P_max는 전원 진폭의 제곱에 비례**한다.`,
    `전원이 ${v.k}배가 되었으므로 η₁ = P_max2/P_max1 = ${v.k}² = ${numTex(s.eta1)}이고,`,
    `부하 값은 그대로이므로 η₂ = R₂/R₁ + ${elemSym}₂/${elemSym}₁ = 1 + 1 = ${numTex(s.eta2)}이다.`,
    `※ 두 비가 다른 이유(η₁은 전원에 의존, η₂는 의존하지 않음)를 설명하는 것이 이 문항의 핵심이다.`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}

export async function runMaxPowerTwoSourceRatioPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateMaxPowerTwoSourceRatio({ seed, index: i, mode });
    log.info("max_power_two_source_ratio_generated", {
      mode, values: gen.values, RL: gen.sol.RL, XL: gen.sol.XL, eta1: gen.sol.eta1,
    });
    const text = buildText(gen);
    const figureVariants: FigureVariant[] = [
      { id: `fig_a_${i + 1}`, label: "(가) 회로", role: "main_circuit", diagramType: "max_power_two_source_circuit", diagram: gen.figA },
      { id: `fig_b_${i + 1}`, label: "(나) 회로 — 전원의 크기만 다르다", role: "equivalent_circuit", diagramType: "max_power_two_source_circuit", diagram: gen.figB },
    ];
    return {
      id: randomUUID(),
      content: text.content, conditions: text.conditions, question: text.question,
      answer: text.answer, solution: text.solution, topicKey, figureVariants,
    };
  });
}
