import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateSwitchedRcDcTransient } from "@/lib/generation/topologies/switchedRcDcTransient";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runSwitchedRcDcTransientPipeline");

/**
 * t=0 스위치 개방 RC (임용 2번) — 결정론 파이프라인. GPT 없음.
 *  [1] t<0 DC정상상태 v_c(0⁻), [2] t≥0 방전 v_o(t)=v_c(0⁻)·e^(−t/τ).
 */
export async function runSwitchedRcDcTransientPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateSwitchedRcDcTransient({ seed, mode });
    const v = gen.values, a = gen.answer;
    const isRL = gen.kind === "RL";
    const reactUnit = isRL ? "H" : "F";
    const reactName = isRL ? "인덕터" : "커패시터";
    log.info("switched_rc_dc_generated", { kind: gen.kind, ...v, init0: a.init0, tau: a.tau });

    const content = [
      `그림은 t=0에서 스위치가 개방되는 R${isRL ? "L" : "C"} 회로이다.`,
      `t<0에서 ${isRL ? "인덕터 전류" : "커패시터 전압"}의 초깃값 ${a.initSym}[${a.initUnit}]와 t≥0에서 전압 v_o(t)[V]를 구하여 순서대로 쓰시오.`,
      "(단, t<0일 때 회로는 직류 정상 상태로 가정한다.)",
    ].join(" ");

    const conditions = [
      `좌측: 전압원 ${v.Vs}V(직렬 ${v.Rs}Ω) ∥ 전류원 ${v.Is}A.  ─[스위치 t=0]─  우측: ${v.react}${reactUnit} ${reactName}(${gen.circuitDiagram.reactMeasLabel}) ∥ ${v.Rload}Ω(v_o).`,
      `t<0: 스위치 닫힘, 직류 정상상태. t≥0: 스위치 개방으로 좌측 분리 → ${reactName}가 ${v.Rload}Ω로 방전.`,
    ];

    const question = [
      `[단계 1] t<0(직류 정상상태)에서 ${isRL ? "인덕터 전류" : "커패시터 전압"}의 초깃값 ${a.initSym}[${a.initUnit}]를 구한다.`,
      `[단계 2] t≥0에서 전압 v_o(t)[V]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ${a.initSym} = ${a.init0} ${a.initUnit}`,
      `[단계 2] v_o(t) = ${a.voCoeff}·e^(−t/${a.tau}) V  (t≥0),  τ = ${a.tau} s`,
    ].join("\n");

    const solution = isRL
      ? [
          `[단계 1] t<0 직류 정상상태 → 인덕터 단락. 노드가 0V가 되어 전원이 주는 전체 전류가 L로 흐른다: i_L(0⁻) = ${v.Vs}/${v.Rs} + ${v.Is} = ${a.init0}A.`,
          `[단계 2] t=0 스위치 개방 → 좌측 전원 분리, L이 ${v.Rload}Ω로 방전. τ = L/R = ${v.react}/${v.Rload} = ${a.tau}s.`,
          `  i_L(0⁺)=i_L(0⁻)=${a.init0}A(연속). v_o = R·i_L ⟹ v_o(t) = ${a.voCoeff}·e^(−t/${a.tau}) V (t≥0).`,
        ].join("\n")
      : [
          `[단계 1] t<0 직류 정상상태 → 커패시터 개방. 노드 전압 = (${v.Vs}/${v.Rs} + ${v.Is}) / (1/${v.Rs} + 1/${v.Rload}) = ${a.init0}V.  ∴ v_c(0⁻) = ${a.init0}V.`,
          `[단계 2] t=0 스위치 개방 → 좌측 전원 분리, C가 ${v.Rload}Ω로 방전. τ = R·C = ${v.Rload}×${v.react} = ${a.tau}s.`,
          `  v_c(0⁺)=v_c(0⁻)=${a.init0}V(연속), C∥R이라 v_o=v_c. ⟹ v_o(t) = ${a.voCoeff}·e^(−t/${a.tau}) V (t≥0).`,
        ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_swrc_${i + 1}`,
        label: `(가) t=0 스위치 개방 R${isRL ? "L" : "C"} 회로`,
        role: "original_circuit",
        diagramType: "switched_rc_dc_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
