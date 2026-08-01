import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateTheveninDepVoltage,
  writeTheveninDepVoltageText,
} from "@/lib/generation/topologies/theveninDepVoltage";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runTheveninDepVoltagePipeline");

/**
 * 종속 **전압원**(k·v_x) + 테브난 등가(시험 전원 1A법) (임용 6번 회로이론) 감지 — dispatch 게이트.
 *
 * ★ 실측 신고(2026-07-29): 전용 generator·renderer·smoke가 **이미 만들어져 있었는데 route 배선이
 *   빠져 있어**(dispatch 없음) 화면엔 한 번도 나오지 않았다. 대신 generic `thevenin_dependent_generic`
 *   이 종속 전압원을 **저항 기호로** 그린 netlist를 냈다(사용자 화면 캡처).
 *
 * 시그니처: 종속 **전압원**(VCVS 또는 k·v_x 값) + 테브난 등가 + 부하 R_L.
 *   ★ 양보: 종속 **전류원**(CCCS/k·i_x)·스위치·인덕터/커패시터(과도) 유형은 각자 archetype 소관.
 */
export function detectTheveninDepVoltageProblem(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const inv = analysis.componentInventory ?? [];
  const up = (t: unknown) => String(t ?? "").toUpperCase();
  const val = (c: { value?: string | null }) => String(c.value ?? "").toLowerCase();

  // 과도(스위치·L·C)면 이 유형이 아니다 — 정상상태 DC 저항망 + 종속 전압원.
  if (inv.some((c) => ["L", "C", "SW"].includes(up(c.type)))) return false;
  if (/스위치|과도|t\s*=\s*0|시정수|인덕터|커패시터/.test(text)) return false;

  // 종속 **전압원**: VCVS 타입 또는 값이 k·v_x 형태. (전류 제어 k·i_x는 양보)
  const depVoltage =
    inv.some((c) => up(c.type) === "VCVS" || (up(c.type) === "V" && /\d\s*v_?[a-z]/.test(val(c)))) ||
    /종속\s*전압원|종속전압원|dependent\s*voltage/.test(text);
  const depCurrentOnly =
    !depVoltage &&
    (inv.some((c) => ["CCCS", "VCCS"].includes(up(c.type))) || /종속\s*전류원/.test(text));
  if (!depVoltage || depCurrentOnly) return false;

  const thevenin = /테브난|thevenin|등가\s*회로|등가회로|r_?th|v_?th/.test(text);
  const load = /부하|r_?l\b|양단\s*전압|단자\s*a/.test(text);
  return thevenin && load;
}

/**
 * 종속 전압원 + 테브난 등가(시험 전원 1A법) (임용 6번 회로이론) — 결정론 파이프라인. GPT 없음.
 *  [1] 시험 전류원 1A로 R_TH, [2] 개방전압 V_TH, [3] V_L·I_L.
 *  figure: (가) 원본(VCVS 포함) + (나) 테브난 등가 — 둘 다 전용 fixed-slot 렌더러가 그린다.
 */
export async function runTheveninDepVoltagePipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  const variant = mode === "exam_variant";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateTheveninDepVoltage({ seed, variant });
    const text = writeTheveninDepVoltageText({ generation: gen });
    const v = gen.values, s = gen.solution;
    log.info("thevenin_dep_voltage_generated", {
      mode, Vs: v.Vs, R1: v.R1, Rx: v.Rx, k: v.k, RL: v.RL, rth: s.rth, vth: s.vth, vL: s.vL, iL: s.iL,
    });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_thevdep_ga_${i + 1}`,
        label: "(가) 종속 전압원을 포함한 회로 (점선 = 테브난 대상)",
        role: "original_circuit",
        diagramType: "analog_netlist",
        diagram: gen.gaNetlist,
      },
      {
        id: `fig_thevdep_na_${i + 1}`,
        label: "(나) 테브난 등가 회로",
        role: "equivalent_circuit",
        diagramType: "analog_netlist",
        diagram: gen.naNetlist,
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
    } satisfies GeneratedProblem;
  });
}
