import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampRcTOscillator } from "@/lib/generation/topologies/opampRcTOscillator";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampRcTOscillatorPipeline");

// 감지기는 분류기 0-PRE와 **같은 구현**을 쓴다 — 두 곳에 복사하면 한쪽만 고쳐져 어긋난다.
//   판별 근거·실측 이력은 `lib/analysis/detectOpampRcTOscillator.ts` 주석 참조.
export { detectOpampRcTOscillator } from "@/lib/analysis/detectOpampRcTOscillator";

/**
 * 반전 OPAMP + T형 RC망 응용회로 + 사인파 발진기 (임용 9번) — 결정론 파이프라인. GPT 없음.
 *  [1] I₁(s)·I₂(s) [2] 전달특성 V_out/V_in [3] (나)의 특성방정식 근 → V_out의 주파수
 */
export async function runOpampRcTOscillatorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampRcTOscillator({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("opamp_rc_t_oscillator_generated", {
      mode, swapped: gen.swapped, Rk: v.Rk, Cn: v.Cn, fCoef: v.fCoef,
    });

    const fwd = gen.swapped ? "커패시터 C 2개와 접지 저항 ½R" : "저항 R 2개와 접지 커패시터 2C";
    const fb = gen.swapped ? "저항 R 2개와 접지 커패시터 2C" : "커패시터 C 2개와 접지 저항 ½R";
    const Rtex = `${v.Rk}\\,[\\mathrm{k\\Omega}]`;
    const Ctex = `${v.Cn}\\,[\\mathrm{nF}]`;

    const content = [
      "그림 (가)는 연산증폭기 응용 회로이며, 그림 (나)는 (가)의 회로에서 출력단자와 입력단자를 연결하여 구성한 사인파 발진기이다.",
      "그림 (가)의 전달특성 \\( \\dfrac{V_{out}(s)}{V_{in}(s)} \\)와 그림 (나)에서 \\( V_{out} \\)의 주파수를 구하려고 한다.",
      "제시된 〈해석 절차〉에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오.",
      "(단, \\(s\\)는 복소주파수이며, 연산증폭기는 이상적으로 동작한다.)",
    ].join(" ");

    const conditions = [
      `(가) 입력측 T형 회로망: ${fwd} — 입력 \\( V_{in} \\)에서 연산증폭기 반전(−) 단자까지.`,
      `(가) 귀환측 T형 회로망: ${fb} — 반전(−) 단자에서 출력 \\( V_{out} \\)까지.`,
      `연산증폭기의 비반전(+) 단자는 접지되어 있고 입력 전류는 0이다(반전 단자는 가상접지).`,
      `\\( R = ${Rtex} \\), \\( C = ${Ctex} \\)`,
    ];

    const question = [
      `[단계 1] 그림 (가)의 회로에서 전류 \\( I_1(s) \\)와 \\( I_2(s) \\)를 각각 구한다.`,
      `[단계 2] [단계 1]에서 구한 결과를 이용하여 전달특성 \\( \\dfrac{V_{out}(s)}{V_{in}(s)} \\)를 구한다.`,
      `[단계 3] [단계 2]에서 구한 결과를 이용하여 그림 (나)의 특성방정식의 근에서 \\( V_{out} \\)의 주파수를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] \\( ${a.i1} \\), \\( ${a.i2} \\)`,
      `[단계 2] \\( ${a.transfer} \\)`,
      `[단계 3] \\( ${a.freq} = ${a.freqNumeric} \\approx ${(v.fCoef / Math.PI).toFixed(1)}\\,[\\mathrm{Hz}] \\)`,
    ].join("\n");

    const solution = [
      `[단계 1] 연산증폭기가 이상적이고 (+)가 접지이므로 반전 단자는 **가상접지**(0 V)이고 입력 전류는 0이다.`,
      gen.swapped
        ? `  입력측 마디 ①에 KCL: \\( (V_{in}-V_1)sC = \\dfrac{V_1}{R/2} + V_1 sC \\) → \\( V_1 = \\dfrac{sRC}{2(1+sRC)}V_{in} \\), ` +
          `\\( ${a.i1} \\) (①에서 가상접지로 흐르는 전류 \\( V_1 sC \\)).`
        : `  입력측 마디 ①에 KCL: \\( \\dfrac{V_{in}-V_1}{R} = V_1\\cdot 2sC + \\dfrac{V_1}{R} \\) → \\( V_1 = \\dfrac{V_{in}}{2(1+sRC)} \\), ` +
          `\\( ${a.i1} \\) (①에서 가상접지로 흐르는 전류 \\( V_1/R \\)).`,
      gen.swapped
        ? `  귀환측 마디 ③에 KCL: \\( -\\dfrac{V_3}{R} = \\dfrac{V_3-V_{out}}{R} + 2sC V_3 \\) → \\( V_3 = \\dfrac{V_{out}}{2(1+sRC)} \\), \\( ${a.i2} \\).`
        : `  귀환측 마디 ③에 KCL: \\( -sC V_3 = (V_3-V_{out})sC + \\dfrac{V_3}{R/2} \\) → \\( V_3 = \\dfrac{sRC}{2(1+sRC)}V_{out} \\), \\( ${a.i2} \\).`,
      `[단계 2] 반전 단자(가상접지)에서 KCL: \\( I_1(s) = I_2(s) \\). 두 식을 같게 두면 공통 인수 \\( 2(1+sRC) \\)가 소거되어 ` +
        `\\( ${a.transfer} \\) 를 얻는다. ` +
        (gen.swapped
          ? `(입력측이 미분형·귀환측이 적분형이라 2중 **미분기** 특성이 된다.)`
          : `(입력측이 적분형·귀환측이 미분형이라 2중 **적분기** 특성이 된다.)`),
      `[단계 3] 그림 (나)는 출력단자를 입력단자에 연결했으므로 \\( V_{in} = V_{out} \\)이고, 발진 조건은 \\( 1 - \\dfrac{V_{out}}{V_{in}} = 0 \\)이다. ` +
        `즉 특성방정식은 \\( ${a.charEq} \\)이고, 근은 \\( s = \\pm j\\dfrac{1}{RC} \\) — **순허수**이므로 감쇠 없이 지속되는 정현 발진이다.`,
      `  따라서 \\( ${a.omega} \\), \\( ${a.freq} = \\dfrac{1}{2\\pi\\cdot${v.Rk}\\times10^{3}\\cdot${v.Cn}\\times10^{-9}} = ${a.freqNumeric} \\approx ${(v.fCoef / Math.PI).toFixed(1)}\\,[\\mathrm{Hz}] \\).`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_opamp_rct_a_${i + 1}`,
        label: "(가) 연산증폭기 응용 회로",
        role: "original_circuit",
        diagramType: "opamp_rc_t_oscillator_circuit",
        diagram: gen.diagramGiven,
      },
      {
        id: `fig_opamp_rct_b_${i + 1}`,
        label: "(나) 출력단자와 입력단자를 연결한 사인파 발진기",
        role: "implementation_circuit",
        diagramType: "opamp_rc_t_oscillator_circuit",
        diagram: gen.diagramOsc,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
