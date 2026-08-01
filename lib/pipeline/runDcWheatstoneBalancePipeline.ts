import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateDcWheatstoneBalance } from "@/lib/generation/topologies/dcWheatstoneBalance";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDcWheatstoneBalancePipeline");

/**
 * DC 휘트스톤 브리지 평형 (임용 3번 회로이론) 재검출 — generate 단계 안전망.
 *
 * ★ 실측(서버 로그): 이 원본은 topicKey=dc_resistive → **dc_nodal fallback(low)** 로 분류되고
 *   inventoryCount 8(≥7) 게이트에 걸려 topology_driven으로 dispatch됐다. 그 결과 브리지 다이아몬드·
 *   미지 저항 R_x·개방 출력 V_o가 모두 사라진 임의 저항망이 **에러 없이**(totalIssues=0) 생성됐다.
 *   프론트가 analysis를 state 캐시하므로 분류기 수정만으로는 stale circuitType이 그대로 오기도 한다.
 *
 * 시그니처(표현 무관): 브리지/휘트스톤 + 평형 + 순수 DC 저항망(C·L·종속원·스위치·전류원 없음).
 *   ★ 양보: 교류·리액턴스·테브난·최대전력 문맥이면 형제 archetype(ac_bridge_max_power)에 넘긴다.
 */
export function detectDcWheatstoneBalance(analysis?: AnalysisResult | null): boolean {
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

  const bridgeKw = /휘트스톤|휘스톤|wheatstone|브리지|bridge/.test(text);
  const balanceKw = /평형|평행 조건|balance|balanced|브리지가?\s*평형|전류가?\s*흐르지\s*않/.test(text);
  if (!bridgeKw || !balanceKw) return false;

  // 순수 DC 저항망 — 리액티브·종속원·스위치·전류원이 있으면 이 유형이 아니다.
  if (countOf("C") > 0 || countOf("L") > 0 || countOf("SW") > 0 || countOf("I") > 0) return false;
  if (["CCVS", "CCCS", "VCVS", "VCCS"].some((k) => countOf(k) > 0)) return false;
  const reactiveText = /커패시터|콘덴서|축전기|인덕터|코일|리액턴스|임피던스|어드미턴스/.test(text);
  const acText = /교류|정현파|페이저|∠|위상각|주파수|공진|실효값/.test(text);
  if (reactiveText || acText) return false;
  // 형제 archetype(AC 브리지 테브난·최대전력) 문맥이면 양보.
  if (/테브난|thevenin|노턴|최대\s*전력|최대전력/.test(text)) return false;

  // 저항이 실제로 여러 개인 저항망 (인벤토리가 비면 텍스트로 판정 — 브리지+평형이면 충분).
  const rN = countOf("R");
  if (inv.length > 0 && rN < 4) return false;

  return true;
}

/**
 * DC 휘트스톤 브리지 평형 (임용 3번 회로이론) — 결정론 파이프라인. GPT 없음.
 *  [1] 평형 조건(브리지 암 전류 0) → 미지 저항 R_x,
 *  [2] 평형 상태의 개방 출력 전압 V_o.
 */
export async function runDcWheatstoneBalancePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDcWheatstoneBalance({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("dc_wheatstone_balance_generated", {
      mode, unknownArm: v.unknownArm, Vs: v.Vs, Rs: v.Rs, R1: v.R1,
      R3: `${v.R3a}∥${v.R3b}`, Rtr: v.Rtr, Rrb: v.Rrb, Rp: v.Rp,
      Rx: a.Rx, Vo: a.Vo, Vt: a.Vt,
    });

    const upper = v.unknownArm === "upper_right";
    // 미지 암(합성값)과 그 반대 암 — 평형식 서술에 사용.
    const unknownEq = upper ? v.Rtr : v.Rrb;
    const armDesc = upper
      ? `상단 우측 암(R_x ∥ ${v.Rp}[Ω])`
      : `하단 우측 암(R_x ∥ ${v.Rp}[Ω])`;
    // 평형식: R1 : R3eq = R_tr : R_rb
    const balanceEq = `${v.R1} : ${a.R3eq} = ${upper ? "R_상단우" : v.Rtr} : ${upper ? v.Rrb : "R_하단우"}`;

    const content = [
      "그림은 독립 전압원을 포함한 휘트스톤 브리지 회로이다.",
      `브리지 회로가 평형이 되기 위한 저항 R_x[Ω]과 이때의 출력 전압 V_o[V]를 구하여 순서대로 쓰시오.`,
    ].join(" ");

    const conditions = [
      `전원: ${v.Vs}[V] 직류 전압원 + 직렬 저항 ${v.Rs}[Ω] (상단 마디 T로 인가).`,
      `브리지 4개 암: 상단 좌 ${v.R1}[Ω], 상단 우 ${upper ? `R_x ∥ ${v.Rp}[Ω]` : `${v.Rtr}[Ω]`}, ` +
        `하단 좌 ${v.R3a}[Ω] ∥ ${v.R3b}[Ω], 하단 우 ${upper ? `${v.Rrb}[Ω]` : `R_x ∥ ${v.Rp}[Ω]`}.`,
      `브리지 암(좌·우 마디 사이): ${v.Rg}[Ω].`,
      `출력 단자는 개방되어 있으며, V_o는 상단 마디(+)와 우측 마디(−) 사이 전압이다.`,
    ];

    const question = [
      `[단계 1] 브리지 평형 조건(브리지 암에 전류가 흐르지 않음)을 이용하여 ${armDesc}의 R_x[Ω]를 구한다.`,
      `[단계 2] 평형 상태에서 출력 전압 V_o[V]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] R_x = ${a.Rx} Ω`,
      `[단계 2] V_o = ${a.Vo} V`,
    ].join("\n");

    const solution = [
      `[단계 1] 하단 좌측 암의 합성저항은 ${v.R3a}∥${v.R3b} = ${a.R3eq} Ω이다. ` +
        `평형이면 브리지 암(${v.Rg}[Ω])에 전류가 흐르지 않아 좌·우 두 분압기의 분압비가 같다: ` +
        `${balanceEq} → 미지 암의 합성저항 = ${unknownEq} Ω. ` +
        `이 암은 R_x와 ${v.Rp}[Ω]의 병렬이므로 1/${unknownEq} = 1/R_x + 1/${v.Rp} → R_x = ${a.Rx} Ω.`,
      `[단계 2] 평형이므로 브리지 암 전류가 0 → 좌·우 분압기는 독립이다. ` +
        `상단 마디에서 본 저항 = (${v.R1}+${a.R3eq}) ∥ (${v.Rtr}+${v.Rrb}) = ${a.Rpar} Ω. ` +
        `분압으로 V_T = ${v.Vs}·${a.Rpar}/(${v.Rs}+${a.Rpar}) = ${a.Vt} V. ` +
        `우측 마디 전압은 V_R = V_T·${v.Rrb}/(${v.Rtr}+${v.Rrb}) = ${a.Vt * v.Rrb / (v.Rtr + v.Rrb)} V이므로 ` +
        `V_o = V_T − V_R = V_T·${v.Rtr}/(${v.Rtr}+${v.Rrb}) = ${a.Vo} V.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_wheatstone_${i + 1}`,
        label: "휘트스톤 브리지 회로 (출력 단자 개방)",
        role: "original_circuit",
        diagramType: "dc_wheatstone_balance_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
