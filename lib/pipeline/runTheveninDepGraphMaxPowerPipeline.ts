import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateTheveninDepGraph,
  hasDependentInInventory,
  hasSymbolicResistor,
  independentCurrentSourceCount,
  matchesTdgAsk,
  matchesTdgSignature,
  qNum,
  qTex,
  yieldsTdgToSibling,
} from "@/lib/generation/topologies/theveninDepGraphMaxPower";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runTheveninDepGraphMaxPowerPipeline");

/**
 * 종속전원 저항회로 + V-I 그래프 → 미지 R → I_SC → 최대 전달 전력 (임용 9번 회로이론)
 * — 결정론 파이프라인. GPT 없음.
 *
 *  · exam_similar = 원본 — 그래프의 **y절편 V_TH 수치**가 주어지고 R·I_SC·P_L을 구한다.
 *  · exam_variant = **구하는 양 교환** — 그래프의 **x절편 I_SC 수치**가 주어지고 R·V_TH·P_L을 구한다.
 */
export async function runTheveninDepGraphMaxPowerPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  const m = mode === "exam_variant" ? "exam_variant" : "exam_similar";

  return generateInParallel(count, async (idx, seed) => {
    const gen = generateTheveninDepGraph({ seed, mode: m, index: idx });
    const v = gen.values, a = gen.answer;
    const S = v.Ra + v.k + v.Rb;
    const A = v.Ra + v.Rb;
    const givenVoc = gen.graphGiven === "voc";

    log.info("thevenin_dep_graph_generated", {
      mode: m, ...v, R: a.R, Vth: qTex(a.Vth), Isc: qTex(a.Isc), Rth: qTex(a.Rth), Pmax: qTex(a.Pmax),
    });

    const content =
      `그림 (가)는 전압원이 포함된 저항회로이고, 그림 (나)는 부하 저항 R_L의 값에 따른 ` +
      `전류계 Ⓐ와 전압계 Ⓥ의 값을 나타낸 것이다. ` +
      `제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오.`;

    const conditions = [
      `직류 전압원 ${v.Vs}[V], 직렬 저항 ${v.Ra}[Ω]·${v.Rb}[Ω], 단자 a쪽 직렬 저항 ${v.Rc}[Ω]`,
      `종속 전압원 ${v.k}i_x[V] (제어 전류 i_x는 저항 R을 위에서 아래로 흐른다)`,
      `저항 R은 미지 — 그림 (나)로부터 구한다`,
      givenVoc
        ? `그림 (나)의 V_RL 축 절편(I_RL = 0)은 ${qTex(a.Vth)}[V]이고, I_RL 축 절편은 I_SC로 표시되어 있다`
        : `그림 (나)의 I_RL 축 절편(V_RL = 0)은 ${qTex(a.Isc)}[A]이고, V_RL 축 절편은 V_TH로 표시되어 있다`,
      `단자 a-b에 부하 저항 R_L이 연결되어 있고, 연산에 쓰는 전류계·전압계는 이상적이다`,
    ];

    const question = givenVoc
      ? [
          `[단계 1] 그림 (가)의 단자 a-b의 좌측 점선 부분을 테브난 등가회로로 변환할 때, 테브난 전압 V_TH[V]를 저항 R의 함수로 제시하고 그림 (나)를 이용하여 저항 R[Ω]을 구한다.`,
          `[단계 2] [단계 1]을 이용하여 그림 (나)의 I_SC[A]를 구한다.`,
          `[단계 3] 부하 저항 R_L에 전력이 최대로 전달될 때의 부하 전력 P_L[W]을 구한다.`,
        ].join("\n")
      : [
          `[단계 1] 그림 (가)의 단자 a-b의 좌측 점선 부분을 테브난 등가회로로 변환할 때, 단락 전류 I_SC[A]를 저항 R의 함수로 제시하고 그림 (나)를 이용하여 저항 R[Ω]을 구한다.`,
          `[단계 2] [단계 1]을 이용하여 그림 (나)의 V_TH[V]를 구한다.`,
          `[단계 3] 부하 저항 R_L에 전력이 최대로 전달될 때의 부하 전력 P_L[W]을 구한다.`,
        ].join("\n");

    const answer = givenVoc
      ? [
          `[단계 1] V_TH = ${v.Vs}R/(${S} + R)[V],  R = ${a.R}[Ω]`,
          `[단계 2] I_SC = ${qTex(a.Isc)}[A]`,
          `[단계 3] R_L = R_TH = ${qTex(a.Rth)}[Ω]일 때 P_L = ${qTex(a.Pmax)}[W]`,
        ].join("\n")
      : [
          // I_SC = V_s·R / [ (R_a+R_b+k)·R_c + (R_a+R_b+R_c)·R ]  (단락 KVL·KCL을 R에 대해 정리)
          `[단계 1] I_SC = ${v.Vs}R/(${(A + v.k) * v.Rc} + ${A + v.Rc}R)[A],  R = ${a.R}[Ω]`,
          `[단계 2] V_TH = ${qTex(a.Vth)}[V]`,
          `[단계 3] R_L = R_TH = ${qTex(a.Rth)}[Ω]일 때 P_L = ${qTex(a.Pmax)}[W]`,
        ].join("\n");

    const openPart = [
      `[단계 1] 단자 a-b를 **개방**하면 ${v.Rc}[Ω]에는 전류가 흐르지 않으므로 그 양단 전압 강하가 0이고,`,
      `  점선 부분은 ${v.Vs}[V] → ${v.Ra}[Ω] → ${v.k}i_x → ${v.Rb}[Ω] → R 의 **단일 폐로**가 된다.`,
      `  KVL: ${v.Vs} = ${v.Ra}i_x + ${v.k}i_x + ${v.Rb}i_x + R·i_x = (${S} + R)i_x  →  i_x = ${v.Vs}/(${S} + R)`,
      `  단자 전압은 R 양단 전압과 같으므로 **V_TH = R·i_x = ${v.Vs}R/(${S} + R)[V]**.`,
    ];
    const shortPart = [
      `  단자 a-b를 **단락**하면 ${v.Rc}[Ω]에도 전류가 흐른다. 마디 M의 전압을 v라 하면`,
      `  i_x = v/R, I_SC = v/${v.Rc} 이고, KVL: ${v.Vs} = ${A}(i_x + I_SC) + ${v.k}i_x + v`,
      `  → v = ${qTex(a.vShort)}[V]  →  **I_SC = v/${v.Rc} = ${qTex(a.Isc)}[A]**.`,
    ];
    const solution = (
      givenVoc
        ? [
            ...openPart,
            `  그래프의 V_RL 축 절편이 ${qTex(a.Vth)}[V]이므로 ${v.Vs}R/(${S} + R) = ${qTex(a.Vth)}`,
            `  → ${v.Vs}R = ${qTex(a.Vth)}(${S} + R)  →  **R = ${S}×${qTex(a.Vth)}/(${v.Vs} − ${qTex(a.Vth)}) = ${a.R}[Ω]**.`,
            `[단계 2] R = ${a.R}[Ω]을 대입한다.`,
            ...shortPart,
          ]
        : [
            ...openPart,
            `  이어서 단자 a-b를 **단락**한다. 마디 M의 전압을 v라 하면 i_x = v/R, I_SC = v/${v.Rc} 이고,`,
            `  KVL: ${v.Vs} = ${A}(i_x + I_SC) + ${v.k}i_x + v  →  R에 대해 정리하면`,
            `  **I_SC = ${v.Vs}R/(${(A + v.k) * v.Rc} + ${A + v.Rc}R)[A]**.`,
            `  그래프의 I_RL 축 절편이 ${qTex(a.Isc)}[A]이므로 이를 풀면 **R = ${a.R}[Ω]**.`,
            `[단계 2] R = ${a.R}[Ω]을 [단계 1]의 V_TH 식에 대입하면 **V_TH = ${v.Vs}×${a.R}/(${S} + ${a.R}) = ${qTex(a.Vth)}[V]**.`,
          ]
    ).concat([
      `  ★ 종속 전압원 ${v.k}i_x가 있으므로 **전원을 죽여(전압원 단락) R_TH를 구하는 방법은 쓸 수 없다** —`,
      `   개방 전압 V_TH와 단락 전류 I_SC로 구해야 한다(이 문항의 핵심).`,
      `[단계 3] R_TH = V_TH/I_SC = ${qTex(a.Vth)}/${qTex(a.Isc)} = ${qTex(a.Rth)}[Ω].`,
      `  최대 전력 전달 조건은 R_L = R_TH = ${qTex(a.Rth)}[Ω]이고, 그때`,
      `  **P_L = V_TH²/(4R_TH) = V_TH·I_SC/4 = ${qTex(a.Vth)}×${qTex(a.Isc)}/4 = ${qTex(a.Pmax)}[W]**.`,
    ]).join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_tdg_a_${idx + 1}`,
        label: "(가) 전압원과 종속전원이 포함된 저항회로 (점선 부분을 테브난 등가로 변환)",
        role: "original_circuit",
        diagramType: "thevenin_dep_graph_circuit",
        diagram: gen.circuit as unknown as Record<string, unknown>,
      },
      {
        id: `fig_tdg_b_${idx + 1}`,
        label: "(나) R_L에 따른 V_RL–I_RL 직선",
        role: "main_graph",
        diagramType: "vi_line_graph",
        diagram: {
          Vth: qNum(a.Vth), Isc: qNum(a.Isc),
          vSymbol: "V_RL", iSymbol: "I_RL", vUnit: "V", iUnit: "A",
          // ★ 학생이 구할 절편은 **기호로만** 적는다 — 수치를 적으면 답이 그림에 노출된다.
          vInterceptLabel: givenVoc ? `${qTex(a.Vth)}` : "V_TH",
          iInterceptLabel: givenVoc ? "I_SC" : `${qTex(a.Isc)}`,
        } as unknown as Record<string, unknown>,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 종속전원 + V-I 그래프 + 최대전력 감지 — 분류기·route 안전망 공용.
 *
 * ★ 판별선 = **종속전원 + 테브난 + (그래프 신호 또는 인벤토리의 기호 저항)**.
 *   형제 `thevenin_dependent_generic`(그래프 없음)·`ac_thevenin_*`(교류)와 구분된다.
 * ★ 낱말이 흔들린 회차 대비 — Vision이 "그래프"·"(나)"·"I_sc"를 하나도 안 쓴 실행이 실측됐다.
 *   그때 남는 신호가 **값이 기호인 저항**이다(CLAUDE.md 1-4-5).
 */
export function detectTheveninDepGraph(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;
  if (yieldsTdgToSibling(text)) return false;
  const symbolicR = hasSymbolicResistor(analysis.componentInventory as Array<{ type?: string; value?: string }>);
  const depInv = hasDependentInInventory(analysis.componentInventory as Array<{ type?: string; value?: string }>);
  // ★ 인벤토리가 텍스트의 "종속 전원" 주장을 반증하면(독립 전류원 2개 이상 + 종속원 0) 형제에 양보한다.
  const indepI = independentCurrentSourceCount(analysis.componentInventory as Array<{ type?: string; value?: string }>);
  if (!matchesTdgSignature(text, symbolicR, depInv, indepI)) return false;
  if (!matchesTdgAsk(text)) return false;
  return true;
}
