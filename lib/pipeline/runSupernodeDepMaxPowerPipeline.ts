/**
 * 독립+종속 전원 슈퍼노드 파라미터 최대 전력 (임용 6번) 전용 파이프라인.
 * 토폴로지를 코드가 알고 있으므로 Vision의 연결 인식 정확도에 의존하지 않는다.
 */
import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  pickInstance, num, coefA, type SupernodeDepMaxPowerInstance,
} from "@/lib/generation/topologies/supernodeDepMaxPower";
import type {
  AnalysisResult, CircuitNetlist, FigureVariant, GeneratedProblem, GenerationMode, TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runSupernodeDepMaxPowerPipeline");

/**
 * 이 원본인지 감지 — 강제 라우팅용.
 * 시그니처: 종속 전원 + 슈퍼노드 + (전력 최대) + 기호 파라미터.
 * ★ 그림이 아니라 **본문 서술**로 판별하므로 연결 인식이 흔들려도 영향받지 않는다.
 */
export function detectSupernodeDepMaxPower(analysis: AnalysisResult | null | undefined): boolean {
  const text = [analysis?.topic, analysis?.interpretation, ...(analysis?.relatedConcepts ?? [])]
    .filter(Boolean).join(" ");
  if (!text.trim()) return false;
  const dependent = /종속\s*(전원|전압원|전류원)|dependent\s*source/.test(text) ||
    analysis?.topologySignature?.features?.hasDependentSource === true;
  const supernode = /슈퍼\s*노드|supernode|super\s*node/i.test(text);
  const maxPower = /(최대|최댓값|maximum)/.test(text) && /전력|power/.test(text);
  // 소자값이 기호(a)로 주어지는 것이 이 유형의 결정적 특징 — 수치 회로면 다른 유형이다.
  // ★ `\b`는 한글에 통하지 않는다(한글은 비단어 문자라 "a값과"에서 경계가 잡히지 않음, 실측).
  //   → 한글 조사·단위가 뒤에 붙는 형태를 그대로 열거한다.
  const symbolic =
    /(^|[^A-Za-z])a\s*\[?\s*(Ω|ohm|V|\[)/i.test(text) ||       // a[Ω] · a[V] · a Ω
    /\d\s*a\s*\[?\s*(Ω|ohm)/i.test(text) ||                     // 2a[Ω]
    /R_?B\s*=\s*\d*\s*a/i.test(text) ||                          // R_B = 2a
    /(^|[^A-Za-z])a\s*(값|를|의|에|가)/.test(text) ||            // "a값과" · "a를 구" · "a의"
    /파라미터|매개변수/.test(text);
  // 네 조건(종속원 + 슈퍼노드 + 최대 전력 + 기호 a)이 모두 맞아야 하므로 이 조합만으로
  // 충분히 구체적이다 — 수치만 있는 슈퍼노드 문제는 "a값"을 언급하지 않는다.
  return dependent && supernode && maxPower && symbolic;
}

/** 원본 구조 그대로의 netlist (수치는 인스턴스 계수, 저항 a는 기호 그대로 표기). */
function buildNetlist(inst: SupernodeDepMaxPowerInstance): CircuitNetlist {
  const { rx, m, k } = inst.params;
  return {
    ground: "GND",
    components: [
      { id: "R_x", type: "R", value: `${num(rx)}Ω`, pins: [{ node: "A" }, { node: "GND" }] },
      { id: "R_1", type: "R", value: "a[Ω]", pins: [{ node: "A" }, { node: "M" }] },
      { id: "R_2", type: "R", value: "a[Ω]", pins: [{ node: "M" }, { node: "B" }] },
      { id: "R_B", type: "R", value: `${coefA(k)}[Ω]`, pins: [{ node: "B" }, { node: "GND" }] },
      { id: "V_s", type: "V", value: "a[V]", pins: [{ node: "M" }, { node: "GND" }] },
      { id: "E_1", type: "CCVS", value: `${m === 1 ? "" : num(m)}I_x`, control: "R_x", pins: [{ node: "B" }, { node: "A" }] },
    ],
  } as unknown as CircuitNetlist;
}

export async function runSupernodeDepMaxPowerPipeline(args: {
  mode: GenerationMode;
  count: number;
}): Promise<GeneratedProblem[]> {
  const { mode, count } = args;
  const out: GeneratedProblem[] = [];
  for (let i = 0; i < count; i++) {
    const inst = pickInstance(mode, i);
    const { rx, m, k } = inst.params;
    const A = num(inst.aStar);
    const variant = mode === "exam_variant";

    const netlist = buildNetlist(inst);
    const figureVariants: FigureVariant[] = [{
      id: `fig_snd_${i + 1}`,
      label: "주어진 회로",
      role: "original_circuit",
      diagramType: "analog_netlist",
      diagram: netlist,
    } as FigureVariant];

    const vbTex = `\\dfrac{${num(inst.vbNum)}a}{a + ${A}}`;
    const pbTex = `\\dfrac{${num(inst.pbNum)}a}{(a + ${A})^{2}}`;
    const common = [
      `저항 \\( R_x = ${num(rx)}\\,[\\Omega] \\)에 흐르는 전류를 \\( I_x \\)라 하고, 종속 전압원은 \\( V_B - V_A = ${m === 1 ? "" : num(m)}I_x \\)이다.`,
      `\\( \\mathrm{A} \\)와 \\( \\mathrm{B} \\)는 슈퍼 노드(super node)이며, \\( a > 0 \\)이다.`,
    ];

    if (!variant) {
      // 유사(원본 구조): 3단계 — V_B 식 → P_B 식 → 최대가 되는 a와 P_M
      out.push({
        id: randomUUID(),
        content:
          `그림은 독립 전원과 종속 전원이 포함된 회로이다. ` +
          `저항 \\( R_B = ${coefA(k)}\\,[\\Omega] \\)에서 소비되는 전력이 최대가 되도록 하는 \\( a \\)값과, ` +
          `이때의 전력 \\( P_M\\,[\\mathrm{W}] \\)을 제시된 〈해석 절차〉에 따라 구하여 순서대로 서술하시오. ` +
          `(단, \\( a > 0 \\)이고 A와 B는 슈퍼 노드(super node)이다.)`,
        conditions: common,
        question: [
          `[단계 1] 전압 \\( V_B\\,[\\mathrm{V}] \\)를 \\( a \\)가 포함된 식으로 구하시오.`,
          `[단계 2] [단계 1]의 결과를 이용하여 저항 \\( R_B = ${coefA(k)}\\,[\\Omega] \\)의 전력 \\( P_B\\,[\\mathrm{W}] \\)를 \\( a \\)가 포함된 식으로 구하시오.`,
          `[단계 3] [단계 2]의 결과를 이용하여, 저항 \\( R_B\\,[\\Omega] \\)에서 소비되는 전력이 최대가 되기 위한 \\( a \\)값과, 이때의 전력 \\( P_M\\,[\\mathrm{W}] \\)을 구하시오.`,
        ].join("\n"),
        answer: `\\( V_B = ${vbTex}\\,[\\mathrm{V}] \\), \\( P_B = ${pbTex}\\,[\\mathrm{W}] \\), \\( a = ${A}\\,[\\Omega] \\), \\( P_M = ${num(inst.pMax)}\\,[\\mathrm{W}] \\)`,
        solution: [
          `[단계 1] \\( I_x = \\dfrac{V_A}{${num(rx)}} \\)이고 슈퍼 노드 조건에서 \\( V_B = V_A + ${m === 1 ? "" : num(m)}I_x = ${num(1 + m / rx)}V_A \\). ` +
            `슈퍼 노드(A·B)에 KCL을 적용하면 \\( \\dfrac{V_A}{${num(rx)}} + \\dfrac{V_A - a}{a} + \\dfrac{V_B - a}{a} + \\dfrac{V_B}{${coefA(k)}} = 0 \\) ` +
            `(중앙 노드는 \\( V_M = a \\)). 정리하면 \\( V_B = ${vbTex}\\,[\\mathrm{V}] \\).`,
          `[단계 2] \\( P_B = \\dfrac{V_B^{2}}{${coefA(k)}} = ${pbTex}\\,[\\mathrm{W}] \\).`,
          `[단계 3] \\( \\dfrac{dP_B}{da} = 0 \\)에서 \\( (a + ${A})^{2} - a\\cdot 2(a + ${A}) = 0 \\Rightarrow a = ${A}\\,[\\Omega] \\). ` +
            `대입하면 \\( P_M = \\dfrac{${num(inst.pbNum)}\\times ${A}}{(2\\times ${A})^{2}} = ${num(inst.pMax)}\\,[\\mathrm{W}] \\).`,
        ].join("\n"),
        topicKey: "supernode" as TopicKey,
        figureVariants,
      } satisfies GeneratedProblem);
      continue;
    }

    // 변형: 구하는 양 교환 — 최대가 되는 a가 주어지고 종속 전압원 계수와 P_M을 역산
    out.push({
      id: randomUUID(),
      content:
        `그림은 독립 전원과 종속 전원이 포함된 회로이다. 종속 전압원의 계수 \\( \\alpha \\)는 미지수이고 ` +
        `\\( V_B - V_A = \\alpha I_x \\)이다. 저항 \\( R_B = ${coefA(k)}\\,[\\Omega] \\)에서 소비되는 전력이 ` +
        `\\( a = ${A}\\,[\\Omega] \\)일 때 최대가 된다고 할 때, 계수 \\( \\alpha \\)와 이때의 최대 전력 \\( P_M\\,[\\mathrm{W}] \\)을 ` +
        `제시된 〈해석 절차〉에 따라 구하여 순서대로 서술하시오. (단, \\( a > 0 \\)이고 A와 B는 슈퍼 노드(super node)이다.)`,
      conditions: [
        `저항 \\( R_x = ${num(rx)}\\,[\\Omega] \\)에 흐르는 전류를 \\( I_x \\)라 하고, 종속 전압원은 \\( V_B - V_A = \\alpha I_x \\)이다.`,
        `\\( R_B \\)의 소비 전력이 최대가 되는 값은 \\( a = ${A}\\,[\\Omega] \\)이다.`,
        `\\( \\mathrm{A} \\)와 \\( \\mathrm{B} \\)는 슈퍼 노드(super node)이며, \\( a > 0 \\)이다.`,
      ],
      question: [
        `[단계 1] \\( \\beta = 1 + \\dfrac{\\alpha}{R_x} \\)로 두고, 전압 \\( V_B \\)를 \\( a \\)와 \\( \\beta \\)가 포함된 식으로 나타내시오.`,
        `[단계 2] [단계 1]의 결과로부터 전력 \\( P_B \\)가 최대가 되는 \\( a \\)를 \\( \\beta \\)로 나타내고, 주어진 \\( a = ${A}\\,[\\Omega] \\)를 이용하여 계수 \\( \\alpha \\)를 구하시오.`,
        `[단계 3] [단계 2]의 결과를 이용하여 이때의 최대 전력 \\( P_M\\,[\\mathrm{W}] \\)을 구하시오.`,
      ].join("\n"),
      answer: `\\( \\alpha = ${num(m)} \\), \\( P_M = ${num(inst.pMax)}\\,[\\mathrm{W}] \\) (\\( V_B = ${vbTex}\\,[\\mathrm{V}] \\), \\( P_B = ${pbTex}\\,[\\mathrm{W}] \\))`,
      solution: [
        `[단계 1] \\( I_x = \\dfrac{V_A}{R_x} \\)이므로 \\( V_B = \\beta V_A \\) (\\( \\beta = 1 + \\alpha/R_x \\)). ` +
          `슈퍼 노드 KCL \\( \\dfrac{V_A}{R_x} + \\dfrac{V_A-a}{a} + \\dfrac{V_B-a}{a} + \\dfrac{V_B}{${coefA(k)}} = 0 \\)에서 ` +
          `\\( V_B = \\dfrac{2\\beta R_x\\,a}{a + C R_x} \\), \\( C = 1 + \\beta + \\dfrac{\\beta}{${num(k)}} \\).`,
        `[단계 2] \\( P_B = \\dfrac{V_B^{2}}{${coefA(k)}} \\propto \\dfrac{a}{(a + C R_x)^{2}} \\)이므로 최대는 \\( a = C R_x \\)에서 발생한다. ` +
          `\\( ${A} = C \\times ${num(rx)} \\Rightarrow C = ${num(inst.aStar / rx)} \\), ` +
          `\\( C = 1 + \\beta\\left(1 + \\dfrac{1}{${num(k)}}\\right) \\Rightarrow \\beta = ${num(1 + m / rx)} \\), ` +
          `따라서 \\( \\alpha = R_x(\\beta - 1) = ${num(rx)}\\times ${num(m / rx)} = ${num(m)} \\).`,
        `[단계 3] \\( P_M = \\dfrac{\\beta^{2}R_x}{${num(k)}\\,C} = ${num(inst.pMax)}\\,[\\mathrm{W}] \\) (또는 \\( P_B \\) 식에 \\( a = ${A} \\) 대입).`,
      ].join("\n"),
      topicKey: "supernode" as TopicKey,
      figureVariants,
    } satisfies GeneratedProblem);
  }
  log.info("supernode_dep_max_power_generated", { mode, count: out.length });
  return out;
}
