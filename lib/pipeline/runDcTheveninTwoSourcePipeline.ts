import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateDcTheveninTwoSource } from "@/lib/generation/topologies/dcTheveninTwoSource";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDcTheveninTwoSourcePipeline");

/**
 * 2전압원 병렬가지 → 테브난 등가 (임용 3번 회로이론) — 결정론 파이프라인. GPT 없음.
 *  [1] R_T = R1∥R2, [2] V_T = R_T·(±V1/R1 ± V2/R2) (Millman).
 */
export async function runDcTheveninTwoSourcePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDcTheveninTwoSource({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("dc_thevenin_2src_generated", {
      mode, leg1: `${v.R1}Ω+${v.s1 > 0 ? "" : "−"}${v.V1}V`, leg2: `${v.R2}Ω+${v.s2 > 0 ? "" : "−"}${v.V2}V`,
      Rt: a.Rt, Vt: a.Vt,
    });

    const sign = (s: 1 | -1) => (s > 0 ? "+" : "−");
    const millmanTerms = `${sign(v.s1)}${v.V1}/${v.R1} ${v.s2 > 0 ? "+" : "−"} ${v.V2}/${v.R2}`;

    let content: string, conditions: string[], question: string, answer: string, solution: string;
    let figLabelGa: string, figLabelNa: string;

    if (gen.withLoad) {
      // ★ 변형(전력): 2전압원 회로 + 부하 R_L 완성 회로 → 최대 전력 전달.
      content = [
        "그림 (가)는 2개의 전압원과 부하 R_L을 포함하는 완성된 회로이다.",
        "부하 R_L에 최대 전력이 전달되도록 할 때, 부하 R_L[Ω]과 그때 R_L에 전달되는 최대 전력 P_max[W]를 구하여 순서대로 쓰시오.",
      ].join(" ");
      conditions = [
        `(가): 단자 a–b 사이 2개 병렬 leg(leg1 = ${v.R1}[Ω]+${v.V1}[V](${sign(v.s1)}), leg2 = ${v.R2}[Ω]+${v.V2}[V](${sign(v.s2)})) + 부하 R_L.`,
        `(나): 좌측 회로의 테브난 등가(V_T 직렬 R_T) + 부하 R_L.`,
        `최대 전력 전달 조건: R_L = R_T, P_max = V_T²/(4·R_T).`,
      ];
      question = [
        `[단계 1] 단자 a–b에서 본 테브난 등가(R_T[Ω], V_T[V])를 구한다.`,
        `[단계 2] 부하 R_L에 최대 전력이 전달되기 위한 R_L[Ω]을 구한다.`,
        `[단계 3] 그때 R_L에 전달되는 최대 전력 P_max[W]를 구한다.`,
      ].join("\n");
      answer = [
        `[단계 1] R_T = R1∥R2 = ${a.Rt} Ω,  V_T = R_T·(${millmanTerms}) = ${a.Vt} V`,
        `[단계 2] R_L = R_T = ${a.Rl} Ω`,
        `[단계 3] P_max = V_T²/(4·R_T) = ${a.Vt}²/(4·${a.Rt}) = ${a.Pmax} W`,
      ].join("\n");
      solution = [
        `[단계 1] 전원 단락 → R_T = R1∥R2 = ${v.R1}·${v.R2}/(${v.R1}+${v.R2}) = ${a.Rt} Ω. 밀만 정리 → V_T = ${a.Rt}·(${millmanTerms}) = ${a.Vt} V.`,
        `[단계 2] 최대 전력 전달 정리: 부하가 테브난 저항과 같을 때 최대 → R_L = R_T = ${a.Rl} Ω.`,
        `[단계 3] 정합 시 부하 전류 I = V_T/(R_T+R_L) = V_T/(2R_T). P_max = I²·R_L = V_T²/(4·R_T) = ${a.Vt}²/(4·${a.Rt}) = ${a.Pmax} W.`,
      ].join("\n");
      figLabelGa = "(가) 2개 전압원 + 부하 R_L 완성 회로";
      figLabelNa = "(나) 테브난 등가 + 부하 R_L (최대 전력)";
    } else {
      // 유사: 2전압원 → 테브난 등가 (R_T·V_T 도출).
      content = [
        "그림 (가)는 2개의 전압원을 포함하는 회로이다.",
        "그림 (가)를 그림 (나)의 등가 회로로 변환하고자 할 때, R_T[Ω]과 V_T[V]를 구하여 순서대로 쓰시오.",
      ].join(" ");
      conditions = [
        `(가): 단자 a–b 사이 2개 병렬 leg. leg1 = ${v.R1}[Ω] + ${v.V1}[V](${sign(v.s1)}), leg2 = ${v.R2}[Ω] + ${v.V2}[V](${sign(v.s2)}).`,
        `(나): 테브난 등가 = V_T 직렬 R_T, 단자 a–b.`,
        `(단, 전원 극성은 +단자가 단자 a 쪽이면 +.)`,
      ];
      question = [
        `[단계 1] 단자 a–b에서 본 테브난 등가 저항 R_T[Ω]을 구한다. (전원 단락)`,
        `[단계 2] 단자 a–b의 개방 전압 = 테브난 전압 V_T[V]를 구한다.`,
      ].join("\n");
      answer = [
        `[단계 1] R_T = R1∥R2 = (${v.R1}·${v.R2})/(${v.R1}+${v.R2}) = ${a.Rt} Ω`,
        `[단계 2] V_T = R_T·(${millmanTerms}) = ${a.Vt} V`,
      ].join("\n");
      solution = [
        `[단계 1] 전원을 모두 단락하면 단자 a–b에서 R1과 R2가 병렬: R_T = R1·R2/(R1+R2) = ${v.R1}·${v.R2}/(${v.R1}+${v.R2}) = ${a.Rt} Ω.`,
        `[단계 2] 밀만(Millman) 정리 — 개방 단자 전압 V_T = R_T·(${millmanTerms}) = ${a.Vt} V. (각 가지 전류 기여 합을 컨덕턴스 합으로 나눈 값.)`,
      ].join("\n");
      figLabelGa = "(가) 2개 전압원 병렬 회로 (단자 a·b)";
      figLabelNa = "(나) 테브난 등가 회로 (V_T·R_T)";
    }

    const figureVariants: FigureVariant[] = [
      { id: `fig_dcthev_${i + 1}`, label: figLabelGa, role: "original_circuit", diagramType: "dc_thevenin_2src_circuit", diagram: gen.circuitDiagram },
      { id: `fig_dcthev_eq_${i + 1}`, label: figLabelNa, role: "equivalent_circuit", diagramType: "dc_thevenin_equiv_circuit", diagram: gen.equivDiagram },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
