import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateSwitchedRlDepI, writeSwitchedRlDepIText } from "@/lib/generation/topologies/switchedRlDepI";
import { generateInParallel } from "./_common";
import type { AnalysisResult, FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runSwitchedRlDepIPipeline");

/** 값이 "다른 전류(iₙ·i_A 등)에 비례"하면 종속 전류원으로 본다 (Vision이 type=I로 추출해도). */
const DEP_CURRENT_VALUE = /\d\s*[·*x×]?\s*i[_·]?[a-zA-Z]/;

/**
 * 스위치 RL + 종속 전류원(k·iₙ, CCCS) 과도응답 (임용 2024 전기 B-5) 검출.
 *
 * ★ Vision 비결정성 대응: 종속 전류원이 type="I" value="10iₙ"로 추출되거나(값으로 판별),
 *   스위치 component가 누락돼도(텍스트로 판별) 잡는다. 기존 switched_rl_dependent(CCVS)와
 *   달리 "종속 전류원(CCCS)" 케이스를 노린다.
 */
export function detectSwitchedRlDepI(analysis: AnalysisResult | null | undefined): boolean {
  if (!analysis) return false;
  // ※ subjectKey 게이팅은 호출부(route)에서 (분석 응답의 analysis.subjectKey가 비어있는 경우가 있음).
  const inv = analysis.componentInventory ?? [];
  const txt = [
    analysis.topic ?? "", analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
  // ★ 인덕터: inventory가 흔들려도 텍스트("인덕터·코일·5[H]·i_L")로 인정 (2026-07-29 실측 —
  //   같은 원본이 실행에 따라 inventory에서 L·종속원을 놓쳐 generic rl_step으로 샜다).
  const hasL =
    inv.some((c) => String(c.type).toUpperCase() === "L") ||
    /인덕터|코일|\[h\]|\bH\]|i_?l\b/i.test(txt);
  if (!hasL) return false;
  // 종속 전류원 감지 — Vision 비결정성 대응으로 3중 신호:
  //   (a) CCCS 타입, (b) I 소스의 값이 제어 전류에 비례(10iₙ 등), (c) 텍스트에 "종속 전류원".
  const hasDepCurrent =
    inv.some((c) => {
      const t = String(c.type).toUpperCase();
      if (t === "CCCS") return true;
      return t === "I" && DEP_CURRENT_VALUE.test(String(c.value ?? ""));
    }) ||
    /종속\s*전류원|종속전류원|종속\s*전원|종속\s*소스|dependent\s*(current\s*)?source|제어\s*전류원/.test(txt) ||
    // 제어량 표기(10i_n·10i_a·2i_x…)가 본문에 그대로 남는 경우 — inventory 누락 방어.
    /\d+\s*i_?[a-zA-Z]\b/.test(txt);
  if (!hasDepCurrent) return false;
  // 스위치: inventory SW 또는 텍스트(스위치·개방·t=0)
  const hasSwitch = inv.some((c) => String(c.type).toUpperCase() === "SW") || /스위치|개방|스위칭|t\s*=\s*0/.test(txt);
  return hasSwitch;
}

/**
 * 스위치 RL + 종속 전류원 과도응답 (임용 2024 전기 B-5) — 고정 토폴로지 archetype.
 *   generic rl_step 경로가 종속 전류원·스위치를 잃고 단순 RL로 변질하는 문제 회피.
 */
export async function runSwitchedRlDepIPipeline(args: {
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { count, topicKey, mode } = args;
  const variant = mode === "exam_variant";
  return generateInParallel(count, async (i, seed) => {
    const gen = generateSwitchedRlDepI({ seed, variant });
    log.info("switched_rl_dep_i_generated", {
      Vs: gen.values.Vs, R1: gen.values.R1, Rr: gen.values.Rr, k: gen.values.k, L: gen.values.L,
      iL0: gen.solution.iL0, iRinf: gen.solution.iRinf, tau: gen.solution.tau,
    });
    const text = writeSwitchedRlDepIText({ generation: gen });
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_main_${i + 1}`,
        label: "주어진 회로 (스위치 RL + 종속 전류원)",
        role: "original_circuit",
        diagramType: "analog_netlist",
        diagram: gen.netlist,
      },
    ];
    return {
      id: randomUUID(),
      content: text.content,
      conditions: text.conditions,
      question: text.question,
      answer: text.answer,
      solution: text.solution,
      topicKey,
      figureVariants,
    };
  });
}
