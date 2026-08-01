import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateScrTurnOn } from "@/lib/generation/topologies/scrTurnOn";
import { generateInParallel } from "./_common";
import type { AnalysisResult, FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runScrTurnOnPipeline");

/**
 * SCR 턴온 회로 타이밍 파이프라인 (결정론, GPT 없음).
 *  (가) SCR 회로 + (나) V_G 파형 → 구간 ㉠·㉡의 I_A 도출. ★ 래칭이라 두 구간 I_A 동일.
 */
export async function runScrTurnOnPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i) => {
    const gen = generateScrTurnOn({ index: i, mode });
    log.info("scr_turn_on_generated", { V: gen.V, R: gen.R, vak: gen.vak, iA: gen.iA });

    const iaStr = `${gen.iA} A`;
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_circuit_${i + 1}`,
        label: "(가) SCR 턴온 회로",
        role: "main_circuit",
        diagramType: "scr_turn_on_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_vg_${i + 1}`,
        label: "(나) 게이트 전압 V_G 파형",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.vgWaveform,
      },
    ];

    const content = `그림 (가)는 실리콘 제어정류기(SCR)를 턴온(turn on)시키기 위한 회로이다. +${gen.V}V 전원에 ${gen.R}Ω 저항(전류 I_A)이 직렬로 연결되고, 그 아래에 SCR(애노드 A·게이트 G·캐소드 K)이 접지와 연결되어 있다. 게이트에는 전원 V_G가 ${gen.rGate >= 1000 ? gen.rGate / 1000 + "kΩ" : gen.rGate + "Ω"}을 거쳐 연결된다. 그림 (가)의 V_G가 그림 (나)와 같이 인가될 때(구간 ㉠: 0~${gen.t1}s에 ${gen.vGate}V, 구간 ㉡: ${gen.t1}~${gen.t2}s에 0V), 구간 ㉠과 구간 ㉡에서의 I_A [A]를 각각 구하시오.`;

    const conditions = [
      `SCR은 t=0에서 턴온되며, 유지전류 I_H = ${gen.iH}mA, V_AK = ${gen.vak}V로 가정한다.`,
      "상태값(전류)은 구간 ㉠, ㉡의 순서로 표시한다.",
    ];

    const question = `구간 ㉠과 구간 ㉡에서의 애노드 전류 I_A [A]를 각각 구하여 순서대로 쓰시오.`;

    const answer = `구간 ㉠: I_A = ${iaStr}, 구간 ㉡: I_A = ${iaStr} (두 구간이 같다 — SCR 래칭).`;

    const solution = `[구간 ㉠] 게이트 펄스(V_G=${gen.vGate}V)로 SCR이 t=0에 턴온된다. 턴온 후 V_AK=${gen.vak}V이므로, ${gen.R}Ω에 걸리는 전압은 ${gen.V}−${gen.vak}=${(gen.V - gen.vak).toFixed(2)}V. 따라서 I_A = (${gen.V}−${gen.vak})/${gen.R} = ${iaStr}.
[구간 ㉡] V_G가 0V가 되어 게이트 신호가 사라지지만, ★SCR은 래칭 소자★이므로 애노드 전류 I_A(=${iaStr})가 유지전류 I_H(=${gen.iH}mA)보다 크면 **게이트가 없어도 계속 ON**을 유지한다. I_A=${gen.iA}A = ${gen.iA * 1000}mA ≫ ${gen.iH}mA 이므로 SCR은 여전히 ON이고, I_A = (${gen.V}−${gen.vak})/${gen.R} = ${iaStr} (구간 ㉠과 동일).
∴ I_A(㉠) = I_A(㉡) = ${iaStr}. (게이트가 사라져도 SCR이 꺼지지 않는 것이 핵심.)`;

    return {
      id: randomUUID(),
      content,
      conditions,
      question,
      answer,
      solution,
      topicKey,
      figureVariants,
    } satisfies GeneratedProblem;
  });
}
