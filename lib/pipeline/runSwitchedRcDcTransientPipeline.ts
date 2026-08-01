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
 * t=0 스위치 개방 RC (임용 2번) 재검출 — generate 단계 안전망.
 *
 * ★ 프론트(app/page.tsx)가 analysis를 React state에 담아 "생성"마다 재사용하므로,
 *   분류기가 정상이어도 이전에 만들어진 stale circuitType(transient_rc·switched_rc 등)이
 *   그대로 넘어오면 generic 경로로 빠져 **C가 직렬로 그려지고 v_c(0⁻) 소문항이 사라진다**(실측 신고).
 *   circuitType과 무관하게 텍스트·inventory 시그니처로 판정해 route에서 교정한다.
 *   (jk_sync_counter·active_lowpass_filter 등과 동일한 패턴.)
 *
 * 시그니처: 스위치 + 순수 RC(C≥1·L 없음) + 전류원 + DC(교류 신호 없음)
 *           + v_c(0⁻)·v_o(t)·정상상태 키워드. 테브난·점선박스면 thevenin_switched_rc에 양보.
 */
export function detectSwitchedRcDcTransient(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const inv = analysis.componentInventory ?? [];
  const countOf = (t: string) => inv.filter((c) => (c.type ?? "").toUpperCase() === t).length;
  const hasSwitch = countOf("SW") > 0 || /스위치|switch|t\s*=\s*0/.test(text);
  const hasCap = countOf("C") > 0 || /커패시터|capacitor|축전기|v_c|콘덴서/.test(text);
  const hasInductor = countOf("L") > 0 || /인덕터|inductor|코일/.test(text);
  const hasCurrentSource = countOf("I") > 0 || /전류원/.test(text);
  // 교류면 이 유형이 아님(중첩·페이저 계열에 양보).
  const isAc = /교류|정현파|페이저|∠|cos\s*\(|sin\s*\(|위상/.test(text);
  // 테브난·점선박스 구조는 형제 archetype(thevenin_switched_rc) 소관.
  const isThevenin = /테브난|thevenin|등가\s*회로|점선/.test(text);
  const dcSteadyState =
    /정상\s*상태|직류\s*정상|v_c\(0|v_o\(t\)|초깃값|초기값|방전/.test(text);

  return hasSwitch && hasCap && !hasInductor && hasCurrentSource && !isAc && !isThevenin && dcSteadyState;
}

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
      `t<0에서 ${isRL ? "인덕터 전류" : "커패시터 전압"}의 초깃값 ${a.initSym}[${a.initUnit}]와 t≥0에서 ${isRL ? "전류" : "전압"} ${a.outSym}[${a.outUnit}]를 구하여 순서대로 쓰시오.`,
      "(단, t<0일 때 회로는 직류 정상 상태로 가정한다.)",
    ].join(" ");

    const conditions = [
      `좌측: 전압원 ${v.Vs}V(직렬 ${v.Rs}Ω) ∥ 전류원 ${v.Is}A.  ─[스위치 t=0]─  우측: ${v.react}${reactUnit} ${reactName}(${gen.circuitDiagram.reactMeasLabel}) ∥ ${v.Rload}Ω(${a.outSym}).`,
      `t<0: 스위치 닫힘, 직류 정상상태. t≥0: 스위치 개방으로 좌측 분리 → ${reactName}가 ${v.Rload}Ω로 방전.`,
    ];

    const question = [
      `[단계 1] t<0(직류 정상상태)에서 ${isRL ? "인덕터 전류" : "커패시터 전압"}의 초깃값 ${a.initSym}[${a.initUnit}]를 구한다.`,
      `[단계 2] t≥0에서 ${isRL ? "전류" : "전압"} ${a.outSym}[${a.outUnit}]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ${a.initSym} = ${a.init0} ${a.initUnit}`,
      `[단계 2] ${a.outSym} = ${a.outCoeff}·e^(−t/${a.tau}) ${a.outUnit}  (t≥0),  τ = ${a.tau} s`,
    ].join("\n");

    const solution = isRL
      ? [
          `[단계 1] t<0 직류 정상상태 → 인덕터 단락. 노드가 0V가 되어 전원이 주는 전체 전류가 L로 흐른다: i_L(0⁻) = ${v.Vs}/${v.Rs} + ${v.Is} = ${a.init0}A.`,
          `[단계 2] t=0 스위치 개방 → 좌측 전원 분리, L이 ${v.Rload}Ω로 방전(L∥R 루프). τ = L/R = ${v.react}/${v.Rload} = ${a.tau}s.`,
          `  i_L(0⁺)=i_L(0⁻)=${a.init0}A(연속). i_o=i_L(인덕터 전류가 R_load로) ⟹ i_o(t) = ${a.outCoeff}·e^(−t/${a.tau}) A (t≥0).`,
        ].join("\n")
      : [
          `[단계 1] t<0 직류 정상상태 → 커패시터 개방. 노드 전압 = (${v.Vs}/${v.Rs} + ${v.Is}) / (1/${v.Rs} + 1/${v.Rload}) = ${a.init0}V.  ∴ v_c(0⁻) = ${a.init0}V.`,
          `[단계 2] t=0 스위치 개방 → 좌측 전원 분리, C가 ${v.Rload}Ω로 방전. τ = R·C = ${v.Rload}×${v.react} = ${a.tau}s.`,
          `  v_c(0⁺)=v_c(0⁻)=${a.init0}V(연속), C∥R이라 v_o=v_c. ⟹ v_o(t) = ${a.outCoeff}·e^(−t/${a.tau}) V (t≥0).`,
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
