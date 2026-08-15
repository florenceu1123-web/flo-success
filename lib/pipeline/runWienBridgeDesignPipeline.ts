import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateWienBridgeDesign, matchesWienBridgeDesign, PI_APPROX,
  type WienDesignGeneration,
} from "@/lib/generation/topologies/wienBridgeDesign";
import { buildWienBridgeNetlist } from "@/lib/generation/analog/wienBridgeOscillator";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem, type GenerationMode, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runWienBridgeDesignPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다. */
export function detectWienBridgeDesign(a?: Partial<AnalysisResult> | null): boolean {
  return matchesWienBridgeDesign(a);
}

/** 기약분수 문자열 (3.2 → "16/5"). 이득처럼 **단위가 없는 값**은 소수로 쓰면 안 된다 — 아래 주석 참고. */
function fracStr(numerator: number, denominator: number): string {
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  const d = g(Math.round(numerator), Math.round(denominator));
  const n2 = Math.round(numerator) / d, d2 = Math.round(denominator) / d;
  return d2 === 1 ? `${n2}` : `${n2}/${d2}`;
}

/**
 * 발문은 **〈해석 절차〉 3단계 서술형**이다 — 원본이 보기 ①~⑤ 객관식이므로
 * 프로젝트 절대원칙(객관식 → 3단계 주관식)을 따른다. 구조·원리는 그대로 두고 형식만 바꾼다.
 */
/**
 * ★★ 표기 규칙 (CLAUDE.md 1-4-3 — route의 전역 분수 변환기):
 *   변환기는 **단위 없는 소수**를 분수로 바꾼다. 실측에서 `f_0 ≈ 796.2` → `3981/5`,
 *   `A_v = 3.2` → `16/5`로 뭉개졌다. 확인 결과 **평문 `[Hz]`가 바로 붙은 숫자만** 보호된다
 *   (`[\mathrm{Hz}]`·`[배]`·`[V/V]`는 보호되지 않는다).
 *   ⇒ ① 주파수는 LaTeX 밖에서 `796.2[Hz]`로 쓴다.
 *      ② 이득처럼 무차원 값은 **소수를 아예 쓰지 않고** `1 + 22/10` 같은 분수식으로 남긴다.
 *      ③ RC는 R[kΩ]×C[nF] = R·C[µs] 라 정수 곱으로만 적는다.
 */
