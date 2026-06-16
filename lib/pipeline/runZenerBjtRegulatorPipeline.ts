import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateZenerBjtRegulator } from "@/lib/generation/topologies/zenerBjtRegulator";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runZenerBjtRegulatorPipeline");

/**
 * 제너다이오드 + BJT 전압 레귤레이터 (임용 8번 전자회로) — 결정론 파이프라인. GPT 없음.
 *  (가) 회로 + 3단계 풀이(V_o, I_1·I_z, R_4).
 *  ★ generic bjt 경로는 "포화영역" 키워드로 특성곡선으로 오분류 → 전용 archetype.
 */
export async function runZenerBjtRegulatorPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateZenerBjtRegulator({ seed });
    const v = gen.values;
    const a = gen.answer;
    log.info("zener_bjt_regulator_generated", {
      Vin: v.Vin, Vz: v.Vz, R1: v.R1, IL: v.IL_mA,
      Vo: a.Vo, I1mA: a.I1mA, IzmA: a.IzmA, R4: a.R4,
    });

    const content = [
      `그림 (가)는 제너다이오드가 포함된 트랜지스터 응용회로이다.`,
      `회로가 안정화된 후, 전류 I_L이 ${v.IL_mA}[mA]가 되도록 제시된 <해석 절차>에 따라 각 단계별 풀이과정과 함께 결과를 구하시오.`,
      `(단, 제너전압 V_z=${v.Vz}[V], 트랜지스터는 포화영역에서 동작하며 계산과정에서 V_BE=${v.Vbe}[V], V_CE=0[V]로 한다.)`,
    ].join(" ");

    const conditions = [
      `입력 ${v.Vin}V, R_1=${v.R1}Ω, R_2=${v.R2}Ω, R_3=${v.R3}Ω, R_4는 미지 (학생 도출)`,
      `제너전압 V_z=${v.Vz}V, V_BE=${v.Vbe}V, V_CE=0V (포화영역)`,
      `부하 전류 I_L=${v.IL_mA}mA (안정화 후)`,
    ];

    const question = [
      `[단계 1] 출력전압 V_o [V]를 구한다.`,
      `[단계 2] 전류 I_1 [mA]와 I_z [mA]를 구한다.`,
      `[단계 3] 저항 R_4 [Ω]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] V_o = ${a.Vo} V`,
      `[단계 2] I_1 = ${a.I1mA} mA,  I_z = ${a.IzmA} mA`,
      `[단계 3] R_4 = ${a.R4} Ω`,
    ].join("\n");

    const solution = [
      `[단계 1] 트랜지스터 베이스-이미터 도통(V_BE=${v.Vbe}V) + 제너 항복(V_z=${v.Vz}V)으로 출력단이 안정화된다.`,
      `  ⇒ V_o = V_z + V_BE = ${v.Vz} + ${v.Vbe} = ${a.Vo} [V].`,
      `[단계 2] R_1 양단: I_1 = (V_in − V_o)/R_1 = (${v.Vin} − ${a.Vo})/${v.R1} = ${a.I1mA} [mA].`,
      `  출력 노드 KCL: I_1 = I_L + I_z (제너·트랜지스터 션트 전류).`,
      `  ⇒ I_z = I_1 − I_L = ${a.I1mA} − ${v.IL_mA} = ${a.IzmA} [mA].`,
      `[단계 3] 부하 R_3∥R_4 양단 = V_o, 부하 전류 I_L: R_3∥R_4 = V_o/I_L = ${a.Vo}/${v.IL_mA / 1000} = ${a.Rload} [Ω].`,
      `  ⇒ 1/R_4 = 1/(R_3∥R_4) − 1/R_3 → R_4 = (R_load·R_3)/(R_3 − R_load) = ${a.R4} [Ω].`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_zener_bjt_${i + 1}`,
        label: "(가) 제너다이오드 + BJT 전압 레귤레이터",
        role: "original_circuit",
        diagramType: "zener_bjt_regulator_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return {
      id: randomUUID(),
      content, conditions, question, answer, solution,
      topicKey, figureVariants,
    };
  });
}
