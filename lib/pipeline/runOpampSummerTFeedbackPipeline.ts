import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampSummerTFeedback } from "@/lib/generation/topologies/opampSummerTFeedback";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampSummerTFeedbackPipeline");

/**
 * 반전 가산기(미지 저항) → T형 궤환 반전증폭기 → 부하 전류 I_L (임용 7번 전자회로).
 * 결정론 파이프라인 — GPT 없음.
 *   유사 = [1] R₁ · [3] I_L (원본) / 변형 = [1] R_f · [3] R_L (구하는 양 교환)
 */
export async function runOpampSummerTFeedbackPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampSummerTFeedback({ seed, mode });
    const v = gen.values, a = gen.answer;
    const variant = mode === "exam_variant";
    log.info("opamp_summer_tfeedback_generated", {
      mode, Va: v.Va, Ra: v.Ra, Vb: v.Vb, R1: v.R1, Rf: v.Rf, V1: v.V1, Vo: a.Vo, IL: a.IL, RL: v.RL,
    });

    const content =
      "그림은 연산증폭기 응용 회로를 나타낸 것이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 " +
      "함께 결과를 서술하시오. (단, 연산증폭기는 이상적으로 동작한다.)";

    const conditions = [
      `1단(반전 가산기): ${v.Va}[V] 전원이 ${v.Ra}[kΩ]을 거쳐, ${v.Vb}[V] 전원이 ` +
      `${variant ? `${v.R1}[kΩ]` : "R_1[kΩ]"}을 거쳐 반전 입력 마디에 연결되고, 궤환 저항은 ` +
      `${variant ? "R_f[kΩ]" : `${v.Rf}[kΩ]`}이며 비반전 입력은 접지이다. 출력은 V_1이다.`,
      `2단(T형 궤환 반전증폭기): V_1이 ${v.Rin}[kΩ]을 거쳐 반전 입력 마디에 연결되고, 궤환 경로는 ` +
      `반전 입력 마디 —${v.Rta}[kΩ]— 마디 T, 마디 T —${v.Rtb}[kΩ]— 접지, 마디 T —${v.Rtc}[kΩ]— 출력 단자 a 이다. ` +
      `비반전 입력은 접지이다.`,
      `단자 a(출력 V_o)와 접지 사이에 부하 저항 R_L이 연결되어 부하 전류 I_L이 흐른다.`,
    ];

    const question = [
      variant
        ? `[단계 1] V_1 = ${v.V1}[V]가 되기 위한 1단의 궤환 저항 R_f[kΩ]을 구한다.`
        : `[단계 1] V_1 = ${v.V1}[V]가 되기 위한 R_1[kΩ]을 구한다.`,
      `[단계 2] 점 a에서 V_1에 의한 V_o의 출력 전압식과 전압 값[V]을 각각 구한다.`,
      variant
        ? `[단계 3] 출력 부하 전류가 I_L = ${a.IL}[mA]가 되도록 하는 부하 저항 R_L[kΩ]을 구한다.`
        : `[단계 3] 부하 저항 R_L = ${v.RL}[kΩ]일 때 출력 부하 전류 I_L[mA]을 구한다.`,
    ].join("\n");

    const voExpr = `V_o = −(R_ta + R_tc + R_ta·R_tc/R_tb)/R_in · V_1 = −(${v.Rta} + ${v.Rtc} + ${v.Rta}×${v.Rtc}/${v.Rtb})/${v.Rin} · V_1 = ${fmt(-a.gain)}·V_1`;

    const answer = [
      variant
        ? `[단계 1] R_f = ${a.Rf} [kΩ]`
        : `[단계 1] R_1 = ${a.R1} [kΩ]`,
      `[단계 2] ${voExpr},  V_o = ${a.Vo} [V]`,
      variant
        ? `[단계 3] R_L = ${a.RL} [kΩ]`
        : `[단계 3] I_L = ${a.IL} [mA]`,
    ].join("\n");

    const solution = [
      `[단계 1] 1단은 반전 가산기이므로 반전 입력 마디가 가상 접지(0V)이고`,
      `  V_1 = −R_f(${v.Va}/${v.Ra} + ${v.Vb}/R_1) 이다.`,
      variant
        ? `  V_1 = ${v.V1}[V] 조건에서 R_f = −V_1/(${v.Va}/${v.Ra} + ${v.Vb}/${v.R1}) = ` +
          `${-v.V1}/${fmt(v.Va / v.Ra + v.Vb / v.R1)} = ${a.Rf} [kΩ].`
        : `  V_1 = ${v.V1}[V] 조건에서 ${v.Vb}/R_1 = ${fmt(-v.V1 / v.Rf)} − ${fmt(v.Va / v.Ra)} = ${fmt(-v.V1 / v.Rf - v.Va / v.Ra)} 이므로 ` +
          `R_1 = ${v.Vb}/${fmt(-v.V1 / v.Rf - v.Va / v.Ra)} = ${a.R1} [kΩ].`,
      `[단계 2] 2단은 궤환 경로가 T형이다. 가상 접지이므로 입력 전류는 I = V_1/${v.Rin} 이고 이 전류가 그대로 R_ta로 흐른다.`,
      `  마디 T의 전압은 V_T = −I·${v.Rta} 이고, 마디 T에서 KCL을 세우면 I = V_T/${v.Rtb} + (V_T − V_o)/${v.Rtc} 이다.`,
      `  두 식을 정리하면 등가 궤환 저항이 R_ta + R_tc + R_ta·R_tc/R_tb = ${v.Rta} + ${v.Rtc} + ${fmt((v.Rta * v.Rtc) / v.Rtb)} = ${a.Rfeq}[kΩ] 이므로`,
      `  ${voExpr} = ${fmt(-a.gain)}×(${v.V1}) = ${a.Vo} [V].`,
      variant
        ? `[단계 3] 부하 전류는 I_L = V_o/R_L 이므로 R_L = V_o/I_L = ${a.Vo}/${a.IL} = ${a.RL} [kΩ].`
        : `[단계 3] 이상적 연산증폭기의 출력 임피던스는 0이므로 부하 양단 전압이 곧 V_o이다.`,
      variant
        ? `  (이상적 연산증폭기의 출력 임피던스가 0이므로 부하 양단 전압이 곧 V_o이다.)`
        : `  I_L = V_o/R_L = ${a.Vo}/${v.RL} = ${a.IL} [mA]. (V[V] ÷ R[kΩ] = I[mA])`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_tfb_${i + 1}`,
        label: "연산증폭기 응용 회로 (반전 가산기 + T형 궤환)",
        role: "original_circuit",
        diagramType: "opamp_summer_tfeedback_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/** 소수 꼬리(2.5000000004) 방지 표기. */
function fmt(x: number): string {
  const r = Math.round(x * 1000) / 1000;
  return String(r);
}

/**
 * 반전 가산기 + T형 궤환 2단 OPAMP 감지 — 분류·route 안전망.
 *
 * ★ 실측: generic `opamp_cascade_voltage_divider`가 잡아 **전역 되먹임 전달함수(V_o/V_i)** 문제로
 *   변질됐다(T형 궤환망·미지 R₁·부하 전류가 전부 소실).
 * ★ 판별선 — 형제 OPAMP archetype에 없는 **부하 전류 I_L** + 중간 출력 V₁ + 미지 저항.
 *   (opamp_two_stage_rx=R_X 분압·three_stage_sum=R_f 가산·two_stage=V_P given은 모두 부하 전류가 없다.)
 */
export function detectOpampSummerTFeedback(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const inv = analysis.componentInventory ?? [];
  const up = (x: unknown) => String(x ?? "").toUpperCase();
  const opampCtx =
    /연산\s*증폭기|연산증폭기|op[- ]?amp|opamp/.test(text) || inv.some((c) => up(c.type) === "OPAMP");
  if (!opampCtx) return false;

  // ★ 부하 전류 I_L — 이 유형 고유 신호. 인벤토리의 R_L 표기도 인정한다.
  const loadCurrent =
    /부하\s*전류|i_?l\b|i_l|load\s*current/.test(text) ||
    inv.some((c) => /r_?l/i.test(String(c?.value ?? "")) || /r_?l/i.test(String(c?.id ?? "")));
  if (!loadCurrent) return false;

  // 2단 구조 신호 — 중간 출력 V₁ · 미지 저항 · OPAMP 2개 중 **하나만** 있으면 인정한다.
  //   ★ 실측: Vision이 V_1을 한 번도 안 쓰고 "각 노드의 전압을 분석"으로만 요약한 회차가 있었다.
  const midOut = /v_?1\b|v₁|중간\s*출력|1단.*출력/.test(text);
  const unknownR = /r_?1\b|r₁|저항\s*(값)?\s*(을|를)?\s*(구|결정|계산)|되기\s*위한|미지의?\s*저항/.test(text);
  const twoOpamps = inv.filter((c) => up(c.type) === "OPAMP").length >= 2;
  if (!midOut && !unknownR && !twoOpamps) return false;

  // 형제 양보 — 발진기·필터·정전압/레귤레이터·블록도(개방루프 이득)는 각자 전용 archetype.
  if (/발진|oscillat|슈미트|삼각파|구형파/.test(text)) return false;
  if (/저역|고역|대역폭|차단\s*주파수|필터/.test(text)) return false;
  if (/제너|정전압|레귤레이터/.test(text)) return false;
  if (/개방\s*루프|개루프|블록도|전달\s*함수|주파수\s*응답/.test(text)) return false;
  return true;
}
