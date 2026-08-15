import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateAcTheveninDesignAb, numFmt as n2 } from "@/lib/generation/topologies/acTheveninDesignAb";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcTheveninDesignAbPipeline");

/** ∠ 표기 (위상 0이면 크기만). */
function ph(mag: number, deg: number): string {
  return deg === 0 ? `${n2(mag)}` : `${n2(mag)}∠${deg}°`;
}
/** R + jX 표기 (부호 정리). */
function zTex(R: number, X: number): string {
  if (X === 0) return `${n2(R)}`;
  return `${n2(R)} ${X < 0 ? "−" : "+"} j${n2(Math.abs(X))}`;
}

/**
 * 교류 테브난 등가 → 최대 평균전력이 되도록 **소자 값 a·b 설계** (임용 7번 회로이론)
 * — 결정론 파이프라인. GPT 없음.
 *
 *  유사: [1] Z_TH·V_TH를 a·b가 포함된 식으로 [2] 최대전력 조건의 a·b [3] P_max
 *  변형(구하는 양 교환): a·b가 주어지고 [2]에서 **Z_L**, [3]에서 P_max를 구한다.
 */
export async function runAcTheveninDesignAbPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  const variant = mode === "exam_variant";

  return generateInParallel(count, async (idx, seed) => {
    const v = generateAcTheveninDesignAb({ seed, mode }).values;
    log.info("ac_thevenin_design_ab_generated", {
      mode, a: v.a, b: v.b, Vm: v.Vm, theta: v.theta, RL: v.RL, XL: v.XL, Pmax: v.Pmax,
    });

    const vTex = `V = ${ph(v.Vm, v.theta)}\\,[\\mathrm{V}]`;
    const zlTex = zTex(v.RL, v.XL);
    const zthTex = zTex(v.RL, -v.XL);

    const content = variant
      ? [
          `그림은 교류 전원이 포함된 RLC 회로이다. 테브난의 등가 회로를 활용하여`,
          `부하 Z_L에 전달되는 평균 전력이 최대가 되도록 하는 부하 Z_L[Ω]과`,
          `이때 부하에 공급되는 최대 평균 전력 P_L[W]를 구하고자 한다.`,
          `제시된 <해석 절차>에 따라 구하여 서술하시오.`,
          `(단, 커패시터와 인덕터의 초깃값은 모두 0으로 가정하고, 전원의 크기는 실효값이다.)`,
        ].join(" ")
      : [
          `그림은 교류 전원이 포함된 RLC 회로이다. 테브난의 등가 회로를 활용하여`,
          `부하 Z_L에 전달되는 평균 전력이 최대가 되기 위한 a, b의 값과`,
          `부하에 공급되는 최대 평균 전력 P_L[W]를 구하고자 한다.`,
          `제시된 <해석 절차>에 따라 구하여 서술하시오.`,
          `(단, 커패시터와 인덕터의 초깃값은 모두 0으로 가정하고, 전원의 크기는 실효값이다.)`,
        ].join(" ");

    const conditions = [
      `교류 전원 ${vTex} (실효값), 전원과 병렬로 ${n2(v.Rd)}[Ω]과 −j${n2(v.Xd)}[Ω]의 직렬 가지가 연결됨`,
      variant
        ? `상단 직렬: ${n2(v.a)}[Ω] — j${n2(v.b)}[Ω] → 마디 A,  마디 A와 접지(B) 사이: −j${n2(v.b)}[Ω]`
        : `상단 직렬: a[Ω] — jb[Ω] → 마디 A,  마디 A와 접지(B) 사이: −jb[Ω]`,
      variant
        ? `단자 A–B에 부하 Z_L[Ω] 연결 (최대 평균전력이 되도록 설계)`
        : `단자 A–B에 부하 Z_L = ${zlTex}[Ω] 연결`,
    ];

    const question = variant
      ? [
          `[단계 1] 단자 A-B 사이의 테브난의 등가 임피던스 Z_TH[Ω]와 테브난의 등가 전압 V_TH[V]를 구한다.`,
          `[단계 2] 부하 Z_L에 전달되는 평균 전력이 최대가 되기 위한 부하 Z_L[Ω]의 값을 구한다.`,
          `[단계 3] 부하 Z_L에 공급되는 최대 평균 전력 P_L[W]을 구한다.`,
        ].join("\n")
      : [
          `[단계 1] 단자 A-B 사이의 테브난의 등가 임피던스 Z_TH[Ω]와 테브난의 등가 전압 V_TH[V]를 a, b가 포함된 수식으로 나타낸다.`,
          `[단계 2] 부하 Z_L에 전달되는 평균 전력이 최대가 되기 위한 a, b의 값을 구한다.`,
          `[단계 3] 부하 Z_L에 공급되는 최대 평균 전력 P_L[W]을 구한다.`,
        ].join("\n");

    const answer = variant
      ? [
          `[단계 1] Z_TH = ${zthTex}[Ω], V_TH = ${ph(v.vthMag, v.vthPhase)}[V]`,
          `[단계 2] Z_L = Z_TH* = ${zlTex}[Ω]`,
          `[단계 3] P_L = ${n2(v.Pmax)}[W]`,
        ].join("\n")
      : [
          `[단계 1] Z_TH = b²/a − jb[Ω], V_TH = V·(−jb)/a = ${n2(v.Vm)}b/a ∠${v.theta - 90}°[V]`,
          `[단계 2] a = ${n2(v.a)}, b = ${n2(v.b)}`,
          `[단계 3] P_L = ${n2(v.Pmax)}[W]`,
        ].join("\n");

    const solution = [
      `[단계 1] ★ 좌측의 ${n2(v.Rd)}[Ω]과 −j${n2(v.Xd)}[Ω] 직렬 가지는 **이상 전압원과 병렬**이므로`,
      `  단자 A–B에서 본 회로에는 아무 영향을 주지 않는다(전원을 단락하면 함께 단락된다).`,
      `  · Z_TH: 전원을 단락하면 직렬 (a + jb)와 션트 (−jb)의 **병렬**이 된다.`,
      `    Z_TH = (a+jb)(−jb)/[(a+jb) + (−jb)] = (b² − jab)/a = **b²/a − jb [Ω]**`,
      `    (분모의 jb가 상쇄되어 a만 남는 것이 이 회로의 핵심이다.)`,
      `  · V_TH: A를 개방하면 (a+jb)와 (−jb)의 분압이므로`,
      `    V_TH = V·(−jb)/[(a+jb) + (−jb)] = **V·(−jb)/a**,  |V_TH| = |V|·b/a, 위상은 ${v.theta}° − 90°.`,
      variant
        ? `  주어진 a = ${n2(v.a)}, b = ${n2(v.b)}를 대입하면 Z_TH = ${zthTex}[Ω], V_TH = ${ph(v.vthMag, v.vthPhase)}[V].`
        : `[단계 2] 최대 평균전력 전달 조건은 부하가 테브난 임피던스의 **켤레 복소수**일 때이다: Z_L = Z_TH*.`,
      variant
        ? `[단계 2] 최대 평균전력 전달 조건은 Z_L = Z_TH* 이므로 **Z_L = ${zlTex}[Ω]**.`
        : [
            `  Z_TH* = b²/a + jb 이고 주어진 부하는 Z_L = ${zlTex}[Ω]이므로 성분을 대응시키면`,
            `  허수부: b = ${n2(v.XL)} → **b = ${n2(v.b)}**,  실수부: b²/a = ${n2(v.RL)} → a = ${n2(v.b)}²/${n2(v.RL)} = **${n2(v.a)}**.`,
          ].join("\n"),
      `[단계 3] 정합 시 최대 평균 전력은 P_L = |V_TH|²/(4R_TH) 이다.`,
      `  |V_TH| = |V|·b/a = ${n2(v.Vm)}×${n2(v.b)}/${n2(v.a)} = ${n2(v.vthMag)}[V], R_TH = b²/a = ${n2(v.RL)}[Ω]이므로`,
      `  P_L = ${n2(v.vthMag)}²/(4×${n2(v.RL)}) = **${n2(v.Pmax)}[W]**.`,
      `  ★ 일반식으로 정리하면 P_L = (|V|b/a)²/(4·b²/a) = **|V|²/(4a)** — b가 완전히 약분된다`,
      `  (검산: ${n2(v.Vm)}²/(4×${n2(v.a)}) = ${n2(v.Pmax)}[W]).`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_acthdes_${idx + 1}`,
        label: "교류 전원 + 테브난 등가 · 최대 평균전력 회로",
        role: "original_circuit",
        diagramType: "ac_thevenin_design_ab_circuit",
        diagram: {
          vLabel: `V=${ph(v.Vm, v.theta)}[V]`,
          rdLabel: `${n2(v.Rd)}[Ω]`,
          xdLabel: `−j${n2(v.Xd)}[Ω]`,
          aLabel: variant ? `${n2(v.a)}[Ω]` : "a[Ω]",
          jbLabel: variant ? `j${n2(v.b)}[Ω]` : "jb[Ω]",
          shuntLabel: variant ? `−j${n2(v.b)}[Ω]` : "−jb[Ω]",
          zlRLabel: variant ? "R[Ω]" : `${n2(v.RL)}[Ω]`,
          zlXLabel: variant ? "jX[Ω]" : `j${n2(v.XL)}[Ω]`,
        },
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 교류 테브난 **소자 값 설계**(a·b) + 최대 평균전력 감지 — 분류·route 안전망.
 *
 * ★ 실측(2026-08-03, 사용자 신고): 이 원본이 `ac_bridge_max_power`(브리지 4-arm + 순저항 R_L)로
 *   dispatch돼 전혀 다른 회로가 생성됐다.
 *
 * 판별선 = **테브난 + 최대(평균) 전력 + "구하는 것이 회로의 소자 값(a·b)"**.
 *   형제(ac_thevenin_ladder·ac_bridge·two_box)는 모두 **부하**를 구한다.
 */
export function detectAcTheveninDesignAb(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const thevenin = /테브난|thevenin|등가\s*임피던스/.test(text);
  const maxPower = /최대\s*평균\s*전력|최대\s*전력|maximum\s*power/.test(text);
  if (!(thevenin && maxPower)) return false;

  // ★ 이 유형 고유 = **미지수가 회로의 소자 값 a·b** 다(부하가 아니라).
  //   ★★ Vision이 요약에서 a·b를 통째로 흘리는 회차가 있다(실측) — 그때는 **인벤토리의 기호 소자 값**
  //   (`a[Ω]`·`jb[Ω]`·`-jb[Ω]`)만 남는다. 텍스트·인벤토리 둘 중 하나만 맞아도 인정한다.
  const SYMBOLIC_AB = /^\s*[-−+]?\s*j?\s*[ab]\s*(\[|Ω|ω|$)/i;
  const symbolicCount = (analysis.componentInventory ?? [])
    .filter((c) => SYMBOLIC_AB.test(String(c.value ?? ""))).length;
  const designAb =
    /a\s*,\s*b\s*의?\s*값|a와\s*b의?\s*값|a\s*·\s*b|미지\s*소자|소자\s*값을?\s*(구|결정|설계)/.test(text) ||
    (/a\s*\[?[ΩΩ]?\]?/.test(text) && /jb|−jb|-jb/.test(text)) ||
    symbolicCount >= 2;
  if (!designAb) return false;

  // 형제 양보 — 브리지·점선 박스 2개·종속전원은 각자 전용 archetype.
  if (/브리지|bridge|휘트스톤/.test(text)) return false;
  if (/점선\s*박스|박스\s*2개|c-d|단자\s*c/.test(text)) return false;
  if (/종속\s*전원|종속\s*전압원|종속\s*전류원/.test(text)) return false;
  return true;
}
