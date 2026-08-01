import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateAcSuperpositionSourceDesign } from "@/lib/generation/topologies/acSuperpositionSourceDesign";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcSuperpositionSourceDesignPipeline");

/**
 * 2전원 페이저 회로 + 중첩 → **전원 크기 역산** (임용 5번 회로이론) 감지 — generate 단계 안전망.
 *
 * ★ 실측 신고: Vision이 "중첩"이라는 낱말도, "전류원 개방·전압원 단락" 절차도 요약에서 빠뜨리면
 *   (실측 요약: "커패시터 양단의 페이저 전압을 주어진 조건에 맞추기 위해 전압원과 전류원의 크기를
 *   구하는 문제") `detectAcSuperposition`이 미발화해 **universal_ac**로 떨어지고, 발문이
 *   "단계별로 회로를 분석하고 각 단계에서 요구하는 결과를 도출하시오"라는 빈 placeholder가 된다.
 *
 * 시그니처(표현 무관): AC 페이저 + 전압원 + 전류원 + 리액티브 + **목표 전압이 주어지고 전원 "크기"를 구함**.
 *   ★ 양보: 스위치·과도, 테브난·최대전력·공진·역률 문맥이면 형제 archetype 소관.
 */
export function detectAcSuperpositionSourceDesign(analysis?: AnalysisResult | null): boolean {
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
  const isAc = /교류|페이저|phasor|∠|정현파/.test(text);
  if (!(hasV && hasI && hasReactive && isAc)) return false;

  // ★ 이 유형의 결정적 신호 = 목표 전압을 만족하도록 **전원의 크기**를 구하는 역문제.
  const designAsk =
    /(전압원|전류원)[^.]{0,30}크기/.test(text) ||
    /크기[^.]{0,20}(구|산출|결정)/.test(text) ||
    /되도록|맞추기 위해|만족하도록|만족시키는/.test(text);
  const targetPhasor =
    /양단[^.]{0,20}(전압|페이저)|v_?c|커패시터 전압|인덕터 전압|목표 전압/.test(text);
  if (!(designAsk && targetPhasor)) return false;

  // 형제 archetype 양보 — 과도·스위치, 테브난/최대전력, 공진·역률·어드미턴스.
  if (countOf("SW") > 0 || /스위치|t\s*=\s*0|과도/.test(text)) return false;
  if (/테브난|thevenin|노턴|최대\s*전력|최대전력|공진|역률|어드미턴스|대역폭/.test(text)) return false;
  return true;
}

/**
 * 2전원 페이저 + 중첩의 원리 → 전원 크기 역산 (임용 5번 회로이론) — 결정론 파이프라인. GPT 없음.
 *  [1] 전류원 개방 → V_c1 = k₁·V_s, [2] 전압원 단락 → V_c2 = k₂·I_s, [3] 합 = 목표 → V_s·I_s.
 */
export async function runAcSuperpositionSourceDesignPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcSuperpositionSourceDesign({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("ac_superposition_source_design_generated", {
      mode, target: v.target, R1: v.R1, R2: v.R2, R3: v.R3, XL: v.XL, XC: v.XC,
      k1: a.k1, k2: a.k2, vTarget: a.vTarget, Vs: a.Vs, Is: a.Is,
    });

    // 페이저 표기 (a+jb → "−7 − j" / "3 + j2" — 계수 1은 생략, 원본 표기 관례)
    const neg = (x: number) => `${x < 0 ? "−" : ""}${Math.abs(x)}`;   // ASCII '-' 대신 원본 표기 '−'
    const ph = ([re, im]: [number, number]): string => {
      const mag = Math.abs(im) === 1 ? "" : `${Math.abs(im)}`;
      if (im === 0) return neg(re);
      if (re === 0) return `${im > 0 ? "" : "−"}j${mag}`;             // "0 − j15" 대신 "−j15"
      return `${neg(re)} ${im > 0 ? "+" : "−"} j${mag}`;
    };
    const coef = ([re, im]: [number, number], sym: string): string => `(${ph([re, im])})·${sym}`;

    const tgt = v.target === "capacitor" ? "V_c" : "V_L";
    const tgtDev = v.target === "capacitor" ? `커패시터(−j${v.XC}[Ω])` : `인덕터(j${v.XL}[Ω])`;
    const targetStr = ph(a.vTarget);

    const content = [
      "그림은 2개의 교류 전원이 포함된 RLC 회로를 페이저로 표현한 것이다.",
      `${tgtDev} 양단 페이저 전압 ${tgt} = ${targetStr}[V]가 되도록 전압원의 크기 V_s와 전류원의 크기 I_s를`,
      "제시된 〈해석 절차〉에 따라 단계별로 구하여 서술하시오.",
    ].join(" ");

    const conditions = [
      `상단: 전압원 쪽 R₁ = ${v.R1}[Ω], 전류원 쪽 R₂ = ${v.R2}[Ω].`,
      `가운데 가지(마디 A → 접지): R₃ = ${v.R3}[Ω], 인덕터 j${v.XL}[Ω], 커패시터 −j${v.XC}[Ω] 직렬.`,
      `전원: 전압원 V_s∠0°[V](좌측), 전류원 I_s∠−90°[A](우측). 회로는 정상상태이며 모든 소자는 이상적이다.`,
      `${tgt}는 ${tgtDev} 양단 페이저 전압이다.`,
    ];

    const question = [
      `[단계 1] 전류원을 개방한 후, ${tgtDev} 양단 페이저 전압 ${tgt}₁[V]를 V_s가 포함된 식으로 구한다.`,
      `[단계 2] 전압원을 단락한 후, ${tgtDev} 양단 페이저 전압 ${tgt}₂[V]를 I_s가 포함된 식으로 구한다.`,
      `[단계 3] [단계 1]과 [단계 2]의 결과를 이용하여, ${tgt} = ${targetStr}[V]가 되도록 전압원의 크기 V_s[V]와 전류원의 크기 I_s[A]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ${tgt}₁ = ${coef(a.k1, "V_s")} [V]`,
      `[단계 2] ${tgt}₂ = ${coef(a.k2, "I_s")} [V]`,
      `[단계 3] V_s = ${a.Vs} V, I_s = ${a.Is} A`,
    ].join("\n");

    const Zmid = `${v.R3} + j${v.XL} − j${v.XC}`;
    const solution = [
      `[단계 1] 전류원을 개방하면 R₂ 가지에 전류가 흐르지 않으므로, 회로는 V_s → R₁ → 가운데 가지(${Zmid}) → 접지의 단일 루프이다. ` +
        `전류 I₁ = V_s/(R₁ + Z_mid)이고, ${tgt}₁ = I₁ · Z_${v.target === "capacitor" ? "C" : "L"} = ${coef(a.k1, "V_s")} [V].`,
      `[단계 2] 전압원을 단락하면 R₁의 한쪽 끝이 접지된다. 전류원 I_s∠−90°(= −jI_s)는 R₂를 지나 마디 A에서 R₁과 가운데 가지로 분류되므로, ` +
        `가운데 가지 전류 = −jI_s·R₁/(R₁ + Z_mid) → ${tgt}₂ = ${coef(a.k2, "I_s")} [V]. (R₂는 이상 전류원과 직렬이라 결과에 영향을 주지 않는다.)`,
      `[단계 3] 중첩의 원리로 ${tgt} = ${tgt}₁ + ${tgt}₂ = ${coef(a.k1, "V_s")} + ${coef(a.k2, "I_s")} = ${targetStr}. ` +
        `실수부와 허수부를 각각 같게 놓고 연립하면 **V_s = ${a.Vs} V, I_s = ${a.Is} A**.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_acsupdesign_${i + 1}`,
        label: "2전원 페이저 RLC 회로 (V_s∠0°·I_s∠−90°)",
        role: "original_circuit",
        diagramType: "ac_superposition_source_design_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
