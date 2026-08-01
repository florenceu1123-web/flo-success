import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateSupermeshSwitchedDependent } from "@/lib/generation/topologies/supermeshSwitchedDependent";
import { generateInParallel } from "./_common";
import {
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runSupermeshSwitchedDependentPipeline");

/**
 * 스위치 2-state + 종속전류원 + supermesh (임용 8번 회로이론) — 결정론 파이프라인. GPT 없음.
 *  [단계1] (가) SW 개방 → V₁·I₁,  [단계2] (나) SW 단락 → supermesh로 V₂·I₂.
 *  figure 2개: (가) state_before / (나) state_after.
 */
export async function runSupermeshSwitchedDependentPipeline(args: {
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateSupermeshSwitchedDependent({ seed, mode });
    const v = gen.values, o = gen.open, c = gen.closed;
    log.info("supermesh_switched_dependent_generated", { values: v, open: o, closed: c });

    const gR = v.g * v.R2;
    const V2open = (Vs => Vs / (3 - gR))(v.Vs); // = o.V1 / 2

    const content = [
      "그림 (가)와 그림 (나)는 전원과 저항 및 스위치가 포함된 회로이다.",
      "제시된 〈해석 절차〉에 따라 단계별로 풀이 과정과 함께 결과를 서술하시오.",
    ].join(" ");

    const conditions = [
      `상단 직렬: ${v.Vs}V 전원 ─R₁(${v.R1}Ω)─ V₁ ─R₂(${v.R2}Ω)─ V₂ ─R₃(${v.R3}Ω)─ (우외곽 도선) ─ 접지.`,
      `V₁ 마디 아래: 종속전류원 ${v.g}V₂ (가운데 마디 V₂에 비례, 위로 주입).`,
      `V₂ 마디 아래: 스위치 SW ─ ${v.R4}Ω ─ 전류원 ${v.Is}A 직렬.  (가) SW 열림 / (나) SW 닫힘.`,
    ];

    const question = [
      "[단계 1] 스위치 SW가 열려 있는 그림 (가)의 회로에서 V₁[V]과 I₁[A]을 각각 구한다.",
      "[단계 2] 스위치 SW가 닫혀 있는 그림 (나)의 회로에서 점선 a로 나타낸 초메쉬(supermesh)를 이용하여 V₂[V]와 I₂[A]를 각각 구한다.",
    ].join("\n");

    const answer = [
      `[단계 1] V₁ = ${o.V1} V,  I₁ = ${o.I1} A`,
      `[단계 2] V₂ = ${c.V2} V,  I₂ = ${c.I2} A`,
    ].join("\n");

    const solution = [
      `[단계 1] (가) SW 개방 → ${v.Is}A 전류원 가지 단선. 종속전류원 ${v.g}V₂가 V₁ 마디로 전류 주입.`,
      `  · V₂ 마디 KCL: (V₁−V₂)/${v.R2} = V₂/${v.R3}  ⟹  V₁ = 2·V₂  (R₂=R₃).`,
      `  · V₁ 마디 KCL: (${v.Vs}−V₁)/${v.R1} + ${v.g}V₂ = (V₁−V₂)/${v.R2}.  V₁=2V₂ 대입 ⟹ V₂ = ${v.Vs}/(3−${gR}) = ${V2open}V,  V₁ = ${o.V1}V.`,
      `  · I₁ = (${v.Vs}−V₁)/R₁ = (${v.Vs}−${o.V1})/${v.R1} = ${o.I1}A.`,
      `[단계 2] (나) SW 단락 → ${v.Is}A 가지 활성. 점선 a 초메쉬(I₂·I₃ 묶음): 공유 가지의 전류원으로 I₃ − I₂ = ${v.Is}.`,
      `  · 마디식 정리 ⟹ V₂ = (${v.Vs} + 2·${v.Is}·${v.R2})/(3−${gR}) = ${c.V2}V,  V₁ = ${c.V1}V.`,
      `  · I₁ = (${v.Vs}−${c.V1})/${v.R1} = ${c.I1}A,  I₂ = (${c.V1}−${c.V2})/${v.R2} = ${c.I2}A,  I₃ = ${c.V2}/${v.R3} = ${c.I3}A.`,
      `  · 검산: I₃ − I₂ = ${c.I3} − ${c.I2} = ${v.Is} = I_s ✓`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_open_${i + 1}`,
        label: "(가) 스위치 SW 열림",
        role: "state_before",
        diagramType: "supermesh_switched_dependent_circuit",
        diagram: gen.diagramOpen,
      },
      {
        id: `fig_closed_${i + 1}`,
        label: "(나) 스위치 SW 닫힘 — 초메쉬 a",
        role: "state_after",
        diagramType: "supermesh_switched_dependent_circuit",
        diagram: gen.diagramClosed,
      },
    ];

    void mode;
    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
