import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateAcTheveninLadder } from "@/lib/generation/topologies/acTheveninLadder";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcTheveninLadderPipeline");

/**
 * 단일 AC원 L-C-R 사다리 + 테브난 등가 + 복소 켤레 최대평균전력 (임용 7번 회로이론) — 결정론 파이프라인. GPT 없음.
 *  [1] Z_TH·V_TH, [2] 복소 켤레 정합 Z_L=R_t+jX_L, [3] P_max=|V_TH|²/(4R_TH).
 */
export async function runAcTheveninLadderPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcTheveninLadder({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("ac_thevenin_ladder_generated", {
      mode, ser1: `${v.ser1Type}${v.ser1Mag}`, sh: `${v.shType}${v.shMag}`, ser2: `${v.ser2Type}${v.ser2Mag}`, Vs: v.Vs,
      Zth: a.ZthLabel, Vth: a.VthLabel, ZL: a.ZLLabel, Pmax: a.PmaxLabel,
    });

    const content = [
      "그림 (가)는 교류 전원이 포함된 RLC 회로를 페이저로 표현한 것이고, 그림 (나)는 (가)를 테브난 등가 회로로 변환한 것이다.",
      "부하 Z_L에 최대 전력을 전달하기 위한 복소 임피던스 Z_L과 이 부하에 전달되는 최대 평균 전력 P_L(max)를 <해석 절차>에 따라 단계별로 구하여 서술하시오.",
      "(단, 전원은 실효값(RMS) 페이저이다.)",
    ].join(" ");

    const conditions = [
      `(가) 사다리: 교류원 ${gen.ladderDiagram.vLabel}. 직렬 ${gen.ladderDiagram.ser1Label}(${v.ser1Type}) — 마디 — 션트 ${gen.ladderDiagram.shLabel}(${v.shType}) — 직렬 ${gen.ladderDiagram.ser2Label}(${v.ser2Type}) — 단자 a. b = 하단 도선.`,
      `(나)는 단자 a–b에서 본 테브난 등가(V_TH 직렬 Z_TH)에 복소 부하 Z_L 연결.`,
      `최대 전력 정합 조건: Z_L = Z_TH* (켤레 복소수) = R_t + jX_L.`,
    ];

    const question = [
      `[단계 1] 그림 (나)에서 테브난 등가 임피던스 Z_TH[Ω]와 테브난 등가 전압 V_TH[V]를 구한다.`,
      `[단계 2] [단계 1]의 결과를 이용하여, 부하 Z_L에 최대 전력이 전달되기 위한 복소 임피던스 Z_L = R_t + jX_L[Ω]을 구한다.`,
      `[단계 3] [단계 1]·[단계 2]의 결과를 이용하여, Z_L에 전달되는 최대 평균 전력 P_L(max)[W]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] Z_TH = ${a.ZthLabel},  V_TH = ${a.VthLabel}`,
      `[단계 2] Z_L = Z_TH* = ${a.ZLLabel}  (R_t = ${a.RL} Ω, X_L = ${a.XL} Ω)`,
      `[단계 3] P_L(max) = |V_TH|² / (4·R_TH) = ${a.VthMag}² / (4·${a.Rth}) = ${a.PmaxLabel}`,
    ].join("\n");

    const solution = [
      `[단계 1] 전원 단락 후 a–b에서 본 임피던스: Z_TH = Z_ser2 + (Z_ser1 ∥ Z_sh) = ${a.ZthLabel}.`,
      `  a–b 개방(부하 분리) 시 Z_ser2에 전류가 없어 V_a = 마디 전압 → V_TH = V·Z_sh/(Z_ser1+Z_sh) = ${a.VthLabel}.`,
      `[단계 2] 최대 평균 전력 전달 조건은 부하가 테브난 임피던스의 켤레 복소수일 때: Z_L = Z_TH* = ${a.ZLLabel}.`,
      `  (R_t = R_TH = ${a.RL} Ω, X_L = −X_TH = ${a.XL} Ω — 리액턴스 상쇄.)`,
      `[단계 3] 정합 시 전체 임피던스 = 2·R_TH(실수). 실효값 페이저이므로 P_L(max) = |V_TH|²/(4·R_TH) = ${a.PmaxLabel}.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_acthl_${i + 1}`,
        label: "(가) 교류 RLC 사다리 회로 (단자 a·b에 부하 Z_L)",
        role: "original_circuit",
        diagramType: "ac_thevenin_ladder_circuit",
        diagram: gen.ladderDiagram,
      },
      {
        id: `fig_acthl_eq_${i + 1}`,
        label: "(나) 테브난 등가 회로 (V_TH·Z_TH·Z_L)",
        role: "equivalent_circuit",
        diagramType: "ac_thevenin_equiv_circuit",
        diagram: gen.equivDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
