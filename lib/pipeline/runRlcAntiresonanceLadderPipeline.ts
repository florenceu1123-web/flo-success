import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateRlcAntiresonanceLadder, matchesRlcAntiresonanceLadder, mH, numTex, uF, vmTex,
  type RlcAntiGeneration,
} from "@/lib/generation/topologies/rlcAntiresonanceLadder";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem,
  type GenerationMode, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runRlcAntiresonanceLadderPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다. */
export function detectRlcAntiresonanceLadder(a?: Partial<AnalysisResult> | null): boolean {
  return matchesRlcAntiresonanceLadder(a);
}

function buildText(g: RlcAntiGeneration) {
  const v = g.values, s = g.sol;
  const isI = g.target === "current";
  const wt = `${v.w}t`;
  const sym = isI ? "i(t)" : "P";

  const content =
    `그림은 RLC 회로이다. 정상상태에서 ` +
    (isI ? `전원에 흐르는 전류 i(t)[A]를` : `전원이 공급하는 평균 전력 P[W]를`) +
    ` 〈해석 절차〉에 따라 구하고자 한다.`;

  const conditions = [
    `전원은 v(t) = ${vmTex(v.mRoot)}cos(${wt})[V]이다.`,
    `소자 값은 R₁ = ${v.R1}[Ω], L₁ = ${mH(v.L1)}, R₂ = ${v.R2}[Ω], C₁ = C₂ = ${uF(v.C1)}, L₂ = ${mH(v.L2)}, C₃ = ${uF(v.C3)}이다.`,
    "모든 소자는 이상적이며 회로는 정상상태에 있다.",
  ];

  const question = [
    "〈해석 절차〉에 따라 각 단계의 풀이 과정과 결과를 기술하시오.",
    "",
    `[단계 1] 각 소자의 임피던스를 구하고, **오른쪽 L₂와 C₃의 병렬 조합**이 이 주파수에서 어떤 임피던스를 갖는지 밝히시오.`,
    `[단계 2] [단계 1]의 결과를 이용하여 전원에서 본 **등가 임피던스 Z**를 구하시오.`,
    `[단계 3] ${isI ? "전류 i(t)를 시간 함수로 나타내시오." : "전원이 공급하는 평균 전력 P를 구하시오."}`,
  ].join("\n");

  const answer = [
    `[단계 1] jωL₁ = j${numTex(s.XL1)}[Ω], 1/(jωC₁) = −j${numTex(s.XC1)}[Ω], jωL₂ = j${numTex(s.XL2)}[Ω], 1/(jωC₃) = −j${numTex(s.XL2)}[Ω]`,
    `  · L₂와 C₃는 **크기가 같고 부호가 반대**(j${numTex(s.XL2)}, −j${numTex(s.XL2)})이므로 병렬 합성이`,
    `    Z_p = (j${numTex(s.XL2)})(−j${numTex(s.XL2)})/(j${numTex(s.XL2)} − j${numTex(s.XL2)}) → **∞ (개방)** — 병렬 **반공진**이다.`,
    "",
    `[단계 2] 병렬 LC가 개방이므로 그 앞의 C₁·C₂를 포함한 **오른쪽 가지 전체에 전류가 흐르지 않는다.**`,
    `  · Z = R₁ + jωL₁ + R₂ = ${v.R1} + j${numTex(s.XL1)} + ${v.R2} = ${numTex(s.Rtot)} + j${numTex(s.XL1)} = ${numTex(s.Rtot)}√2∠45°[Ω]`,
    "",
    isI
      ? `[단계 3] I = ${vmTex(v.mRoot)}∠0° / ${numTex(s.Rtot)}√2∠45° = ${numTex(s.Imag)}∠−45°[A] → **i(t) = ${numTex(s.Imag)}cos(${wt} − 45°)[A]**`
      : `[단계 3] |I| = ${numTex(s.Imag)}[A]이므로 P = ½|I|²·(R₁+R₂) = ½ × ${numTex(s.Imag)}² × ${numTex(s.Rtot)} = **${numTex(s.P)}[W]**`,
  ].join("\n");

  const solution = [
    `[단계 1] ω = ${v.w}[rad/s]에서 각 리액턴스를 구하면 jωL₁ = j${numTex(s.XL1)}, 1/(jωC₁) = −j${numTex(s.XC1)},`,
    `jωL₂ = j${numTex(s.XL2)}, 1/(jωC₃) = −j${numTex(s.XL2)}이다.`,
    `★ L₂와 C₃의 리액턴스 크기가 **정확히 같으므로**(ωL₂ = 1/(ωC₃)) 두 소자의 병렬 합성 임피던스는`,
    `분모가 0이 되어 **무한대(개방)** 가 된다. 이것이 **병렬 공진(반공진)** 이다.`,
    "",
    `[단계 2] 병렬 LC가 개방이면 그 가지로는 전류가 흐를 수 없고, 직렬로 놓인 C₁·C₂도 함께 전류가 0이 된다.`,
    `따라서 회로는 전원 → R₁ → L₁ → R₂ → 전원의 **단일 직렬 루프**로 축약된다.`,
    `Z = (R₁ + R₂) + jωL₁ = ${numTex(s.Rtot)} + j${numTex(s.XL1)}이고, 값 설계상 ωL₁ = R₁+R₂이므로 Z = ${numTex(s.Rtot)}(1 + j) = ${numTex(s.Rtot)}√2∠45°이다.`,
    "",
    isI
      ? `[단계 3] I = V/Z = ${vmTex(v.mRoot)}∠0°/(${numTex(s.Rtot)}√2∠45°) = ${numTex(s.Imag)}∠−45°이므로 i(t) = ${numTex(s.Imag)}cos(${wt} − 45°)[A]이다.`
      : `[단계 3] |I| = ${vmTex(v.mRoot)}/(${numTex(s.Rtot)}√2) = ${numTex(s.Imag)}[A]이고 저항에서만 전력이 소비되므로 P = ½|I|²(R₁+R₂) = ${numTex(s.P)}[W]이다.`,
    `※ C₁·C₂·L₂·C₃ 값은 답에 직접 들어가지 않는다 — 반공진으로 오른쪽이 통째로 개방되기 때문이며, 그것을 알아보는 것이 이 문항의 핵심이다.`,
  ].join("\n");

  void sym;
  return { content, conditions, question, answer, solution };
}

export async function runRlcAntiresonanceLadderPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateRlcAntiresonanceLadder({ seed, index: i, mode });
    log.info("rlc_antiresonance_ladder_generated", {
      mode, target: gen.target, values: gen.values, Imag: gen.sol.Imag, P: gen.sol.P,
    });
    const text = buildText(gen);
    const figureVariants: FigureVariant[] = [{
      id: `fig_circuit_${i + 1}`,
      label: "그림. RLC 회로 (오른쪽 L∥C는 반공진)",
      role: "main_circuit",
      diagramType: "rlc_antiresonance_ladder_circuit",
      diagram: gen.circuitDiagram,
    }];
    return {
      id: randomUUID(),
      content: text.content, conditions: text.conditions, question: text.question,
      answer: text.answer, solution: text.solution, topicKey, figureVariants,
    };
  });
}
