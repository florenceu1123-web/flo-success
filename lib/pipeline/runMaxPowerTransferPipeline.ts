import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateMaxPowerTransfer } from "@/lib/generation/topologies/maxPowerTransfer";
import { generateTheveninDual } from "@/lib/generation/topologies/thevenin";
import { generateViTheveninMaxPower } from "@/lib/generation/topologies/viTheveninMaxPower";
import { writeMaxPowerTransferText } from "@/lib/generation/topologies/maxPowerTransferTextWriter";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runMaxPowerTransferPipeline");

export async function runMaxPowerTransferPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  // ★ 2전압원 + 2전류원 테브난+최대전력 (임용 5번) — 전용 archetype.
  //   generic max_power(vi_two_source)는 이 2V+2I 구조를 잃음 → viTheveninMaxPower로 충실 재현.
  //   3단계: [1] 개방→V_c, [2] 단락→I_ab, [3] 테브난 등가+R_L=R_th·P_L. 결정론 텍스트.
  const p = analysis?.circuitType?.params;
  // ★ params(vSourceCount·iSourceCount)가 없거나(stale 분석) 0이어도 inventory의 V·I 개수로 보강.
  const inv = analysis?.componentInventory ?? [];
  const up = (t: unknown) => String(t ?? "").toUpperCase();
  const vN = Math.max(p?.vSourceCount ?? 0, inv.filter((c) => up(c.type) === "V").length);
  const iN = Math.max(p?.iSourceCount ?? 0, inv.filter((c) => up(c.type) === "I").length);
  if (vN >= 2 && iN >= 2) {
    return generateInParallel(count, async (i, seed) => {
      const gen = generateViTheveninMaxPower({ seed });
      const a = gen.answer;
      log.info("vi_thevenin_maxpower_generated", { Vc: a.Vc, Iab: a.IabMa, Rth: a.Rth, Pmax: a.PmaxMw, values: gen.values });
      const text = {
        content: [
          `그림은 전압원과 전류원이 포함된 회로이다. 단자 a–b에 부하 저항 R_L이 연결되어 있다.`,
          `제시된 <해석 절차>에 따라 각 단계별로 풀이과정과 함께 결과를 구하시오.`,
        ].join(" "),
        conditions: [
          `상단: ${gen.values.R1 / 1000}kΩ — 마디 c — ${gen.values.R2 / 1000}kΩ — 단자 a`,
          `좌측 직렬 전압원 ${gen.values.V1}V, ${gen.values.V2}V; 마디 c에 전류원 ${gen.values.Iup}mA(↑)·${gen.values.Idown}mA(↓)`,
          `단자 a–b에 부하 R_L (테브난 등가 + 최대전력 전달)`,
        ],
        question: [
          `[단계 1] 단자 a–b를 개방하였을 때, 마디 c에서의 전압[V]를 구한다.`,
          `[단계 2] 단자 a–b를 단락하였을 때, 마디 a에서 마디 b로 흐르는 전류[A]를 구한다.`,
          `[단계 3] [단계 1]·[단계 2]로 테브난 등가회로를 구하고, 최대 전력 전달이 되도록 R_L[Ω]과 부하 전력 P_L[W]을 구한다.`,
        ].join("\n"),
        answer: [
          `[단계 1] V_c = ${a.Vc} V (= V_th, a 개방이라 R₂에 전류 없어 V_a=V_c)`,
          `[단계 2] I_ab = ${a.IabMa} mA (= 단락전류 I_sc)`,
          `[단계 3] R_th = ${a.Rth / 1000}kΩ, R_L = ${a.RL / 1000}kΩ, P_L = ${a.PmaxMw} mW`,
        ].join("\n"),
        solution: [
          `[단계 1] a 개방 → R₂ 무전류 → V_a=V_c. 마디 c KCL: (V_TL−V_c)/R₁ + (${gen.values.Iup}−${gen.values.Idown})mA = 0.`,
          `  V_TL=${gen.values.V1}+${gen.values.V2}=${gen.values.V1 + gen.values.V2}V → V_c = ${a.Vc}V = V_th.`,
          `[단계 2] a–b 단락 → 마디 c KCL에 R₂(c→a=b) 추가 → V_c 재계산 → I_ab = V_c/R₂ = ${a.IabMa}mA = I_sc.`,
          `[단계 3] R_th = V_th/I_sc = R₁+R₂ = ${a.Rth / 1000}kΩ. 최대전력: R_L=R_th=${a.RL / 1000}kΩ, P_L=V_th²/(4R_th)=${a.PmaxMw}mW.`,
        ].join("\n"),
      };
      return {
        id: randomUUID(),
        content: text.content,
        conditions: text.conditions,
        question: text.question,
        answer: text.answer,
        solution: text.solution,
        topicKey,
        figureVariants: [{
          id: `fig_vimax_${i + 1}`,
          label: "주어진 회로 (단자 a–b 부하)",
          role: "original_circuit",
          diagramType: "vi_thevenin_maxpower_circuit" as const,
          diagram: gen.circuitDiagram,
        }],
      };
    });
  }

  // ★ 기출변형유형 = 쌍대(dual): 테브난형 최대전력(V_th·R_th, R_L=R_th) → 노턴형 최대전력(I_N·R_N, R_L=R_N).
  //   P_max = I_N²·R_N/4 (= V_th²/(4R_th)의 쌍대). 결정론 텍스트.
  if (mode === "exam_variant") {
    return generateInParallel(count, async (i, seed) => {
      const gen = generateTheveninDual({ seed });
      const In = gen.answer.In, Rn = gen.answer.Rn;
      const RLopt = Rn;                                   // 최대전력 전달: R_L = R_N
      const Pmax = Math.round((In * In * Rn / 4) * 1000) / 1000; // I_N²·R_N/4 (W)
      const v = gen.values;
      log.info("max_power_dual_generated", { In, Rn, RLopt, Pmax, values: v });
      const text = {
        content: [
          `그림은 직류 전류원(I₁=${v.I1}A)과 두 저항(R₁=${v.R1d}Ω, R₂=${v.R2d}Ω)으로 구성된 회로의 단자 a–b에 부하 R_L을 연결한 것이다.`,
          `이는 테브난형 최대전력 전달 문제(전압원·직렬 R)의 **쌍대 회로**(전류원·병렬 R, 노턴형)이다.`,
          `R_L에 최대 전력이 전달되도록 하는 R_L과 그때의 최대 전력 P_max를 구하시오.`,
        ].join(" "),
        conditions: [
          `노턴 형식: 전류원 I₁=${v.I1}A ∥ R₁=${v.R1d}Ω, R₂=${v.R2d}Ω 직렬 → 단자 a–b`,
          `쌍대 관계: 전압원↔전류원, 직렬 R↔병렬 R, 테브난↔노턴, V_th²/(4R_th)↔I_N²·R_N/4`,
        ],
        question: [
          `[단계 1] 단자 a–b에서 본 노턴 등가(I_N, R_N)를 구한다.`,
          `[단계 2] 최대전력 전달 조건 R_L과 최대 전력 P_max를 구한다.`,
        ].join("\n"),
        answer: [
          `[단계 1] I_N = ${In} A,  R_N = ${Rn} Ω`,
          `[단계 2] R_L = R_N = ${RLopt} Ω,  P_max = ${Pmax} W`,
        ].join("\n"),
        solution: [
          `[단계 1] a–b 단락전류 I_N = I₁·R₁/(R₁+R₂) = ${In} A. 전원 죽이고 본 저항 R_N = R₂+R₁ = ${Rn} Ω.`,
          `[단계 2] 최대전력 전달: R_L = R_N = ${RLopt} Ω. 이때 부하 전류 = I_N/2, P_max = (I_N/2)²·R_L = I_N²·R_N/4 = ${Pmax} W.`,
          `  (★ 테브난형 P_max=V_th²/(4R_th)의 쌍대. V_th=${v.Vth}V·R_th=${v.Rth}Ω → I_N=V_th/R₀·R_N=R₀²/R_th, R₀=${v.R0}.)`,
        ].join("\n"),
      };
      return assembleProblem({
        text, netlist: gen.netlist,
        figureLabel: "주어진 회로 (노턴형 부하, 쌍대)", figureRole: "original_circuit",
        figureIdSuffix: i + 1, topicKey,
      });
    });
  }

  return generateInParallel(count, async (i, seed) => {
    const gen = generateMaxPowerTransfer({ params: analysis?.circuitType?.params, seed });
    log.info("max_power_generated", {
      archetype: gen.archetype,
      Vth: gen.answer.Vth, Rth: gen.answer.Rth,
      RLopt: gen.RLopt, Pmax: gen.Pmax,
      values: gen.values,
    });
    const text = await writeMaxPowerTransferText({ generation: gen, mode, topicLabel, contextHint });
    return assembleProblem({
      text, netlist: gen.netlist,
      figureLabel: "주어진 회로 (단자 a-b 부하)", figureRole: "original_circuit",
      figureIdSuffix: i + 1, topicKey,
    });
  });
}
