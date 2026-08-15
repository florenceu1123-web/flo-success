import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  elemTex,
  generateAcSuperpositionNullSource,
  matchesNullSourceAsk,
  matchesNullSourceUnknownSource,
  matchesNullSourceSignature,
  nullSourceSignalsFromInventory,
  polarTex,
  rectTex,
  yieldsNullSourceToSibling,
  zSumTex,
} from "@/lib/generation/topologies/acSuperpositionNullSource";
import { generateInParallel } from "./_common";
import type {
  AnalysisResult,
  FigureVariant,
  GeneratedProblem,
  GenerationMode,
  TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcSuperpositionNullSourcePipeline");

/**
 * 2전원 페이저 RLC + **중첩의 원리로 V_L = 0이 되는 전류원 역산** (임용 3번 회로이론)
 * — 결정론 파이프라인. GPT 없음.
 *
 *  [단계 1] 전류원 I_s **개방** → 인덕터 양단 페이저 전압 V_L1
 *  [단계 2] 전압원 V_s **단락** → 인덕터 양단 페이저 전압 V_L2 (I_s의 식)
 *  [단계 3] 중첩 + 조건 V_L = 0 → 페이저 전류원 I_s
 */
export async function runAcSuperpositionNullSourcePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (idx, seed) => {
    const gen = generateAcSuperpositionNullSource({ seed, index: idx, mode });
    const v = gen.values, a = gen.answer, arms = v.arms;
    const { midKo, vSym } = gen;
    const sub1 = `${vSym}₁`, sub2 = `${vSym}₂`;

    log.info("ac_superposition_null_source_generated", {
      mode, Vs: polarTex(v.Vs), VL1: polarTex(a.VL1), Zp: rectTex(a.Zp), Is: polarTex(a.Is),
    });

    const content =
      `그림은 2개의 교류 전원이 포함된 RLC 회로를 주파수 영역에서 표현한 것이다. ` +
      `페이저 전압원 V_s = ${polarTex(v.Vs)}[V]일 때, ${midKo} 양단의 페이저 전압 ${vSym} = 0[V]가 되도록 ` +
      `페이저 전류원 I_s[A]를 제시된 <해석 절차>에 따라 구하고 풀이과정과 함께 쓰시오.`;

    const conditions = [
      `상단 좌: ${elemTex(arms.topLeft)}, 상단 우: ${elemTex(arms.topRight)}`,
      `가운데 세로(${midKo}): ${elemTex(arms.mid)} — 이 소자 양단 전압이 ${vSym}이며 위쪽이 (+)이다.`,
      `하단 좌: ${elemTex(arms.botLeft)}, 하단 우: ${elemTex(arms.botRight)}`,
      `좌측 세로는 전압원 V_s(+ 단자가 위), 우측 세로는 전류원 I_s(화살표가 위쪽)이다.`,
    ];

    const question = [
      `[단계 1] 주어진 회로에서 페이저 전류원 I_s가 개방된 경우, ${midKo} 양단의 페이저 전압 ${sub1}[V]를 구한다.`,
      `[단계 2] 주어진 회로에서 페이저 전압원 V_s가 단락된 경우, ${midKo} 양단의 페이저 전압 ${sub2}[V]를 구한다.`,
      `[단계 3] 중첩의 원리와 주어진 조건을 이용하여 페이저 전류원 I_s[A]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ${sub1} = ${rectTex(a.VL1)} = ${polarTex(a.VL1)}[V]`,
      `[단계 2] ${sub2} = (${rectTex(a.Zp)})·I_s [V]`,
      `[단계 3] I_s = ${rectTex(a.Is)} = ${polarTex(a.Is)}[A]`,
    ].join("\n");

    const solution = [
      `[단계 1] 전류원을 개방하면 우측 가지(${elemTex(arms.topRight)}·${elemTex(arms.botRight)})에는 전류가 흐르지 않으므로,`,
      `  좌측의 ${elemTex(arms.topLeft)} → ${elemTex(arms.mid)} → ${elemTex(arms.botLeft)}만 남는 **단일 직렬 루프**가 된다.`,
      `  전체 임피던스 Z = ${zSumTex([arms.topLeft, arms.mid, arms.botLeft])} = ${rectTex(a.Zloop)}[Ω]이고, 전압 분배로`,
      `  **${sub1} = V_s·(${elemTex(arms.mid)})/(${rectTex(a.Zloop)}) = ${rectTex(a.VL1)} = ${polarTex(a.VL1)}[V]**.`,
      `[단계 2] 전압원을 단락하면 ${elemTex(arms.topLeft)}과 ${elemTex(arms.botLeft)}이 단락선을 통해 이어져`,
      `  가운데 가지와 **병렬**이 된다: Z_좌 = ${zSumTex([arms.topLeft, arms.botLeft])} = ${rectTex(a.Zleft)}[Ω].`,
      `  전류원이 흘려보내는 I_s는 이 두 경로로 나뉘므로 ${midKo} 양단 전압은 병렬 합성 임피던스에 걸린다:`,
      `  Z_p = (${elemTex(arms.mid)}) ∥ (${rectTex(a.Zleft)}) = ${rectTex(a.Zp)}[Ω] → **${sub2} = (${rectTex(a.Zp)})·I_s [V]**.`,
      `  ★ 우측 상·하단 소자(${elemTex(arms.topRight)}·${elemTex(arms.botRight)})는 **이상 전류원과 직렬**이라 전류가 이미 I_s로 정해져 있다.`,
      `   따라서 ${sub2}에도, 최종 답에도 전혀 영향을 주지 않는다.`,
      `[단계 3] 중첩의 원리로 ${vSym} = ${sub1} + ${sub2} 이고, 조건이 ${vSym} = 0이므로`,
      `  ${rectTex(a.VL1)} + (${rectTex(a.Zp)})·I_s = 0 → **I_s = −(${rectTex(a.VL1)})/(${rectTex(a.Zp)}) = ${rectTex(a.Is)} = ${polarTex(a.Is)}[A]**.`,
      `  검산: ${sub2} = (${rectTex(a.Zp)})·(${rectTex(a.Is)}) = ${rectTex(a.VL2)} 이므로 ${sub1} + ${sub2} = 0 ✓`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_null_src_${idx + 1}`,
        label: "2개의 교류 전원이 포함된 RLC 회로 (주파수 영역)",
        role: "original_circuit",
        diagramType: "ac_two_source_mesh_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 2전원 중첩 + **영(0) 조건으로 전원 역산** 감지 — 분류·route 안전망.
 *
 * ★ 실측(2026-08-05, 사용자 신고): 전용 항목이 없어 **generic `universal_ac`** 로 떨어졌고
 *   생성물의 정답이 **"(query 없음)"**, 풀이는 "AC 정상상태 phasor 해석 — 입력 ω = 10000 rad/s"라는
 *   placeholder였다(figure도 generic analog_netlist). **validator는 issues=0으로 통과** —
 *   generic 경로 실패의 전형(CLAUDE.md `ac_superposition_source_design`·`oscilloscope_phase_l`과 동일).
 *
 * 판별선 = **어떤 소자 양단 전압이 0이 되는 조건 + 전원 값 역산**(형제는 0이 아닌 목표 페이저를 준다).
 *   형제 양보: 평균전력·테브난/최대전력·공진·역률·스위치 과도·오실로스코프·Δ-Y.
 * ★ 같은 매처를 분류기와 **공유**한다(복제 금지 — 한쪽만 고쳐져 조용히 드리프트한다).
 */
export function detectAcSuperpositionNullSource(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;
  const signals = nullSourceSignalsFromInventory(analysis.componentInventory);
  if (!matchesNullSourceSignature(text, signals)) return false;
  // 낱말로 드러난 영(0) 조건이 없으면 **인벤토리의 미지 전류원 기호**로 잡는다(실측 신고 회차).
  if (!matchesNullSourceAsk(text) && !matchesNullSourceUnknownSource(text, signals)) return false;
  if (yieldsNullSourceToSibling(text)) return false;
  return true;
}