function buildText(g: WienDesignGeneration) {
  const v = g.values;
  /** RC[µs] = R[kΩ] × C[nF] — 정수. */
  const rcUs = v.R_kohm * v.C_nF;
  const ratioFrac = fracStr(v.R2_kohm, v.R1_kohm);
  const gainFrac = fracStr(v.R1_kohm + v.R2_kohm, v.R1_kohm);
  /** 소수 첫째 자리까지 + 평문 단위 (변환기 보호). */
  const f0Hz = `${Number(g.f0.toFixed(1))}[Hz]`;

  const content = [
    "그림은 연산증폭기와 RC 회로망으로 구성한 빈 브리지(Wien bridge) 발진회로이다.",
    "이 발진기가 안정적이고 지속적으로 동작하도록 음귀환 저항을 정하고, 그때의 공진주파수를 구하려고 한다.",
    "〈해석 절차〉에 따라 구하시오.",
  ].join(" ");

  const conditions = [
    `정귀환 RC 회로망의 소자 값은 직렬·병렬 모두 R = ${v.R_kohm}[kΩ], C = ${v.C_nF}[nF]로 같다.`,
    `음귀환 저항 중 접지측 저항은 \\( R_1 = ${v.R1_kohm} \\)[kΩ]이다.`,
    "연산증폭기는 이상적이라고 가정한다.",
    `계산에서 \\( \\pi \\)는 ${PI_APPROX}로 한다.`,
  ];

  const question = [
    "[단계 1] 공진 상태에서 정귀환 RC 회로망의 궤환율 \\( \\beta \\)를 구하고, " +
      "바크하우젠(Barkhausen) 조건으로부터 발진에 필요한 폐루프 전압이득 \\( A_v \\)의 조건을 " +
      "\\( R_1 \\)과 \\( R_2 \\)로 나타내시오.",
    "[단계 2] [단계 1]의 조건과 주어진 \\( R_1 \\)을 이용하여, 발진이 **지속**되도록 하는 " +
      "\\( R_2 \\)의 값을 정하고 그렇게 정한 이유를 쓰시오.",
    `[단계 3] 이 발진회로의 공진주파수 \\( f_0 \\)를 식과 함께 구하시오. (\\( \\pi = ${PI_APPROX} \\))`,
  ].join("\n");

  const answer = [
    `[단계 1] \\( \\beta = 1/3 \\), 발진 조건 \\( A_v = 1 + R_2/R_1 \\ge 3 \\) 즉 \\( R_2 \\ge 2R_1 \\)` +
      ` (여기서는 \\( R_2 \\ge ${2 * v.R1_kohm} \\)[kΩ]).`,
    `[단계 2] \\( R_2 = ${v.R2_kohm} \\)[kΩ]. ` +
      `\\( A_v = 1 + \\dfrac{${v.R2_kohm}}{${v.R1_kohm}} = \\dfrac{${gainFrac.replace("/", "}{")}} \\)로 ` +
      `3보다 크므로 발진이 스스로 시작되어 지속된다.`,
    `[단계 3] \\( f_0 = \\dfrac{1}{2\\pi RC} \\) → ${f0Hz}, 약 ${g.f0Round}[Hz].`,
  ].join("\n");

  const solution = [
    `[단계 1] 정귀환망은 직렬 \\( Z_1 = R + \\dfrac{1}{j\\omega C} \\)와 병렬 \\( Z_2 = R \\parallel \\dfrac{1}{j\\omega C} \\)의 ` +
      `분압이다. \\( \\beta = \\dfrac{Z_2}{Z_1 + Z_2} \\)를 정리하면 허수부가 0이 되는 ` +
      `\\( \\omega_0 = \\dfrac{1}{RC} \\)에서 \\( \\beta \\)가 최대가 되고 그 값은 **\\( 1/3 \\)** 이다(두 RC의 R·C가 같을 때).\n` +
      `  바크하우젠 조건은 루프이득 \\( A_v\\beta = 1 \\)이므로 \\( A_v = 3 \\)이 필요하다. ` +
      `비반전 증폭기이므로 \\( A_v = 1 + \\dfrac{R_2}{R_1} \\)이고, 따라서 **\\( R_2 \\ge 2R_1 \\)** 이다.`,
    `[단계 2] \\( R_1 = ${v.R1_kohm} \\)[kΩ]이므로 경계값은 \\( R_2 = 2R_1 = ${2 * v.R1_kohm} \\)[kΩ]이다.\n` +
      `  ★ 그런데 \\( A_v \\)가 **정확히 3이면 임계 상태**라 소자 오차·온도 변화로 이득이 조금만 줄어도 발진이 사그라든다.\n` +
      `  안정적·지속적으로 동작하려면 3보다 **약간 큰** 이득이 필요하므로 ` +
      `\\( R_2 = ${v.R2_kohm} \\)[kΩ]를 택한다. 이때 ` +
      `\\( \\dfrac{R_2}{R_1} = \\dfrac{${ratioFrac.replace("/", "}{")}} \\), ` +
      `\\( A_v = \\dfrac{${gainFrac.replace("/", "}{")}} > 3 \\)이다.`,
    `[단계 3] 공진(발진) 주파수는 \\( \\omega_0 = \\dfrac{1}{RC} \\)에서 \\( f_0 = \\dfrac{1}{2\\pi RC} \\)이다.\n` +
      `  \\( RC = ${v.R_kohm}[\\mathrm{k\\Omega}] \\times ${v.C_nF}[\\mathrm{nF}] = ${rcUs}\\,[\\mu \\mathrm{s}] \\)\n` +
      // ★ π를 숫자(3.14)로 적으면 전역 분수 변환기가 157/50으로 뭉갠다 — 기호로 둔다.
      //   "π=3.14로 계산"이라는 지시는 조건·발문에 있고, 그쪽은 변환기가 건드리지 않는다.
      `  \\( f_0 = \\dfrac{1}{2\\pi \\times ${rcUs} \\times 10^{-6}} \\) → ${f0Hz}\n` +
      `  따라서 약 ${g.f0Round}[Hz] 이다.`,
  ].join("\n\n");

  return { content, conditions, question, answer, solution };
}

export async function runWienBridgeDesignPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateWienBridgeDesign({ seed, index: i, mode });
    const v = gen.values;
    log.info("wien_bridge_design_generated", {
      mode, R: v.R_kohm, C: v.C_nF, R1: v.R1_kohm, R2: v.R2_kohm,
      f0: gen.f0.toFixed(1), f0Round: gen.f0Round, gain: gen.gain.toFixed(2),
    });
    const text = buildText(gen);

    // ★ 회로 figure는 기존 Wien 빌더를 **그대로 재사용**한다 (복제 금지 — 드리프트 방지).
    //   음귀환 저항 라벨만 원본 표기에 맞춰 R_2로 준다.
    const netlist = buildWienBridgeNetlist({
      R_kohm: v.R_kohm, C_nF: v.C_nF, R1_kohm: v.R1_kohm, Rf_kohm: v.R2_kohm, feedbackLabel: "R_2",
    });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_wien_${i + 1}`,
        label: "빈 브리지(Wien bridge) 발진회로",
        role: "main_circuit",
        diagramType: "analog_netlist",
        diagram: netlist,
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
