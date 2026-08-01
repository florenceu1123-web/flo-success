import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateAcRlAveragePower } from "@/lib/generation/topologies/acRlAveragePower";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcRlAveragePowerPipeline");

/**
 * AC 전원 + 직렬 리액턴스 + 병렬 저항 2개 → 평균전력 (임용 8번) 감지 — 라우팅용.
 *
 * ★ 실측 신고(2026-08-01): generic `universal_ac`가 처리해 **v(t)가 주어지지 않고**
 *   소자 내부 id(`V_leg1_1`)가 본문에 노출되며 값도 지저분했다.
 * 시그니처: 교류 전원 + (인덕터 또는 커패시터) + **평균전력** + 저항 2개.
 *   ★ 양보: 테브난·최대전력·공진·역률·어드미턴스는 각자 전용 archetype이 있다.
 */
export function detectAcRlAveragePower(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  // 형제 양보 — 각자 전용 archetype이 있다.
  if (/테브난|thevenin|노턴|norton|최대\s*전력|최대전력|공진|resonance|역률|어드미턴스|대역폭|과도|시정수/.test(text)) return false;
  if (/연산\s*증폭기|연산증폭기|op-?amp|발진/.test(text)) return false;

  const ac = /교류|정현파|ac\b|페이저|phasor|∠/.test(text);
  const reactive = /인덕터|코일|커패시터|콘덴서|리액턴스|\bl\b|\bc\b/.test(text);
  const avgPower = /평균\s*전력|평균전력|소비되는\s*전력|공급하는\s*전력|average\s*power/.test(text);
  return ac && reactive && avgPower;
}

/**
 * AC 평균전력 (임용 8번) — 결정론 파이프라인. GPT 없음.
 *  유사: 직렬 인덕터 — [1] 전원 공급 평균전력 [2] 인덕터 평균전력(=0) [3] 두 저항의 평균전력
 *  변형: 직렬 **커패시터** — [1] Z·I 페이저 [2] 커패시터 평균전력(=0)과 병렬부 전압 페이저 [3] **v(t)**
 */
