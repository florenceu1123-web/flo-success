/**
 * SW + 상보형 2단 BJT 바이어스 (임용 10번) — 결정론 파이프라인. GPT 없음.
 *  (가) 회로 figure + 3단계 풀이 (Q1 바이어스 / R5 / R6·V_EC2).
 */
import { createLogger } from "@/lib/logger";
import { generateBjtTwoStageSwitched } from "@/lib/generation/topologies/bjtTwoStageSwitched";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runBjtTwoStageSwitchedPipeline");

/** stale analysis 재검출 안전망용 — SW + 트랜지스터 2개 상보형 2단 바이어스 시그니처. */
export function detectBjtTwoStageSwitched(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const inv = analysis.componentInventory ?? [];
  const up = (t: unknown) => String(t ?? "").toUpperCase();
  const bjtN = inv.filter((c) => ["BJT", "NPN", "PNP", "TRANSISTOR", "트랜지스터"].includes(up(c.type))).length;
  const swN = inv.filter((c) => up(c.type) === "SW").length;
  const txt = [
    analysis.topic ?? "", analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
  ].join(" ").toLowerCase();
  const hasBjtText = /트랜지스터|bjt|쌍극성/.test(txt);
  const hasSwText = /스위치|switch|\bsw\b/.test(txt);
  // BJT 2개 이상 + 스위치 (인벤토리 또는 텍스트) → 2단 스위치 BJT.
  return bjtN >= 2 && (swN >= 1 || hasSwText || hasBjtText);
}

export async function runBjtTwoStageSwitchedPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { count, topicKey } = args;
  const mode: "exam_similar" | "exam_variant" =
    args.mode === "exam_variant" ? "exam_variant" : "exam_similar";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateBjtTwoStageSwitched({ mode, seed, index: i });
    const p = gen.params;
    const s = gen.solved;
    log.info("bjt_two_stage_switched_generated", { params: p, Ve1: s.Ve1, Vce1: s.Vce1, R5: p.R5, Ie2: s.Ie2, R6: p.R6, Vec2: s.Vec2 });

    const circuitFig: FigureVariant = {
      id: `fig_bjt2_${i + 1}`,
      label: "SW + 상보형 2단 BJT 회로 (NPN Q₁ → PNP Q₂)",
      role: "original_circuit",
      diagramType: "bjt_two_stage_switched_circuit",
      diagram: { Vcc: p.Vcc, R1: p.R1, R2: p.R2, R3: p.R3, R4: p.R4, R5: p.R5, R6: p.R6, R7: p.R7 },
    };

    const content = [
      `그림은 스위치 SW와 쌍극성 접합 트랜지스터(BJT) 2개를 응용한 회로이다. Q₁은 NPN, Q₂는 PNP이며, Q₁의 이미터 쪽 노드 M(R₃·R₄ 접합)이 Q₂의 베이스를 구동한다.`,
      `제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 전압 [V]·저항 [kΩ]·전류 [mA]로 계산하고, V_BE1=V_EB2=0.7[V]·I_C≈I_E로 가정한다.)`,
    ].join(" ");

    const conditions = [
      `전원 V_CC=${p.Vcc}V. Q₁ 베이스 분압: SW─R₁(${p.R1}kΩ)─B₁─R₂(${p.R2}kΩ)─GND.`,
      `Q₁(NPN): 컬렉터─R₅(가변)─V_CC, 이미터─R₃(${p.R3}kΩ)─M─R₄(${p.R4}kΩ)─GND.`,
      `Q₂(PNP): 베이스=M, 이미터─R₆(가변)─V_CC, 컬렉터─R₇(${p.R7}kΩ)─GND (=V_O).`,
      `R₅·R₆는 가변저항. V_BE1=V_EB2=0.7V, I_C≈I_E, 베이스 전류 무시.`,
    ];

    const question = [
      `[단계 1] SW를 닫아 동작시키고 R₅=${p.R5}[kΩ]·R₆=${p.R6}[kΩ]로 설정할 때, Q₁의 베이스 전압 V_B1·이미터 전압 V_E1·이미터 전류 I_E1을 구한다.`,
      `[단계 2] V_CE1=${s.Vce1}[V]일 때, 저항 R₅[kΩ]를 구한다.`,
      `[단계 3] I_E2=${s.Ie2}[mA]일 때, 저항 R₆[kΩ]와 V_EC2[V]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] V_B1 = ${s.Vb1} V,  V_E1 = ${s.Ve1} V,  I_E1 = ${s.Ie1} mA`,
      `[단계 2] R₅ = ${p.R5} kΩ`,
      `[단계 3] R₆ = ${p.R6} kΩ,  V_EC2 = ${s.Vec2} V`,
    ].join("\n");

    const solution = [
      `[단계 1] Q₁ 베이스 분압: V_B1 = V_CC·R₂/(R₁+R₂) = ${p.Vcc}·${p.R2}/(${p.R1}+${p.R2}) = ${s.Vb1}V. NPN이므로 V_E1 = V_B1 − 0.7 = ${s.Ve1}V. 이미터 전류는 R₃·R₄를 통해 흐르므로 I_E1 = V_E1/(R₃+R₄) = ${s.Ve1}/(${p.R3}+${p.R4}) = ${s.Ie1}mA. (노드 M 전압 V_M = I_E1·R₄ = ${s.Vm}V.)`,
      `[단계 2] I_C1≈I_E1 = ${s.Ie1}mA이고 V_CE1 = V_CC − I_C1·R₅ − V_E1 → R₅ = (V_CC − V_E1 − V_CE1)/I_C1 = (${p.Vcc} − ${s.Ve1} − ${s.Vce1})/${s.Ie1} = ${p.R5}kΩ. (단계1의 설정값과 일치.)`,
      `[단계 3] Q₂(PNP): V_E2 = V_M + 0.7 = ${s.Ve2}V. I_E2 = (V_CC − V_E2)/R₆ → R₆ = (V_CC − V_E2)/I_E2 = (${p.Vcc} − ${s.Ve2})/${s.Ie2} = ${p.R6}kΩ. I_C2≈I_E2 → V_C2 = I_C2·R₇ = ${s.Ie2}·${p.R7} = ${s.Vc2}V, V_EC2 = V_E2 − V_C2 = ${s.Vec2}V. (출력 V_O = ${s.Vo}V.)`,
    ].join("\n");

    return {
      id: `bjt2_${i + 1}`,
      topicKey: topicKey ?? "bjt_bias",
      content, conditions, question, answer, solution,
      figureVariants: [circuitFig],
    } as GeneratedProblem;
  });
}
