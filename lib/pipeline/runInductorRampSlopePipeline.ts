import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateInductorRampSlope } from "@/lib/generation/topologies/inductorRampSlope";
import { generateInParallel } from "./_common";
import type { AnalysisResult, FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runInductorRampSlopePipeline");

/**
 * i(t) 램프 파형 → 기울기로 L 도출 (임용 2번 회로이론) — 결정론 파이프라인. GPT 없음.
 *  [단계 1] 램프 구간 기울기로 L (또는 쌍대 C) 도출
 *  [단계 2] 포화 구간에서 v_L (또는 i_C) = 0
 */

/**
 * 재검출 — 분류·stale 방어.
 *  시그니처: 스위치(t=0) + 인덕터/커패시터 + **파형(그래프)이 주어짐** + 소자값 도출 요구,
 *           그리고 지수·시정수(τ) 문맥이 아님(그쪽은 generic switched_rl 소관).
 */
export function detectInductorRampSlope(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
  if (!text.trim()) return false;

  const inv = analysis.componentInventory ?? [];
  const countOf = (t: string) => inv.filter((c) => (c.type ?? "").toUpperCase() === t).length;
  const hasReactive = countOf("L") + countOf("C") > 0 || /인덕터|코일|커패시터|축전기/.test(text);
  const hasSwitch = countOf("SW") > 0 || /스위치|switch|t\s*=\s*0/.test(text);
  const waveGiven = /그림\s*\(나\)|파형|그래프|와 같다고 가정|와 같다|와 같이 주어|주어진 전류|주어진 전압/.test(text);
  // 소자값(인덕턴스·정전용량)을 구하라는 요구가 핵심 — generic 과도응답과의 결정적 차이.
  //   ★ Vision 요약이 "L[H]을 구한다"처럼 기호만 쓰는 경우도 인정(실측: 신고 케이스가 generic으로 샘).
  const asksElemValue =
    /인덕턴스|정전용량|커패시턴스/.test(text) ||
    /\bL\s*\[?\s*H\s*\]?/.test(text) ||
    /\bC\s*\[?\s*F\s*\]?/.test(text) ||
    /(인덕터|커패시터)의?\s*[LC]\b/.test(text);
  // 지수응답(τ) 문제면 양보.
  const exponential = /시정수|시상수|지수|e\^|τ|충전\s*곡선|방전\s*곡선/.test(text);
  // 2전원 SPDT(단자 A↔B) 형식이면 그쪽 archetype 소관.
  const dualSourceSw = /단자\s*a\s*↔?\s*b|단자\s*a에서\s*단자\s*b|spdt/i.test(text) || countOf("V") >= 2;

  return hasReactive && hasSwitch && waveGiven && asksElemValue && !exponential && !dualSourceSw;
}

export async function runInductorRampSlopePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const g = generateInductorRampSlope({
      mode: mode === "exam_variant" ? "exam_variant" : "exam_similar",
      index: i,
      seed,
    });
    const L = g.labels;
    const slope = g.sat / g.t1;
    log.info("inductor_ramp_generated", {
      element: g.element, value: g.elemValue, t1: g.t1, sat: g.sat, given: g.given, tq: g.tq,
    });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_ramp_circuit_${i + 1}`,
        label: "(가) 회로",
        role: "original_circuit",
        diagramType: "inductor_ramp_circuit",
        diagram: {
          element: g.element,
          elemLabel: `${L.elemSym}`,
          srcLabel: `${L.srcSym}`,
          rLabel: `R`,
          measureLabel: `${L.givenSym}(t)`,
          currentLabel: g.element === "L" ? "i(t)" : "i(t)",
        } as unknown as Record<string, unknown>,
      },
      {
        id: `fig_ramp_wave_${i + 1}`,
        label: `(나) ${L.yName} 파형`,
        role: "waveform",
        diagramType: "waveform",
        diagram: g.waveform as unknown as Record<string, unknown>,
      },
    ];

    const content =
      `그림 (가)는 직류 ${g.element === "L" ? "전압원" : "전류원"} ${L.srcSym}와 저항 및 ${L.elemKo}가 연결된 회로이고, ` +
      `그림 (나)는 스위치 SW가 닫힌 후 ${L.elemKo}에 ${g.element === "L" ? "흐르는 전류" : "걸리는 전압"} ${L.yName}를 나타낸 것이다. ` +
      `제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오.`;

    const question = [
      `[단계 1] 0 ≤ t ≤ ${g.t1}[s]에서 ${L.elemKo}의 ${L.givenSym}(t) = ${g.given}[${L.givenUnit}]일 때, ${L.elemKo}의 ${L.elemSym}[${L.elemUnit}]을 구한다.`,
      `[단계 2] t = ${g.tq}[s]일 때 ${L.givenSym}[${L.givenUnit}]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ${L.elemSym} = ${g.elemValue}[${L.elemUnit}]`,
      `[단계 2] ${L.givenSym} = 0[${L.givenUnit}]`,
    ].join("\n");

    const relation = g.element === "L" ? "v_L = L·(di/dt)" : "i_C = C·(dv/dt)";
    const solution = [
      `[단계 1] ${relation}. 그림 (나)에서 0 ≤ t ≤ ${g.t1}[s] 구간의 기울기는 ` +
        `${L.yName}의 변화량 ÷ 시간 = ${g.sat}/${g.t1} = ${round3(slope)}[${L.yUnit}/s]이다.`,
      `  따라서 ${L.elemSym} = ${L.givenSym} ÷ 기울기 = ${g.given} ÷ ${round3(slope)} = ${g.elemValue}[${L.elemUnit}].`,
      `[단계 2] t = ${g.tq}[s]는 ${L.yName}가 ${g.sat}[${L.yUnit}]로 일정한 구간이므로 기울기 = 0이다.`,
      `  ${relation}에서 ${L.givenSym} = ${L.elemSym}·0 = 0[${L.givenUnit}].` +
        (g.element === "L"
          ? ` (이때 전원 전압은 모두 저항에 걸린다: ${L.srcSym} = ${g.sat}·R.)`
          : ` (이때 전원 전류는 모두 저항으로 흐른다.)`),
    ].join("\n");

    return {
      id: randomUUID(),
      content,
      conditions: [
        `스위치 SW는 t = 0에서 닫힌다.`,
        `${L.elemKo}는 이상적이며, 그림 (나)의 ${L.yName}는 주어진 것으로 가정한다.`,
      ],
      question,
      answer,
      solution,
      topicKey,
      figureVariants,
    } satisfies GeneratedProblem;
  });
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
