import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  fmt,
  generateSwitchedRlDualShort,
  matchesSwitchedRlDualShort,
  type SwitchedRlDualShortGeneration,
} from "@/lib/generation/topologies/switchedRlDualShort";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runSwitchedRlDualShortPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다(복제 금지). */
export function detectSwitchedRlDualShort(analysis?: Partial<AnalysisResult> | null): boolean {
  return matchesSwitchedRlDualShort(analysis);
}

/** 지수 표기 — 시정수가 1이면 e^(−t), 아니면 e^(−t/τ)를 정수 계수로 정리한다. */
function expTex(tau: number): string {
  if (Math.abs(tau - 1) < 1e-9) return "e^{-t}";
  const inv = 1 / tau;
  if (Math.abs(inv - Math.round(inv)) < 1e-9) return `e^{-${Math.round(inv)}t}`;
  return `e^{-t/${fmt(tau)}}`;
}

function buildText(g: SwitchedRlDualShortGeneration) {
  const v = g.values;
  const s = g.sol;
  const exp = expTex(s.tau);
  const amp = s.i0 - s.iInf;                 // i(t) = i∞ + (i0 − i∞)e^(−t/τ)
  const iTex = `i(t) = ${fmt(s.iInf)} ${amp < 0 ? "−" : "+"} ${fmt(Math.abs(amp))}${exp}`;
  const vTex = `v(t) = ${fmt(s.v0)}${exp}`;

  const content = [
    "그림은 두 개의 스위치 SW₁과 SW₂가 오랜 시간 동안 개방 상태를 유지한 후",
    `t = 0에서 **동시에 닫히는** RL 회로이다. SW₁은 저항 ${v.Rb}[Ω]과, SW₂는 인덕터 ${v.L1}[H]와 각각 병렬로 연결되어 있다.`,
  ].join(" ");

  const conditions = [
    "모든 소자는 이상적인 조건으로 동작한다.",
    "t < 0에서 회로는 충분히 오랜 시간이 지나 직류 정상상태에 있다.",
    g.target === "current"
      ? `${v.L2}[H] 인덕터에 흐르는 전류를 i(t)라 하고, 방향은 그림의 화살표를 양(+)으로 한다.`
      : `${v.L2}[H] 인덕터 양단 전압을 v(t)라 하고, 극성은 그림의 +/−를 따른다.`,
  ];

  const askLine = g.target === "current"
    ? "[단계 3] [단계 1]·[단계 2]의 결과를 1차 과도응답 일반식에 대입하여 **i(t)** 를 t의 식으로 나타내시오."
    : "[단계 3] [단계 1]·[단계 2]의 결과로부터 인덕터 양단 전압 **v(t)** 를 t의 식으로 나타내시오.";

  const question = [
    "〈해석 절차〉에 따라 다음을 구하시오.",
    "",
    `[단계 1] t < 0의 직류 정상상태에서 각 인덕터를 어떻게 취급하는지 밝히고, ${v.L2}[H] 인덕터의 **초기 전류 i(0⁻)** 를 구하시오.`,
    "[단계 2] t > 0에서 두 스위치가 닫힌 뒤의 **등가회로**를 설명하고, 인덕터에서 본 **등가저항 R_eq**·**시정수 τ**·**최종값 i(∞)** 를 구하시오.",
    askLine,
  ].join("\n");

  const answer = [
    `[단계 1] 정상상태에서 인덕터는 단락이다. ${v.L2}[H]가 마디 B를 접지에 단락하므로 그 마디 전압은 0이고, ` +
      `${v.L1}[H]·${v.Rc}[Ω] 가지에는 전류가 흐르지 않는다. 전류원 ${v.Is}[A]가 ${v.Ra}[Ω]과 ${v.Rb}[Ω]으로 나뉘어 ` +
      `**i(0⁻) = ${fmt(s.i0)}[A]**`,
    "",
    `[단계 2] SW₁이 ${v.Rb}[Ω]을, SW₂가 ${v.L1}[H]를 각각 단락시켜 세 마디가 하나가 된다. ` +
      `남는 회로는 전류원 ∥ ${v.Ra}[Ω] ∥ ${v.Rc}[Ω] ∥ ${v.L2}[H]이므로 ` +
      `**R_eq = ${v.Ra}∥${v.Rc} = ${fmt(s.Req)}[Ω]**, **τ = L/R_eq = ${fmt(s.tau)}[s]**, **i(∞) = ${fmt(s.iInf)}[A]**`,
    "",
    g.target === "current"
      ? `[단계 3] **${iTex} [A]**`
      : `[단계 3] **${vTex} [V]**`,
  ].join("\n");

  const solution = [
    `[단계 1] 직류 정상상태에서 인덕터는 단락으로 본다. ${v.L2}[H]가 마디 B와 접지를 단락하므로 V_B = 0이고, ` +
      `그 결과 ${v.L1}[H]를 지나 ${v.Rc}[Ω]으로 가는 가지의 전압도 0이라 전류가 흐르지 않는다.`,
    `전류원 ${v.Is}[A]는 ${v.Ra}[Ω](세로)과 ${v.Rb}[Ω](가로)으로만 나뉘므로 전류분배로`,
    `i(0⁻) = ${v.Is} × ${v.Ra}/(${v.Ra} + ${v.Rb}) = ${fmt(s.i0)}[A].`,
    "",
    `[단계 2] t = 0에 SW₁이 닫히면 ${v.Rb}[Ω]이, SW₂가 닫히면 ${v.L1}[H]가 각각 단락된다.`,
    `따라서 세 마디가 하나로 묶여 전류원이 ${v.Ra}[Ω] ∥ ${v.Rc}[Ω] ∥ ${v.L2}[H]를 구동하는 1차 회로가 된다.`,
    `R_eq = (${v.Ra} × ${v.Rc})/(${v.Ra} + ${v.Rc}) = ${fmt(s.Req)}[Ω], τ = L/R_eq = ${v.L2}/${fmt(s.Req)} = ${fmt(s.tau)}[s].`,
    `t → ∞에서 인덕터가 다시 단락이 되어 전원 전류를 모두 받으므로 i(∞) = ${fmt(s.iInf)}[A].`,
    `★ ${v.L1}[H]는 t < 0에 전류가 0이고 t > 0에는 SW₂에 단락되므로 **답에 관여하지 않는다**(주어진 distractor).`,
    "",
    g.target === "current"
      ? `[단계 3] i(t) = i(∞) + [i(0⁻) − i(∞)]e^{-t/τ} = ${fmt(s.iInf)} ${amp < 0 ? "−" : "+"} ${fmt(Math.abs(amp))}${exp} [A].`
      : `[단계 3] v(t) = L·di/dt이고 i(t) = ${fmt(s.iInf)} ${amp < 0 ? "−" : "+"} ${fmt(Math.abs(amp))}${exp}이므로 ` +
        `v(t) = R_eq·[i(∞) − i(0⁻)]·${exp} = ${fmt(s.v0)}${exp} [V]. (t → ∞에서 0으로 감쇠한다.)`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}

export async function runSwitchedRlDualShortPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateSwitchedRlDualShort({ seed, index: i, mode });
    log.info("switched_rl_dual_short_generated", {
      mode,
      target: gen.target,
      values: gen.values,
      i0: gen.sol.i0,
      tau: gen.sol.tau,
    });

    const text = buildText(gen);

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_circuit_${i + 1}`,
        label: "그림. 두 스위치가 t = 0에 동시에 닫히는 RL 회로",
        role: "main_circuit",
        diagramType: "switched_rl_dual_short_circuit",
        diagram: gen.circuitDiagram,
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