export async function runAcRlAveragePowerPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcRlAveragePower({ seed, mode });
    const v = gen.values, a = gen.answer, L = gen.labels;
    log.info("ac_rl_average_power_generated", {
      mode, isCapacitor: gen.isCapacitor, Vm: v.Vm, R1: v.R1, R2: v.R2,
      Rp: `${v.RpNum}/${v.RpDen}`, Ps: a.Ps, Pr1: a.Pr1, Pr2: a.Pr2,
    });

    const elem = gen.isCapacitor ? "커패시터" : "인덕터";
    // ★ 원본 단서를 그대로 — "V는 v(t)=V_m cos ωt의 페이저 전압이다".
    //   (실측 신고: generic 경로가 이 단서를 빠뜨려 v(t)가 주어지지 않았다.)
    const note = `(단, 회로의 각 소자는 이상적으로 동작하고, \\( \\mathbf{V} \\)는 \\( v_s(t) = ${v.Vm}\\cos\\omega t\\,[\\mathrm{V}] \\)의 페이저 전압이며 \\( \\omega = ${v.omega}\\,[\\mathrm{rad/s}] \\)이다.)`;

    const content = gen.isCapacitor
      ? `그림은 교류 전원이 포함된 RC 응용 회로이다. 전원이 공급하는 전력과 병렬 저항 양단 전압 \\( v(t) \\)를 구하려고 한다. 제시된 〈해석 절차〉에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. ${note}`
      : `그림은 교류 전원이 포함된 RL 응용 회로이다. 전원이 공급하는 전력과 인덕터 및 저항에서 소비되는 전력을 각각 구하려고 한다. 제시된 〈해석 절차〉에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. ${note}`;

    const conditions = [
      `전원 \\( \\mathbf{V} = ${L.vTex} \\) (페이저, 진폭 기준)`,
      `직렬 ${elem}의 임피던스 \\( ${L.xTex} \\)`,
      `병렬 저항 \\( R_1 = ${L.r1Tex} \\), \\( R_2 = ${L.r2Tex} \\)`,
    ];

    const question = gen.isCapacitor
      ? [
          `[단계 1] 회로의 등가 임피던스 \\( Z\\,[\\Omega] \\)와 전류 페이저 \\( \\mathbf{I}\\,[\\mathrm{A}] \\)를 구한다.`,
          `[단계 2] 커패시터에서 소비되는 평균전력 \\([\\mathrm{W}]\\)과 병렬 저항 양단의 전압 페이저 \\( \\mathbf{V}_p\\,[\\mathrm{V}] \\)를 구한다.`,
          `[단계 3] [단계 2]의 결과를 이용하여 병렬 저항 양단 전압의 시간 함수 \\( v(t)\\,[\\mathrm{V}] \\)를 구한다.`,
        ].join("\n")
      : [
          `[단계 1] 교류 전압원이 공급하는 평균전력 \\([\\mathrm{W}]\\)을 구한다.`,
          `[단계 2] 인덕터에서 소비되는 평균전력 \\([\\mathrm{W}]\\)을 구한다.`,
          `[단계 3] \\( ${L.r1Tex} \\)과 \\( ${L.r2Tex} \\) 저항에서 소비되는 평균전력 \\([\\mathrm{W}]\\)을 각각 구한다.`,
        ].join("\n");

    const answer = gen.isCapacitor
      ? [
          `[단계 1] \\( ${a.ZTex} \\), \\( ${a.IphasorTex} \\)`,
          `[단계 2] 커패시터의 평균전력 = 0 [W], \\( ${a.VpTex} \\)`,
          `[단계 3] \\( ${a.vtTex} \\)`,
        ].join("\n")
      : [
          `[단계 1] \\( P_s = ${a.Ps}\\,[\\mathrm{W}] \\)`,
          `[단계 2] \\( P_L = 0\\,[\\mathrm{W}] \\)`,
          `[단계 3] \\( P_{R_1} = ${a.Pr1}\\,[\\mathrm{W}] \\), \\( P_{R_2} = ${a.Pr2}\\,[\\mathrm{W}] \\)`,
        ].join("\n");

    const rp = L.rpTex;
    const zStep =
      `병렬 저항의 합성은 \\( R_p = \\dfrac{R_1R_2}{R_1+R_2} = \\dfrac{${v.R1}\\times${v.R2}}{${v.R1}+${v.R2}} = ${rp}\\,[\\Omega] \\)이고, ` +
      `${elem}가 직렬이므로 \\( ${a.ZTex} \\). 따라서 \\( ${a.IphasorTex} \\).`;

    const solution = gen.isCapacitor
      ? [
          `[단계 1] ${zStep}`,
          `[단계 2] 이상 커패시터는 전압과 전류의 위상차가 90°이므로 **평균전력은 0 [W]**이다(무효 전력만 주고받는다). ` +
            `병렬 저항 양단 전압은 \\( \\mathbf{V}_p = \\mathbf{I}\\cdot R_p = ${a.ImagTex}\\angle +45^\\circ \\times ${rp} = ${a.VpTex?.replace("\\mathbf{V}_p = ", "")} \\).`,
          `[단계 3] 페이저를 시간 함수로 되돌리면 \\( ${a.vtTex} \\). ` +
            `(전원보다 위상이 45° 앞선다 — 직렬 커패시터가 전류를 앞서게 하기 때문이다.)`,
        ].join("\n")
      : [
          `[단계 1] ${zStep} ` +
            `전원이 공급하는 평균전력은 \\( P_s = \\tfrac{1}{2}|\\mathbf{I}|^2 R_p = ${a.Ps}\\,[\\mathrm{W}] \\) ` +
            `(임피던스의 실수부 \\( R_p \\)만 전력을 소비한다).`,
          `[단계 2] 이상 인덕터는 전압과 전류의 위상차가 90°이므로 \\( P_L = \\tfrac{1}{2}|\\mathbf{V}_L||\\mathbf{I}|\\cos 90^\\circ = 0\\,[\\mathrm{W}] \\). ` +
            `무효 전력만 주고받을 뿐 평균적으로 소비하지 않는다.`,
          `[단계 3] 병렬부 전압의 크기는 \\( |\\mathbf{V}_p| = |\\mathbf{I}|R_p = \\dfrac{${v.Vm}}{\\sqrt{2}} \\)이므로 ` +
            `\\( P_{R} = \\dfrac{|\\mathbf{V}_p|^2}{2R} \\)에서 ` +
            `\\( P_{R_1} = ${a.Pr1}\\,[\\mathrm{W}] \\), \\( P_{R_2} = ${a.Pr2}\\,[\\mathrm{W}] \\). ` +
            `두 값의 합 \\( ${a.Pr1}+${a.Pr2} = ${a.Ps}\\,[\\mathrm{W}] \\)이 [단계 1]의 \\( P_s \\)와 같아 검산된다.`,
        ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_ac_avgp_${i + 1}`,
        label: gen.isCapacitor ? "교류 전원 + 직렬 커패시터 + 병렬 저항" : "교류 전원 + 직렬 인덕터 + 병렬 저항",
        role: "original_circuit",
        diagramType: "ac_rl_average_power_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
