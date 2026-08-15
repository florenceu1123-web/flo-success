import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  elemTex,
  generateAcTwoSourceMeshPower,
  matchesTwoSourceMeshAsk,
  matchesTwoSourceMeshSignature,
  meshSignalsFromInventory,
  numFmt as n2,
  polarTex,
  rectTex,
  yieldsTwoSourceMeshToSibling,
} from "@/lib/generation/topologies/acTwoSourceMeshPower";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcTwoSourceMeshPowerPipeline");

/**
 * 2전원 RLC 회로 → 메시 해석으로 페이저 전류 I₁·I₂ → 평균 전력 (임용 5번 회로이론)
 * — 결정론 파이프라인. GPT 없음.
 *
 *  [단계 1] 저항 R₁에 흐르는 I₁과 (하단 우측 소자)에 흐르는 I₂
 *  [단계 2] 가운데 저항 R₂에서 소비되는 평균 전력
 *  [단계 3] 전원 v₁(t)가 공급하는 평균 전력
 */
export async function runAcTwoSourceMeshPowerPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (idx, seed) => {
    const gen = generateAcTwoSourceMeshPower({ seed, mode });
    const v = gen.values, a = gen.answer, c = gen.circuit;
    const arms = v.arms;
    const brName = c.botRight.name;            // 유사 "L" / 변형 "C₃"
    const brKo = arms.botRight.kind === "L" ? "인덕터" : "커패시터";
    const v1t = `v₁(t) = ${polarTex(v.V1).split("∠")[0]} cos(ωt + ${Math.round((Math.atan2(v.V1.im, v.V1.re) * 180) / Math.PI)}°)[V]`;
    const v2t = `v₂(t) = ${polarTex(v.V2).split("∠")[0]} cos(ωt + ${Math.round((Math.atan2(v.V2.im, v.V2.re) * 180) / Math.PI)}°)[V]`;

    log.info("ac_two_source_mesh_generated", {
      mode, V1: polarTex(v.V1), V2: polarTex(v.V2),
      I1: polarTex(a.I1), I2: polarTex(a.I2), P_R2: a.P_R2, P_v1: a.P_v1,
    });

    const content = [
      `그림은 두 개의 교류 전원이 포함된 RLC 회로를 주파수 영역에서 표시한 것이다.`,
      `제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 구하시오.`,
      `(단, ${v1t}, ${v2t}이고, V₁과 V₂는 각각 v₁(t)와 v₂(t)의 페이저 전압이다.)`,
    ].join(" ");

    const conditions = [
      `상단 좌: ${c.topLeft.name} = ${elemTex(arms.topLeft)} (전류 I₁), 상단 우: ${c.topRight.name} = ${elemTex(arms.topRight)} (전류 I₂)`,
      `가운데 세로: ${c.mid.name} = ${elemTex(arms.mid)}`,
      `하단 좌: ${c.botLeft.name} = ${elemTex(arms.botLeft)}, 하단 우: ${brName} = ${elemTex(arms.botRight)}`,
      `좌측 세로 전원 V₁ = ${polarTex(v.V1)}[V], 우측 세로 전원 V₂ = ${polarTex(v.V2)}[V] (둘 다 + 단자가 위쪽)`,
    ];

    const question = [
      `[단계 1] 저항 ${c.topLeft.name}에 흐르는 페이저 전류 I₁[A]과 ${brKo} ${brName}에 흐르는 페이저 전류 I₂[A]를 구한다.`,
      `[단계 2] 저항 ${c.mid.name}에서 소비되는 평균 전력[W]을 구한다.`,
      `[단계 3] 전원 v₁(t)가 공급하는 평균 전력[W]을 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] I₁ = ${polarTex(a.I1)}[A],  I₂ = ${polarTex(a.I2)}[A]`,
      `[단계 2] P_${c.mid.name} = ${n2(a.P_R2)}[W]`,
      `[단계 3] P_v1 = ${n2(a.P_v1)}[W]`,
    ].join("\n");

    const zeroNote = Math.abs(a.P_R2) < 1e-9
      ? `  ★ I₁ = I₂ 이므로 ${c.mid.name}에 흐르는 전류가 **0**이다 — 따라서 소비 전력도 0이다(이 회로의 핵심).`
      : `  I₁ − I₂ = ${rectTex(a.IR2)} = ${polarTex(a.IR2)}[A].`;

    const solution = [
      `[단계 1] 두 메시 전류를 모두 **시계 방향**으로 잡으면, 가운데 ${c.mid.name}에는 **I₁ − I₂** 가 흐른다.`,
      `  · 좌 메시: I₁(${elemTex(arms.topLeft)} + ${elemTex(arms.mid)} + ${elemTex(arms.botLeft)}) − I₂·${elemTex(arms.mid)} = V₁`,
      `    → I₁·(${rectTex(a.Z1)}) − I₂·(${elemTex(arms.mid)}) = ${rectTex(v.V1)}`,
      `  · 우 메시: −I₁·${elemTex(arms.mid)} + I₂(${elemTex(arms.mid)} + ${elemTex(arms.topRight)} + ${elemTex(arms.botRight)}) = V₂`,
      `    → −I₁·(${elemTex(arms.mid)}) + I₂·(${rectTex(a.Z2)}) = ${rectTex(v.V2)}`,
      `  연립하여 풀면 **I₁ = ${rectTex(a.I1)} = ${polarTex(a.I1)}[A]**, **I₂ = ${rectTex(a.I2)} = ${polarTex(a.I2)}[A]**.`,
      `[단계 2] ${c.mid.name}에 흐르는 전류는 I₁ − I₂ 이고, 진폭 페이저이므로 평균 전력은 P = ½|I|²R 이다.`,
      zeroNote,
      `  ∴ **P_${c.mid.name} = ½ × |${rectTex(a.IR2)}|² × ${n2(arms.mid.mag)} = ${n2(a.P_R2)}[W]**.`,
      `[단계 3] 전원이 공급하는 평균 전력은 P = ½·Re(V·I*) 이다(I는 전원의 + 단자에서 나가는 전류).`,
      `  P_v1 = ½·Re[(${rectTex(v.V1)})·(${rectTex({ re: a.I1.re, im: -a.I1.im })})] = **${n2(a.P_v1)}[W]**.`,
      `  ★ 검산: 저항이 소비하는 전력의 합 = ½|I₁|²·${n2(arms.topLeft.mag)} + ${n2(a.P_R2)} = ${n2(a.P_ra + a.P_R2)}[W],`,
      `   두 전원이 공급하는 전력의 합 = ${n2(a.P_v1)} + ${n2(a.P_v2)} = ${n2(a.P_v1 + a.P_v2)}[W] — 일치한다`,
      `   (리액티브 소자 ${c.topRight.name}·${c.botLeft.name}·${brName}의 평균 전력은 0이다).`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_mesh2src_${idx + 1}`,
        label: "두 교류 전원이 포함된 RLC 회로 (주파수 영역)",
        role: "original_circuit",
        diagramType: "ac_two_source_mesh_circuit",
        diagram: gen.circuit,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 2전원 RLC 메시 + 평균전력 감지 — 분류·route 안전망.
 *
 * ★ 실측(2026-08-04, 사용자 신고): 전용 항목이 없어 **`ac_rl_average_power`(임용 8번, 단일 전원)** 가
 *   가로챘고 생성물의 **정답이 빈 문자열**, 풀이는 "모든 branch 전류가 0A"라는 엉터리였다.
 *   validator는 issues=0으로 통과 — generic/형제 오탈취 실패의 전형.
 *
 * 판별선 = **교류 전원 2개** + 평균전력 + 페이저 전류(메시) 요구.
 *   형제 양보: 중첩의 원리·테브난·최대전력·공진·역률·전원 크기 역산·종속전원·스위치 과도·오실로스코프.
 */
export function detectAcTwoSourceMeshPower(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;
  // ★ 텍스트가 흔들린 회차 대비 — 인벤토리 구조 신호(V 2개·I 0개)를 함께 본다(실측 사고).
  if (!matchesTwoSourceMeshSignature(text, meshSignalsFromInventory(analysis.componentInventory))) return false;
  if (!matchesTwoSourceMeshAsk(text)) return false;
  if (yieldsTwoSourceMeshToSibling(text)) return false;
  return true;
}
