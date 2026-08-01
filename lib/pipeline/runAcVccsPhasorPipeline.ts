import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateAcVccsPhasor } from "@/lib/generation/topologies/acVccsPhasor";
import { generateInParallel } from "./_common";
import type { AnalysisResult, FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runAcVccsPhasorPipeline");

/**
 * 종속전류원(g·V_c) 2단 구동 페이저 회로 (임용 3번 회로이론) — 결정론 파이프라인. GPT 없음.
 *  [1] V_c (분압) → [2] I_R (전류분배) → [3] i_R(t) (시간영역).
 *  유사: shunt=커패시터·부하=인덕터 (원본) / 변형: 소자 종류 교환 (shunt=인덕터·부하=커패시터).
 */
export async function runAcVccsPhasorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const g = generateAcVccsPhasor({ seed, mode });
    const v = g.vals;
    log.info("ac_vccs_phasor_generated", {
      mode, shunt: g.shuntKind, load: g.loadKind,
      omega: v.omega, vs: `${v.vsMag}∠${v.vsAng}°`, r1: v.r1, xSh: v.xSh, g: v.g, r2: v.r2, xLd: v.xLd,
      vc: g.vc.text, ir: g.ir.text,
    });

    const shuntName = g.shuntKind === "C" ? "커패시터" : "인덕터";
    const loadName = g.loadKind === "L" ? "인덕터" : "커패시터";

    const content = [
      `그림은 교류 전원이 인가된 RLC 회로를 주파수 영역에서 표현한 것이다.`,
      `다음 <해석 절차>에 따라 시간 영역에서의 ${g.rLoadLabel}의 저항에 흐르는 정상상태 전류 i_R(t)[A]를 구하고, 풀이과정과 함께 쓰시오.`,
      `(단, 입력 전원의 페이저는 코사인(cosine) 함수를 기준으로 최댓값과 위상을 표현한 것이며, 각주파수 ω는 ${v.omega}[rad/s]이다.)`,
    ].join(" ");

    const conditions = [
      `교류 전원의 페이저: V_s = ${v.vsMag}∠${v.vsAng}°[V] (코사인 기준 최댓값·위상).`,
      `좌측 회로: V_s ─ R₁(${v.r1}[Ω]) ─ 마디 A, 마디 A와 접지 사이에 ${shuntName} ${g.diagram.shunt1Label}·${g.diagram.shunt2Label} 2개가 병렬. V_c는 마디 A의 전압이다.`,
      `우측 회로: 종속전류원 ${v.g}V_c가 접지에서 마디 B로 전류를 공급하고, 마디 B와 접지 사이에 저항 R₂(${v.r2}[Ω])와 ${loadName} ${g.diagram.loadXLabel}가 병렬이다. I_R은 R₂에 흐르는 전류이다.`,
    ];

    const question = [
      `[단계 1] 페이저 전압 V_c[V]를 구한다.`,
      `[단계 2] [단계 1]에서 구한 V_c를 이용하여 페이저 전류 I_R[A]를 구한다.`,
      `[단계 3] [단계 2]에서 구한 I_R를 시간 영역에서의 정상상태 전류 i_R(t)로 표현한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] V_c = ${g.vc.text}`,
      `[단계 2] I_R = ${g.ir.text}`,
      `[단계 3] i_R(t) = ${g.irTimeText} [A]`,
    ].join("\n");

    const solution = [
      `[단계 1] 두 ${shuntName}가 병렬이므로 Z_sh = ${g.diagram.shunt1Label} ∥ ${g.diagram.shunt2Label} = ${g.zShText}.`,
      `  마디 A는 R₁과 Z_sh의 분압점이므로`,
      `  V_c = V_s · Z_sh/(R₁ + Z_sh) = ${v.vsMag}∠${v.vsAng}° · ${g.zShText}/(${v.r1}[Ω] + ${g.zShText}) = ${g.vc.text}.`,
      `[단계 2] 종속전류원이 공급하는 전류는 I_d = ${v.g}·V_c = ${v.g}·(${g.vc.text}).`,
      `  이 전류가 마디 B에서 R₂(${v.r2}[Ω])와 ${loadName}(${g.zLdText})로 나뉘므로 전류분배로`,
      `  I_R = I_d · Z_ld/(R₂ + Z_ld) = I_d · ${g.zLdText}/(${v.r2}[Ω] + ${g.zLdText}) = ${g.ir.text}.`,
      `[단계 3] 페이저가 코사인 기준 최댓값·위상이므로 시간 영역 전류는`,
      `  i_R(t) = |I_R|·cos(ωt + ∠I_R) = ${g.irTimeText} [A].`,
    ].join("\n");

    const label = g.shuntKind === "C"
      ? "교류 페이저 회로: V_s→R₁→(C∥C) ⇒ V_c, 종속전류원 g·V_c→(R₂∥L) ⇒ I_R"
      : "교류 페이저 회로(소자 교환): V_s→R₁→(L∥L) ⇒ V_c, 종속전류원 g·V_c→(R₂∥C) ⇒ I_R";

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_acvccs_${i + 1}`,
        label,
        role: "original_circuit",
        diagramType: "ac_vccs_phasor_circuit",
        diagram: g.diagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
