import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateAcBridgeMaxPower } from "@/lib/generation/topologies/acBridgeMaxPower";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcBridgeMaxPowerPipeline");

/**
 * AC 휘트스톤 브리지 + 테브난 + 최대평균전력 (임용 7번) — 결정론 파이프라인. GPT 없음.
 *  [1] V_A·V_B (∴ V_TH), [2] Z_TH, [3] R_L=|Z_TH|·P_max.
 */
export async function runAcBridgeMaxPowerPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcBridgeMaxPower({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("ac_bridge_max_power_generated", {
      V: v.V, Z1: `-j${v.Xc1}`, Z3: `j${v.Xl}`, R: v.R2,
      VA: a.VA, VB: a.VB, VTH: a.VTH, Zth: `${a.Rpar}-j${a.Xpar}`, RL: a.RL, Pmax: a.Pmax,
    });

    const content = [
      "그림 (가)는 교류 전원이 포함된 RLC 회로이고, 그림 (나)는 (가)를 테브난 등가 회로로 변환한 것이다.",
      `부하가 순저항 R_L[Ω]일 때, 최대 평균 전력을 전달하기 위한 R_L[Ω]을 <해석 절차>에 따라 단계별로 구하여 순서대로 서술하시오.`,
      "(단, 커패시터의 초기 전압과 인덕터의 초기 전류는 0으로 가정한다.)",
    ].join(" ");

    const conditions = [
      `(가) 브리지: 교류원 V=${v.V}∠0°V. 좌상 −j${v.Xc1}Ω, 우상 ${v.R2}Ω, 좌하 j${v.Xl}Ω, 우하 ${v.R4}Ω. 부하 R_L이 단자 A–B를 가교.`,
      `V_A = 좌하(j${v.Xl}Ω) 양단 전압, V_B = 우하(${v.R4}Ω) 양단 전압.`,
      `(나)는 단자 A–B에서 본 테브난 등가(V_TH 직렬 Z_TH)에 R_L 연결.`,
    ];

    const question = [
      `[단계 1] 그림 (가)에서 단자 A와 B를 개방한 후, 전압 V_A[V]와 전압 V_B[V]를 구한다.`,
      `[단계 2] 그림 (가)에서 단자 A와 B를 개방한 후, 테브난 등가 임피던스 Z_TH[Ω]를 구한다.`,
      `[단계 3] [단계 1]·[단계 2]를 이용하여, 그림 (나)에서 순저항 부하 R_L에 최대 평균 전력을 전달하기 위한 R_L[Ω]을 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] V_A = ${a.VA}∠0° V,  V_B = ${a.VB}∠0° V  (∴ V_TH = V_A − V_B = ${a.VTH}∠0° V)`,
      `[단계 2] Z_TH = ${a.Rpar} − j${a.Xpar} Ω  (|Z_TH| = ${a.absZth} Ω)`,
      `[단계 3] R_L = |Z_TH| = ${a.RL} Ω,  P_max = ${a.Pmax} W`,
    ].join("\n");

    const solution = [
      `[단계 1] A–B 개방 → 좌·우 가지는 각각 독립 분압.`,
      `  V_A = V·(j${v.Xl})/(−j${v.Xc1}+j${v.Xl}) = ${v.V}·${v.Xl}/(${v.Xl}−${v.Xc1}) = ${a.VA}V.  V_B = V·${v.R4}/(${v.R2}+${v.R4}) = ${a.VB}V.`,
      `  ∴ V_TH = V_A − V_B = ${a.VTH}∠0°V.`,
      `[단계 2] 전원 단락 후 A–B에서 본 임피던스: Z_TH = (−j${v.Xc1} ∥ j${v.Xl}) + (${v.R2} ∥ ${v.R4}) = (−j${a.Xpar}) + ${a.Rpar} = ${a.Rpar}−j${a.Xpar}Ω. |Z_TH|=${a.absZth}Ω.`,
      `[단계 3] 순저항 부하 최대평균전력 조건: R_L = |Z_TH| = ${a.RL}Ω.`,
      `  P_max = |V_TH|²·R_L / ((R_TH+R_L)²+X_TH²) = ${a.VTH}²·${a.RL}/((${a.Rpar}+${a.RL})²+${a.Xpar}²) = ${a.Pmax}W.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_acbridge_${i + 1}`,
        label: "(가) 교류 브리지 회로 (단자 A·B에 부하 R_L)",
        role: "original_circuit",
        diagramType: "ac_bridge_circuit",
        diagram: gen.bridgeDiagram,
      },
      {
        id: `fig_acbridge_th_${i + 1}`,
        label: "(나) 테브난 등가 회로 (V_TH·Z_TH·R_L)",
        role: "equivalent_circuit",
        diagramType: "ac_bridge_thevenin_circuit",
        diagram: gen.theveninDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
