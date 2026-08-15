import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateZenerShuntRegulator, formatNum as n2 } from "@/lib/generation/topologies/zenerShuntRegulator";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runZenerShuntRegulatorPipeline");

/**
 * 제너 n개 직렬 션트 정전압 회로 → 부하 저항 범위 (임용 2번 전자회로) — 결정론 파이프라인. GPT 없음.
 *
 *  유사: [1] 정전압 V_RL [2] R_Lmin 조건(I_Z=0)으로 a [3] I_ZM 조건으로 R_Lmax
 *  변형(구하는 양 교환): a가 주어지고 [3]에서 **R_Lmin·R_Lmax 범위**를 구한다.
 */
export async function runZenerShuntRegulatorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  const variant = mode === "exam_variant";

  return generateInParallel(count, async (idx, seed) => {
    const gen = generateZenerShuntRegulator({ seed, mode });
    const v = gen.values, L = gen.labels;
    log.info("zener_shunt_regulator_generated", {
      mode, Vi: v.Vi, Vz: v.Vz, n: v.n, Izm: v.Izm, a: v.a, RLmin: v.RLmin, RLmax: v.RLmax,
    });

    const content = variant
      ? [
          `그림은 ${v.n}개의 동일한 제너 다이오드를 이용한 정전압 회로이다.`,
          `직렬 저항이 ${n2(v.a)}[kΩ]일 때, 정전압 V_RL이 유지되도록 하는 부하 저항 R_L의`,
          `최솟값 R_Lmin[kΩ]과 최댓값 R_Lmax[kΩ]를 구하시오.`,
          `(단, 제너 다이오드는 이상적으로 동작하고, V_Z는 제너 전압, I_ZM은 제너 최대 전류이다.)`,
        ].join(" ")
      : [
          `그림은 ${v.n}개의 동일한 제너 다이오드를 이용한 정전압 회로이다.`,
          `정전압 V_RL이 유지되도록 부하 저항 R_L을 변화시키고자 할 때,`,
          `부하 저항의 최솟값 R_Lmin = ${n2(v.RLmin)}[kΩ]이 되는 a의 값을 구하고,`,
          `그 값을 이용하여 부하 저항의 최댓값 R_Lmax[kΩ]를 구하시오.`,
          `(단, 제너 다이오드는 이상적으로 동작하고, V_Z는 제너 전압, I_ZM은 제너 최대 전류이다.)`,
        ].join(" ");

    const conditions = [
      `V_i = ${v.Vi}[V]`,
      `동일한 제너 다이오드 ${v.n}개 **직렬**: 각각 V_Z = ${v.Vz}[V], I_ZM = ${v.Izm}[mA]`,
      variant ? `직렬 저항 a = ${n2(v.a)}[kΩ]` : `부하 저항 최솟값 R_Lmin = ${n2(v.RLmin)}[kΩ]`,
      `제너 다이오드는 이상적으로 동작한다 (동작 중 제너 전압 일정, 제너 전류는 0 이상 I_ZM 이하)`,
    ];

    const question = variant
      ? [
          `[단계 1] 부하 저항 양단의 정전압 V_RL[V]를 구한다.`,
          `[단계 2] 직렬 저항 a에 흐르는 전류 I_S[mA]를 구한다.`,
          `[단계 3] [단계 2]의 결과를 이용하여 부하 저항의 최솟값 R_Lmin[kΩ]과 최댓값 R_Lmax[kΩ]를 구한다.`,
        ].join("\n")
      : [
          `[단계 1] 부하 저항 양단의 정전압 V_RL[V]를 구한다.`,
          `[단계 2] 부하 저항의 최솟값 R_Lmin = ${n2(v.RLmin)}[kΩ]이 되는 a의 값[kΩ]을 구한다.`,
          `[단계 3] [단계 2]에서 구한 a를 이용하여 부하 저항의 최댓값 R_Lmax[kΩ]를 구한다.`,
        ].join("\n");

    const answer = variant
      ? [
          `[단계 1] V_RL = ${v.VL} [V]`,
          `[단계 2] I_S = ${n2(v.Is)} [mA]`,
          `[단계 3] R_Lmin = ${n2(v.RLmin)} [kΩ], R_Lmax = ${n2(v.RLmax)} [kΩ]`,
        ].join("\n")
      : [
          `[단계 1] V_RL = ${v.VL} [V]`,
          `[단계 2] a = ${n2(v.a)} [kΩ]`,
          `[단계 3] R_Lmax = ${n2(v.RLmax)} [kΩ]`,
        ].join("\n");

    const solution = [
      `[단계 1] 제너 다이오드 ${v.n}개가 **직렬**로 연결되어 있고 각각 항복 상태에서 V_Z = ${v.Vz}[V]로 일정하므로,`,
      `  부하 저항 양단 전압은 V_RL = ${v.n}×${v.Vz} = **${v.VL} [V]** 로 유지된다.`,
      `[단계 2] 직렬 저항 a에 흐르는 전류는 I_S = (V_i − V_RL)/a = (${v.Vi} − ${v.VL})/a = ${v.Vi - v.VL}/a [mA] 이고,`,
      `  마디에서 KCL을 적용하면 I_S = I_Z + I_L, 부하 전류는 I_L = V_RL/R_L 이다.`,
      variant
        ? `  a = ${n2(v.a)}[kΩ]이므로 I_S = ${v.Vi - v.VL}/${n2(v.a)} = **${n2(v.Is)} [mA]** (V_i·V_RL이 일정하므로 I_S도 일정하다).`
        : [
            `  ★ **R_L이 최소** ⟺ I_L이 최대 ⟺ I_Z가 최소이고, 이상적 제너의 하한은 I_Z = 0 이다.`,
            `  즉 R_L = R_Lmin = ${n2(v.RLmin)}[kΩ]일 때 전류가 전부 부하로 흐르므로`,
            `  I_S = I_Lmax = V_RL/R_Lmin = ${v.VL}/${n2(v.RLmin)} = ${n2(v.Is)} [mA].`,
            `  따라서 a = (V_i − V_RL)/I_S = ${v.Vi - v.VL}/${n2(v.Is)} = **${n2(v.a)} [kΩ]**.`,
          ].join("\n"),
      `[단계 3] a가 정해지면 V_i·V_RL이 일정하므로 **I_S = ${n2(v.Is)} [mA]로 고정**된다.`,
      `  ★ **R_L이 최대** ⟺ I_L이 최소 ⟺ I_Z가 최대이고, 제너 최대 전류는 I_ZM = ${v.Izm}[mA]이다.`,
      `  I_Lmin = I_S − I_ZM = ${n2(v.Is)} − ${v.Izm} = ${n2(v.ILmin)} [mA] 이므로`,
      `  R_Lmax = V_RL/I_Lmin = ${v.VL}/${n2(v.ILmin)} = **${n2(v.RLmax)} [kΩ]**.`,
      variant ? `  또 R_Lmin은 I_Z = 0인 경우이므로 R_Lmin = V_RL/I_S = ${v.VL}/${n2(v.Is)} = **${n2(v.RLmin)} [kΩ]**.` : "",
      `  (검산: R_L = ${n2(v.RLmin)}kΩ → I_L = ${n2(v.VL / v.RLmin)}mA·I_Z = 0mA / R_L = ${n2(v.RLmax)}kΩ → I_L = ${n2(v.ILmin)}mA·I_Z = ${v.Izm}mA`,
      `   — 두 극단 모두 0 ≤ I_Z ≤ I_ZM 을 만족한다.)`,
    ].filter(Boolean).join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_zshunt_${idx + 1}`,
        label: `제너 다이오드 ${v.n}개 직렬 정전압 회로`,
        role: "original_circuit",
        diagramType: "zener_shunt_regulator_circuit",
        diagram: {
          viLabel: L.viLabel, aLabel: L.aLabel, rlLabel: L.rlLabel,
          vzLabel: L.vzLabel, izmLabel: L.izmLabel, zenerCount: v.n,
        },
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 제너 직렬 션트 정전압기(부하 저항 범위) 감지 — 분류·route 안전망.
 *
 * ★ 실측(2026-08-03, 사용자 신고): 전용 항목이 없어 `dc_mesh`(electronics fallback)로 dispatch됐고,
 *   **원본을 거의 그대로 베낀 문항에 정답만 틀리게**(a=5, 풀이는 알맹이 없음) 나왔다.
 *
 * 시그니처: 제너 + 정전압 + **부하 저항의 최솟값/최댓값(범위)**.
 *   · 형제 양보: BJT·트랜지스터(zener_bjt_regulator), OPAMP(opamp_series_regulator).
 */
export function detectZenerShuntRegulator(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  // 형제 양보 — 능동소자가 끼면 다른 레귤레이터 유형이다.
  if (/트랜지스터|transistor|bjt|npn|pnp|연산\s*증폭기|opamp|op-amp|오차\s*증폭기/.test(text)) return false;

  const zener = /제너|zener/.test(text);
  const regulate = /정전압|전압\s*조정|레귤레이|안정화/.test(text);
  // 이 유형 고유 요구 — 부하 저항의 최솟값·최댓값(범위).
  const range =
    /r_?l\s*의?\s*(최솟값|최소값|최댓값|최대값)|부하\s*저항의?\s*(최솟값|최소값|최댓값|최대값|범위)|r_?lmin|r_?lmax|최솟값.*최댓값/.test(text);
  return zener && (regulate || range) && range;
}
