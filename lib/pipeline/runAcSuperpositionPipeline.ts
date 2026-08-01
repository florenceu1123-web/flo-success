import { createLogger } from "@/lib/logger";
import { generateAcSuperposition } from "@/lib/generation/topologies/acSuperposition";
import { writeAcSuperpositionText } from "@/lib/generation/topologies/acSuperpositionTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcSuperpositionPipeline");

/**
 * AC 중첩(임용 10번) 재검출 — generate 단계 안전망.
 *
 * ★ 프론트가 analysis를 React state에 캐시하므로, 분류기를 고쳐도 **수정 이전 분석**
 *   (circuitType=universal_ac 등)이 그대로 넘어오면 generic 경로로 빠져
 *   "공진 주파수·최대 전력 전달" 같은 전혀 다른 문제가 생성된다(실측 신고).
 *   circuitType과 무관하게 텍스트·inventory 시그니처로 판정해 route에서 교정한다.
 *
 * 시그니처: 교류(페이저) + **전압원과 전류원 둘 다** + 중첩(단어 또는 절차: 전원 하나씩 개방·단락).
 *   ★ 스위치가 있으면 과도응답 계열이므로 양보한다.
 */
export function detectAcSuperposition(analysis?: AnalysisResult | null): boolean {
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
  const hasV = countOf("V") > 0 || /전압원/.test(text);
  const hasI = countOf("I") > 0 || /전류원/.test(text);
  const hasReactive = countOf("L") + countOf("C") > 0 || /[+-]?j\s*\d|인덕터|커패시터|코일|리액턴스/.test(text);
  const isAc = /교류|페이저|phasor|∠|정현파|cos\s*\(|sin\s*\(/.test(text);
  const hasSwitch = countOf("SW") > 0 || /스위치|switch|t\s*=\s*0/.test(text);
  // 중첩 — 단어 또는 절차(전원을 하나씩 죽여 각각 구함).
  const superposition =
    /중첩/.test(text) || /superposition/.test(text) ||
    (/전류원[^.]{0,15}(개방|open)/.test(text) && /전압원[^.]{0,15}(단락|short)/.test(text));

  return hasV && hasI && hasReactive && isAc && superposition && !hasSwitch;
}

export async function runAcSuperpositionPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcSuperposition({ params: analysis?.circuitType?.params, seed });
    log.info("ac_superposition_generated", {
      Vs: gen.values.Vs.label,
      Is: gen.values.Is.label,
      L1: gen.values.L1.label,
      C1: gen.values.C1.label,
      R: [gen.values.R1, gen.values.R2, gen.values.R3],
    });
    const gptText = await writeAcSuperpositionText({ generation: gen, mode, topicLabel, contextHint });
    // ★ 정답·풀이는 코드가 계산한 페이저 결과로 강제 (2026-07-26).
    //   이전엔 프롬프트 템플릿의 "정확한 수치는 풀이 참조" 문구가 그대로 정답으로 나가
    //   학생이 답을 확인할 수 없는 문제가 생성됐다(실측 신고).
    const { I1, I2, Itot, P } = gen.answer;
    const ph = (p: { mag: number; ang: number }) => `${p.mag}∠${p.ang}°`;
    const text = {
      ...gptText,
      // 발문도 고정 — GPT 템플릿이 [단계 3]을 "R1 내부 전력"으로 쓰는 바람에 정답(점선 가지 전력)과
      // 어긋났다. 원본과 같은 3단계로 강제한다.
      question: [
        "[단계 1] 전류원 I_s를 개방하였을 때, 마디 a에서 b로 흐르는 전류[A]를 구하시오.",
        "[단계 2] 전압원 V_s를 단락시켰을 때, 마디 a에서 b로 흐르는 전류[A]를 구하시오.",
        "[단계 3] [단계 1]과 [단계 2]를 이용하여 마디 a에서 b로 흐르는 전체 전류[A]와 점선 내부에 전달되는 전력[W]을 각각 구하시오.",
      ].join("\n"),
      answer: [
        `[단계 1] I_s 개방 → I_ab = ${ph(I1)} A`,
        `[단계 2] V_s 단락 → I_ab = ${ph(I2)} A`,
        `[단계 3] 전체 I_ab = ${ph(Itot)} A, 점선 내부(R₃+C₁) 전달 평균전력 P = ${P} W`,
      ].join("\n"),
      solution: [
        `[단계 1] 전류원을 개방하면 R₂ 가지에 전류가 흐르지 않는다. V_s가 (jX_L + R₁)와 a–b 가지(R₃ − jX_C)의 직렬을 구동:`,
        `  I_ab = V_s / [(j${gen.values.L1.impedance} + ${gen.values.R1}) + (${gen.values.R3} ${gen.values.C1.impedance < 0 ? "−" : "+"} j${Math.abs(gen.values.C1.impedance)})] = ${ph(I1)} A.`,
        `[단계 2] 전압원을 단락하면 (jX_L + R₁)가 마디 a에서 접지로 내려간다. I_s가 이 가지와 a–b 가지로 분류(전류 분배):`,
        `  I_ab = I_s · (j${gen.values.L1.impedance} + ${gen.values.R1}) / [(j${gen.values.L1.impedance} + ${gen.values.R1}) + (${gen.values.R3} ${gen.values.C1.impedance < 0 ? "−" : "+"} j${Math.abs(gen.values.C1.impedance)})] = ${ph(I2)} A.`,
        `[단계 3] 중첩: I_ab = ${ph(I1)} + ${ph(I2)} = ${ph(Itot)} A.`,
        `  점선 내부에서 전력을 소비하는 소자는 저항 R₃뿐이므로 P = ½·|I_ab|²·R₃ = ½·(${Itot.mag})²·${gen.values.R3} = ${P} W.`,
      ].join("\n"),
    };
    return assembleProblem({
      text,
      netlist: gen.netlist,
      figureLabel: "주어진 회로 (AC 다중 전원)",
      figureRole: "original_circuit",
      figureIdSuffix: i + 1,
      topicKey,
    });
  });
}
