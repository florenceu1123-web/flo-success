import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  coefTex, expConstTex, expTex, fmt, generateTwoSourceRlSuperposition, matchesTwoSourceRlSuperposition,
  omegaArgTex, piTex, ratTex, rootCoefTex,
  type TwoSourceGeneration,
} from "@/lib/generation/topologies/twoSourceRlSuperposition";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem,
  type GenerationMode, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runTwoSourceRlSuperpositionPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다(복제 금지). */
export function detectTwoSourceRlSuperposition(a?: Partial<AnalysisResult> | null): boolean {
  return matchesTwoSourceRlSuperposition(a);
}

function buildText(g: TwoSourceGeneration) {
  const v = g.values;
  const s = g.sol;
  const isL = g.reactive === "L";
  const unit = g.target.unit;
  const sym = g.target.symbol;
  const symA = isL ? "i_A(t)" : "v_CA(t)";
  const symB = isL ? "i_B(t)" : "v_CB(t)";
  const elemName = isL ? `${fmt(v.X)}[H]의 인덕터에 흐르는 전류` : `${fmt(v.X)}[F]의 커패시터 양단 전압`;
  const T1 = piTex(s.T1);
  const e = expTex(s.tau);
  const eShift = expTex(s.tau, T1);
  const wTex = omegaArgTex(v.w);
  const ampB = rootCoefTex(s.q);
  // ★ t ≥ T₁ 구간의 계수는 **기호식으로** 적는다 — 십진수로 적으면 전역 분수 변환기가
  //   5.989 → 287/200 처럼 뭉갠다(CLAUDE.md 1-4-3, 실측).
  const ampATex = coefTex(s.ampA);   // 계수 1은 생략 ("1(1 − e^…)" 방지)
  const aAtT1Tex = `${ampATex}(1 − ${expConstTex(s.tau, s.T1)})`;

  const content =
    `그림 (가)는 2개의 전압원을 가지는 ${isL ? "RL" : "RC"} 회로이다. ` +
    `5단계로 제시한 〈회로 해석 절차〉에 따라 ${elemName} ${sym}[${unit}]를 구하고자 한다.`;

  const conditions = [
    `v₁(t)는 높이 ${v.V1}[V], 폭 ${T1}[s]의 펄스이고, v₂(t) = ${v.V2}sin(${wTex})[V]이다.`,
    "모든 소자는 이상적이며, t < 0에서 회로는 정지 상태(초기 에너지 0)이다.",
    "각 단계에서의 풀이 과정과 결과를 함께 기술한다.",
  ];

  const question = [
    "〈회로 해석 절차〉에 따라 각 단계의 풀이 과정과 결과를 기술하시오.",
    "",
    "[단계 1] 그림 (가)에서 두 전압원 v₁(t)와 v₂(t)를 **단위계단함수 u(t)** 를 이용하여 표현하시오.",
    "[단계 2] v₁(t)만 인가된 회로[그림 (나)]의 **점선 부분을 테브난 등가회로**로 변환하시오.",
    `[단계 3] 그림 (나)의 점선 부분을 [단계 2]의 테브난 등가회로로 대체한 다음, **중첩의 원리**를 이용하여 ${symA}를 구하시오.`,
    `[단계 4] v₂(t)만 인가된 회로[그림 (다)]의 점선 부분이 **합성저항 R_eq**로 대체된 등가회로에 대하여 ${symB}를 구하시오.`,
    `[단계 5] [단계 3]과 [단계 4]의 결과로부터 ${sym}를 구하시오.`,
  ].join("\n");

  const answer = [
    `[단계 1] v₁(t) = ${v.V1}[u(t) − u(t − ${T1})][V], v₂(t) = ${v.V2}sin(${wTex})·u(t)[V]`,
    "",
    `[단계 2] V_th = ${ratTex(s.k)}·v₁(t) (= v₁(t)·${v.R3}/(${v.R1}+${v.R2}+${v.R3})), R_th = ${v.R3}∥(${v.R1}+${v.R2}) = ${fmt(s.Rth)}[Ω]`,
    "",
    `[단계 3] τ = ${fmt(s.tau)}[s], 최종값 ${ratTex(s.ampA)}[${unit}]`,
    `  · 0 ≤ t < ${T1} : ${symA} = ${ampATex}(1 − ${e})`,
    `  · t ≥ ${T1} : ${symA} = ${aAtT1Tex}·${eShift}`,
    "",
    `[단계 4] R_eq = ${fmt(s.Rth)}[Ω], ${isL ? `ωL = ${fmt(v.w * v.X)}[Ω] = R_eq` : "ωR_eq·C = 1"} → 위상 φ = π/4`,
    `  · ${symB} = −${fmt(s.q)}${e} − ${ampB}·sin(${wTex} − π/4)`,
    "",
    `[단계 5] ${sym} = ${symA} + ${symB}`,
    `  · 0 ≤ t < ${T1} : ${sym} = ${ampATex}(1 − ${e}) − ${coefTex(s.q)}${e} − ${ampB}sin(${wTex} − π/4)`,
    `  · t ≥ ${T1} : ${sym} = ${aAtT1Tex}·${eShift} − ${coefTex(s.q)}${e} − ${ampB}sin(${wTex} − π/4)`,
  ].join("\n");

  const kvl = isL
    ? `${fmt(v.X)}·d${sym.replace("(t)", "")}/dt + ${fmt(s.Rth)}·${sym.replace("(t)", "")} = V_th − v₂(t)`
    : `${fmt(s.Rth)}·${fmt(v.X)}·dv_C/dt + v_C = V_th − v₂(t)`;

  const solution = [
    `[단계 1] v₁(t)는 t = 0에서 ${v.V1}[V]로 올라갔다가 t = ${T1}에서 0으로 내려가는 펄스이므로 ` +
      `두 계단함수의 차 v₁(t) = ${v.V1}[u(t) − u(t − ${T1})]로 쓴다. v₂(t)는 t = 0부터 인가되는 정현파이므로 ` +
      `v₂(t) = ${v.V2}sin(${wTex})·u(t)이다.`,
    "",
    `[단계 2] 점선 부분을 단자 M-N에서 보면, 개방전압은 ${v.R1}+${v.R2}와 ${v.R3}의 분압이므로 ` +
      `V_th = v₁(t)·${v.R3}/(${v.R1}+${v.R2}+${v.R3}) = ${ratTex(s.k)}v₁(t)이고, 전압원을 단락하고 본 저항은 ` +
      `R_th = ${v.R3}∥(${v.R1}+${v.R2}) = ${fmt(s.Rth)}[Ω]이다.`,
    "",
    `[단계 3] ★ v₂의 **+ 단자가 ${isL ? "인덕터" : "커패시터"} 쪽**을 향하므로 루프 방정식은 ${kvl} 이다.`,
    `v₁만 인가하면(v₂ = 0) 시정수 τ = ${isL ? "L/R_th" : "R_eq·C"} = ${fmt(s.tau)}[s]이고 최종값은 ${ratTex(s.ampA)}[${unit}]이다.`,
    `0 ≤ t < ${T1}에서는 0에서 출발해 지수적으로 증가하고, t = ${T1}에 전원이 사라지면 그 시점 값 ${aAtT1Tex}[${unit}]에서 지수 감쇠한다.`,
    "",
    `[단계 4] v₂만 인가하면 점선 부분은 v₁을 단락한 합성저항 R_eq = ${fmt(s.Rth)}[Ω]이 된다.`,
    `ω·τ = 1이 되도록 소자가 정해져 있어 위상은 정확히 φ = π/4이고 정상상태 진폭은 ${ampB}[${unit}]이다.`,
    `초기값이 0이므로 같은 시정수의 과도항이 더해져 ${symB} = −${fmt(s.q)}${e} − ${ampB}sin(${wTex} − π/4)가 된다.`,
    `(부호가 −인 것은 [단계 3]에서 확인한 v₂의 극성 때문이다.)`,
    "",
    `[단계 5] 회로가 선형이므로 중첩의 원리로 두 성분을 더하면 ${sym} = ${symA} + ${symB}이다.`,
    `펄스가 살아 있는 구간과 사라진 구간을 나누어 쓰면 위 정답과 같다.`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}

export async function runTwoSourceRlSuperpositionPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateTwoSourceRlSuperposition({ seed, index: i, mode });
    log.info("two_source_rl_superposition_generated", {
      mode, reactive: gen.reactive, values: gen.values, Rth: gen.sol.Rth, tau: gen.sol.tau,
    });
    const text = buildText(gen);
    const isL = gen.reactive === "L";

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_full_${i + 1}`,
        label: `(가) 2개의 전압원을 가지는 ${isL ? "RL" : "RC"} 회로`,
        role: "main_circuit",
        diagramType: "two_source_rl_superposition_circuit",
        diagram: gen.figures.full,
      },
      {
        id: `fig_v1_${i + 1}`,
        label: "(나) v₁(t)만 인가된 회로 (점선 부분을 테브난 등가로 변환)",
        role: "equivalent_circuit",
        diagramType: "two_source_rl_superposition_circuit",
        diagram: gen.figures.v1Only,
      },
      {
        id: `fig_v2_${i + 1}`,
        label: "(다) v₂(t)만 인가된 회로 (점선 부분을 합성저항 R_eq로 대체)",
        role: "equivalent_circuit",
        diagramType: "two_source_rl_superposition_circuit",
        diagram: gen.figures.v2Only,
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
