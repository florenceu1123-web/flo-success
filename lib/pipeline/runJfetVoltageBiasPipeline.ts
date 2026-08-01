import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateJfetVoltageBias } from "@/lib/generation/topologies/jfetVoltageBias";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runJfetVoltageBiasPipeline");

/**
 * JFET 전압(분압) 바이어스 (임용 2번) 감지 — 라우팅용.
 *
 * ★ 실측 신고(2026-08-01): 이 원본이 `mosfet_bias`로 dispatch돼 **소스 접지 NMOS + 제곱법칙**
 *   (I_D=K(V_GS−V_TH)²) 문제로 변질됐다. 분압 저항 2개·소스 저항이 통째로 사라졌다.
 *   JFET는 코드 어디에도 없던 **미구현 유형**이었다.
 *
 * 시그니처: "JFET"(또는 접합형 전계효과)는 매우 독특한 낱말이라 그것만으로 확정한다.
 *   ★ 양보: MOSFET/증가형·공핍형 MOS 문맥이면 기존 mosfet 계열에 넘긴다(JFET 명시가 우선).
 */
export function detectJfetVoltageBias(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
    (analysis.componentInventory ?? []).map((c) => `${c?.type ?? ""} ${c?.value ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const isJfet = /jfet|j-fet|제이펫|접합형?\s*전계\s*효과|접합\s*전계효과/.test(text);
  if (!isJfet) return false;
  // JFET가 명시됐는데 MOSFET 얘기만 하는 경우는 없다 — JFET 명시가 우선한다.
  return true;
}

/**
 * JFET 전압 바이어스 (임용 2번) — 결정론 파이프라인. GPT 없음.
 *  유사: V_G와 R_D를 구한다 (원본과 같은 요구)
 *  변형: R_D가 주어지고 V_G와 V_DS를 구한다 (구하는 양 교환)
 */
export async function runJfetVoltageBiasPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateJfetVoltageBias({ seed, mode });
    const v = gen.values, dv = gen.derived, lb = gen.labels;
    const variant = mode === "exam_variant";
    log.info("jfet_voltage_bias_generated", {
      mode, vdd: v.vdd, r1k: v.r1k, r2k: v.r2k, vgs: v.vgs, rsk: v.rsk,
      vg: dv.vg, vs: dv.vs, idMa: dv.idMa, rdk: v.rdk, vd: v.vd, vds: dv.vds,
    });

    const V = (x: number) => `${trim(x)}\\,[\\mathrm{V}]`;
    const note = `(단, JFET는 이상적으로 동작하고, 게이트 전류는 무시한다.)`;

    const content = variant
      ? `그림은 JFET 전압 바이어스 회로이다. JFET의 게이트-소스 전압 \\( V_{GS} = ${V(v.vgs)} \\)이고 드레인 저항 \\( R_D = ${lb.rd} \\)일 때, 게이트 전압 \\( V_G\\,[\\mathrm{V}] \\)와 드레인-소스 전압 \\( V_{DS}\\,[\\mathrm{V}] \\)를 구하여 순서대로 쓰시오. ${note}`
      : `그림은 JFET 전압 바이어스 회로이다. JFET의 드레인 전압 \\( V_D = ${V(v.vd)} \\)이고 게이트-소스 전압 \\( V_{GS} = ${V(v.vgs)} \\)일 때, 게이트 전압 \\( V_G\\,[\\mathrm{V}] \\)와 드레인 저항 \\( R_D\\,[\\Omega] \\)를 구하여 순서대로 쓰시오. ${note}`;

    const conditions = [
      `전원 \\( V_{DD} = ${V(v.vdd)} \\)`,
      `분압 저항 \\( R_1 = ${lb.r1} \\) (전원 쪽), \\( R_2 = ${lb.r2} \\) (접지 쪽)`,
      `소스 저항 \\( R_S = ${lb.rs} \\)`,
      variant
        ? `\\( V_{GS} = ${V(v.vgs)} \\), \\( R_D = ${lb.rd} \\)`
        : `\\( V_{GS} = ${V(v.vgs)} \\), \\( V_D = ${V(v.vd)} \\)`,
    ];

    const question = variant
      ? [
          `[단계 1] 분압 저항 \\( R_1, R_2 \\)에 의한 게이트 전압 \\( V_G\\,[\\mathrm{V}] \\)를 구한다.`,
          `[단계 2] [단계 1]의 결과와 \\( V_{GS} \\)를 이용하여 소스 전압 \\( V_S\\,[\\mathrm{V}] \\)와 드레인 전류 \\( I_D\\,[\\mathrm{mA}] \\)를 구한다.`,
          `[단계 3] [단계 2]의 결과를 이용하여 드레인 전압 \\( V_D \\)와 드레인-소스 전압 \\( V_{DS}\\,[\\mathrm{V}] \\)를 구한다.`,
        ].join("\n")
      : [
          `[단계 1] 분압 저항 \\( R_1, R_2 \\)에 의한 게이트 전압 \\( V_G\\,[\\mathrm{V}] \\)를 구한다.`,
          `[단계 2] [단계 1]의 결과와 \\( V_{GS} \\)를 이용하여 소스 전압 \\( V_S\\,[\\mathrm{V}] \\)와 드레인 전류 \\( I_D\\,[\\mathrm{mA}] \\)를 구한다.`,
          `[단계 3] [단계 2]의 결과와 \\( V_D \\)를 이용하여 드레인 저항 \\( R_D\\,[\\Omega] \\)를 구한다.`,
        ].join("\n");

    const answer = variant
      ? [
          `[단계 1] \\( V_G = ${V(dv.vg)} \\)`,
          `[단계 2] \\( V_S = ${V(dv.vs)} \\), \\( I_D = ${trim(dv.idMa)}\\,[\\mathrm{mA}] \\)`,
          `[단계 3] \\( V_D = ${V(v.vd)} \\), \\( V_{DS} = ${V(dv.vds)} \\)`,
        ].join("\n")
      : [
          `[단계 1] \\( V_G = ${V(dv.vg)} \\)`,
          `[단계 2] \\( V_S = ${V(dv.vs)} \\), \\( I_D = ${trim(dv.idMa)}\\,[\\mathrm{mA}] \\)`,
          `[단계 3] \\( R_D = ${lb.rd} \\)`,
        ].join("\n");

    const solution = [
      `[단계 1] 게이트 전류를 무시하므로 \\( R_1, R_2 \\)에는 같은 전류가 흐른다(단순 분압). ` +
        `\\( V_G = V_{DD}\\dfrac{R_2}{R_1+R_2} = ${trim(v.vdd)}\\times\\dfrac{${v.r2k}}{${v.r1k}+${v.r2k}} = ${V(dv.vg)} \\).`,
      `[단계 2] \\( V_{GS} = V_G - V_S \\)이므로 \\( V_S = V_G - V_{GS} = ${trim(dv.vg)} - (${trim(v.vgs)}) = ${V(dv.vs)} \\). ` +
        `게이트 전류가 0이라 \\( I_D = I_S = \\dfrac{V_S}{R_S} = \\dfrac{${trim(dv.vs)}}{${lb.rs}} = ${trim(dv.idMa)}\\,[\\mathrm{mA}] \\).`,
      variant
        ? `[단계 3] \\( V_D = V_{DD} - I_D R_D = ${trim(v.vdd)} - ${trim(dv.idMa)}\\,\\mathrm{mA}\\times${lb.rd} = ${V(v.vd)} \\)이므로 ` +
          `\\( V_{DS} = V_D - V_S = ${trim(v.vd)} - ${trim(dv.vs)} = ${V(dv.vds)} \\). ` +
          `\\( V_{DS} > |V_{GS}| \\)이므로 JFET는 핀치오프(포화) 영역에서 동작한다.`
        : `[단계 3] \\( R_D \\) 양단 전압은 \\( V_{DD} - V_D = ${trim(v.vdd)} - ${trim(v.vd)} = ${V(v.vdd - v.vd)} \\)이고 여기에 \\( I_D \\)가 흐르므로 ` +
          `\\( R_D = \\dfrac{V_{DD}-V_D}{I_D} = \\dfrac{${trim(v.vdd - v.vd)}}{${trim(dv.idMa)}\\,\\mathrm{mA}} = ${lb.rd} \\). ` +
          `(이때 \\( V_{DS} = V_D - V_S = ${V(dv.vds)} \\)로 핀치오프 영역에서 동작한다.)`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_jfet_${i + 1}`,
        label: "JFET 전압 바이어스 회로",
        role: "original_circuit",
        diagramType: "jfet_bias_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/** 소수점 잔재 없이 표기 (10.0 → 10). */
function trim(x: number): string {
  return String(Math.round(x * 1000) / 1000);
}
