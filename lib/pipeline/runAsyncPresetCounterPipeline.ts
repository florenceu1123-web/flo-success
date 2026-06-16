import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateAsyncPresetCounter } from "@/lib/generation/topologies/asyncPresetCounter";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAsyncPresetCounterPipeline");

/**
 * 비동기 SET/RESET D-FF 응용회로 (NOR 자동재적재 리플 다운카운터) — 결정론 파이프라인.
 *  GPT 호출 없음 (구조·풀이 모두 결정론 generator에서 도출).
 */
export async function runAsyncPresetCounterPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAsyncPresetCounter({ seed, mode });
    log.info("async_preset_counter_generated", {
      I: gen.iStr,
      N: gen.nValue,
      initial: gen.initialStr,
      seq: gen.sequenceStr.join(","),
      clk: gen.clockCount,
      reload: gen.hasReload,
    });

    const qOrder = gen.circuitDiagram.qLabels.join(""); // "Q₀Q₁Q₂"
    const iOrder = gen.circuitDiagram.iLabels.join(""); // "I₀I₁I₂"

    const content = [
      "그림 (가)는 비동기식 SET와 RESET를 갖는 D 플립플롭을 이용한 응용회로를 나타낸 것이다.",
      `그림 (가)에서 ${iOrder} = ${gen.iStr}일 때 제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오.`,
      `(단, 모든 소자는 이상적으로 동작하고, 플립플롭의 초깃값은 ${qOrder.split("").join("")} = ${"0".repeat(gen.bitCount)}이다. 우측 게이트의 출력 F는 ${gen.circuitDiagram.qLabels.join("·")}와 CLK가 모두 0일 때만 1이다.)`,
    ].join(" ");

    const conditions = [
      `비동기 SET·RESET을 갖는 D 플립플롭 ${gen.bitCount}개 (출력 ${gen.circuitDiagram.qLabels.join("·")}).`,
      `각 플립플롭: Set_k = F·${gen.circuitDiagram.iLabels[0].replace(/[₀₁₂]/, "k")}, Reset_k = F·${gen.circuitDiagram.iLabels[0].replace(/[₀₁₂]/, "k")}′ (인버터 + AND).`,
      `우측 NOR: F = (${[...gen.circuitDiagram.qLabels, "CLK"].join(" + ")})′ — 모든 출력·CLK가 0이면 F=1로 ${iOrder} 비동기 적재.`,
      `평상시(F=0): D_k = Q̄_k (T 동작), 리플 클럭 CLK→FF0·Q₀→FF1·Q₁→FF2.`,
      `입력 ${iOrder} = ${gen.iStr} (고정).`,
    ];

    const question = [
      `[단계 1] 그림 (나)의 구간 ㉠에서 ${gen.circuitDiagram.qLabels.join(", ")}의 값을 각각 구한다.`,
      `[단계 2] 구간 ㉡에서 ${gen.circuitDiagram.qLabels.join(", ")}의 출력신호를 각각 도시한다.`,
    ].join("\n");

    const seqLines = gen.sequenceStr
      .map((s, idx) => `클럭 ${idx + 1}↑: ${qOrder} = ${s}`)
      .join("\n    ");

    const answer = [
      `[단계 1] ㉠: ${gen.circuitDiagram.qLabels.map((q, k) => `${q}=${gen.iBits[k]}`).join(", ")}  (= ${iOrder} = ${gen.initialStr})`,
      `[단계 2] ㉡: ${gen.sequenceStr.join(", ")}  (${qOrder} 순서)`,
    ].join("\n");

    const reloadNote = gen.hasReload
      ? `\n  · ㉡ 도중 출력이 ${"0".repeat(gen.bitCount)}이 되면 F=1로 ${gen.iStr}이 자동 재적재된다(0 상태 건너뜀).`
      : "";

    const solution = [
      `[단계 1] 초기 ${qOrder} = ${"0".repeat(gen.bitCount)}, CLK=0 → F = (${[...gen.circuitDiagram.qLabels, "CLK"].join("+")})′ = 1.`,
      `  F=1이므로 각 셀의 비동기 입력이 활성: ${gen.circuitDiagram.iLabels.map((il, k) => `${il}=${gen.iBits[k]}→${gen.iBits[k] ? "Set" : "Reset"}`).join(", ")}.`,
      `  ⟹ ㉠: ${qOrder} = ${gen.initialStr} (= ${iOrder}).`,
      `[단계 2] 적재 후 출력이 0이 아니므로 F=0 → 비동기 입력 비활성, 평상 동작.`,
      `  D_k=Q̄_k(T 동작) + 리플 클럭: Q₀는 CLK 상승마다, Q₁은 Q₀ 상승마다, Q₂는 Q₁ 상승마다 반전 → ${gen.iStr}(=${gen.nValue})에서 1씩 감소하는 리플 다운카운트.${reloadNote}`,
      `    ${seqLines}`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_apc_circuit_${i + 1}`,
        label: "(가) 비동기 SET/RESET D-FF 응용회로",
        role: "original_circuit",
        diagramType: "async_preset_counter_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_apc_waveform_${i + 1}`,
        label: "(나) 클럭 및 출력 파형 (㉠·㉡ 구간)",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveformDiagram,
      },
    ];

    return {
      id: randomUUID(),
      content,
      conditions,
      question,
      answer,
      solution,
      topicKey,
      figureVariants,
    };
  });
}
