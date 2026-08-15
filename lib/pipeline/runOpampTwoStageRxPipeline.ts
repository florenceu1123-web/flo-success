import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampTwoStageRx } from "@/lib/generation/topologies/opampTwoStageRxDesign";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampTwoStageRxPipeline");

/**
 * 2단 OPAMP 응용회로 — 저항 R_X 설계 + 출력 전압 (임용 2번 전자회로) — 결정론 파이프라인. GPT 없음.
 *  유사: V_X가 목표값이 되는 R_X와 그때의 V_o   /   변형: V_o가 목표값이 되는 R_X와 그때의 V_X.
 */
export async function runOpampTwoStageRxPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  const variant = mode === "exam_variant";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampTwoStageRx({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("opamp_two_stage_rx_generated", {
      mode, V1: v.V1, Ra: v.Ra, Rb: v.Rb,
      plusInputs: v.plusInputs.map((x) => `${x.v}V/${x.r}k`).join("+"),
      Rd: v.Rd, Re: v.Re, Rf: v.Rf, Rg: v.Rg, Rx: a.Rx, Vx: a.Vx, Vo: a.Vo,
    });
    const inTex = v.plusInputs.map((x, idx) => `V_${idx + 2}=${x.v}[V]—${x.r}[kΩ]`).join(", ");
    const sumTerms = v.plusInputs.map((x) => `${x.v}/${x.r}`).join(" + ");
    const gTerms = v.plusInputs.map((x) => `1/${x.r}`).join(" + ");

    const targetText = variant
      ? `전압 \\( V_o = ${a.Vo}\\,[\\mathrm{V}] \\)가 되기 위한 저항 \\( R_X\\,[\\mathrm{k\\Omega}] \\)과 전압 \\( V_X\\,[\\mathrm{V}] \\)`
      : `전압 \\( V_X = ${a.Vx}\\,[\\mathrm{V}] \\)가 되기 위한 저항 \\( R_X\\,[\\mathrm{k\\Omega}] \\)과 전압 \\( V_o\\,[\\mathrm{V}] \\)`;
    const content =
      `그림은 연산 증폭기를 응용한 회로이다. ${targetText}를 구하여 순서대로 쓰시오. ` +
      `(단, 연산 증폭기는 이상적으로 동작한다.)`;

    const conditions = [
      `1단(U₁): 전압원 ${v.V1}[V] — ${v.Ra}[kΩ] — 반전 입력 단자(−), 반전 입력 단자와 출력 V_X 사이에 피드백 저항 ${v.Rb}[kΩ]`,
      `1단(U₁): 3개의 전압원이 각각 저항을 거쳐 비반전 입력 단자(+)에 연결 — ${inTex}`,
      `1단(U₁): 비반전 입력 단자(+)와 접지 사이에 저항 R_X[kΩ]`,
      `2단(U₂): V_X — ${v.Rd}[kΩ] — 비반전 입력 단자(+), 비반전 입력 단자와 접지 사이에 ${v.Re}[kΩ]`,
      `2단(U₂): 접지 — ${v.Rf}[kΩ] — 반전 입력 단자(−), 반전 입력 단자와 출력 V_o 사이에 피드백 저항 ${v.Rg}[kΩ]`,
      `출력 V_o에 부하 저항 ${v.RL}[kΩ]이 접지와 연결 (이상 OPAMP이므로 V_o에 영향 없음)`,
    ];

    const question = variant
      ? [
          `[단계 1] 2단(U₂)의 전압 이득을 이용하여, \\( V_o = ${a.Vo}\\,[\\mathrm{V}] \\)가 되기 위한 \\( V_X\\,[\\mathrm{V}] \\)를 구한다.`,
          `[단계 2] 1단(U₁)의 가상 단락을 이용하여, [단계 1]의 \\( V_X \\)가 되기 위한 비반전 입력 단자의 전압 \\( V_+\\,[\\mathrm{V}] \\)를 구한다.`,
          `[단계 3] [단계 2]의 결과와 전압 분배를 이용하여 저항 \\( R_X\\,[\\mathrm{k\\Omega}] \\)를 구한다.`,
        ].join("\n")
      : [
          `[단계 1] 1단(U₁)의 가상 단락을 이용하여, \\( V_X = ${a.Vx}\\,[\\mathrm{V}] \\)가 되기 위한 비반전 입력 단자의 전압 \\( V_+\\,[\\mathrm{V}] \\)를 구한다.`,
          `[단계 2] [단계 1]의 결과와 전압 분배를 이용하여 저항 \\( R_X\\,[\\mathrm{k\\Omega}] \\)를 구한다.`,
          `[단계 3] 2단(U₂)의 전압 이득을 이용하여 출력 전압 \\( V_o\\,[\\mathrm{V}] \\)를 구한다.`,
        ].join("\n");

    const answer = variant
      ? [
          `[단계 1] V_X = ${a.Vx} [V]`,
          `[단계 2] V_+ = ${a.Vplus} [V]`,
          `[단계 3] R_X = ${a.Rx} [kΩ]  →  답: R_X = ${a.Rx} [kΩ], V_X = ${a.Vx} [V]`,
        ].join("\n")
      : [
          `[단계 1] V_+ = ${a.Vplus} [V]`,
          `[단계 2] R_X = ${a.Rx} [kΩ]`,
          `[단계 3] V_o = ${a.Vo} [V]  →  답: R_X = ${a.Rx} [kΩ], V_o = ${a.Vo} [V]`,
        ].join("\n");

    const kRatio = v.Rb / v.Ra;
    const stage1 =
      `1단은 반전 입력에 ${v.V1}[V]가 ${v.Ra}[kΩ]로, 출력 V_X가 ${v.Rb}[kΩ]로 연결된 구조다. ` +
      `이상 OPAMP이므로 입력 단자에 전류가 흐르지 않고 V₋ = V₊(가상 단락)이다. ` +
      `반전 단자 KCL: (${v.V1} − V₋)/${v.Ra} + (V_X − V₋)/${v.Rb} = 0  →  ` +
      `V_X = V₊·(1 + ${v.Rb}/${v.Ra}) − ${v.V1}·(${v.Rb}/${v.Ra}) = ${1 + kRatio}·V₊ − ${v.V1 * kRatio}.`;
    const stage1Rx =
      `비반전 단자에는 3개의 입력이 각자의 저항을 거쳐 모이고 R_X가 접지로 내려간다. 입력 단자로 흐르는 전류가 0이므로 ` +
      `Σ(V_i − V₊)/R_i = V₊/R_X  →  V₊ = (Σ V_i/R_i)/(1/R_X + Σ 1/R_i). ` +
      `Σ V_i/R_i = ${sumTerms} = ${a.sumIn}[mA], Σ 1/R_i = ${gTerms} = ${a.sumG}[1/kΩ]이므로 ` +
      `1/R_X = ${a.sumIn}/${a.Vplus} − ${a.sumG} = ${Math.round((a.sumIn / a.Vplus - a.sumG) * 1000) / 1000}  →  R_X = ${a.Rx} [kΩ].`;
    const stage2 =
      `2단은 V_X가 ${v.Rd}[kΩ]과 ${v.Re}[kΩ]로 분배되어 비반전 단자에 인가되고(V₊₂ = V_X·${v.Re}/(${v.Rd}+${v.Re}) = ${a.Vplus2}[V]), ` +
      `반전 단자는 접지에 ${v.Rf}[kΩ], 출력에 ${v.Rg}[kΩ]로 연결된 **비반전 증폭기**(이득 1 + ${v.Rg}/${v.Rf} = ${a.gain2})이다. ` +
      `→ V_o = ${a.gain2} × ${a.Vplus2} = ${a.Vo} [V]. (부하 ${v.RL}[kΩ]은 이상 OPAMP의 출력 전압에 영향을 주지 않는다.)`;

    const solution = variant
      ? [
          `[단계 1] ${stage2.replace(`= ${a.Vo} [V]`, `= ${a.Vo} [V]가 되려면 V₊₂ = ${a.Vplus2}[V]`)}`,
          `  V₊₂ = V_X·${v.Re}/(${v.Rd}+${v.Re})이므로 V_X = ${a.Vx} [V].`,
          `[단계 2] ${stage1}  V_X = ${a.Vx}이므로 V₊ = (${a.Vx} + ${v.V1 * kRatio})/${1 + kRatio} = ${a.Vplus} [V].`,
          `[단계 3] ${stage1Rx}`,
        ].join("\n")
      : [
          `[단계 1] ${stage1}  V_X = ${a.Vx}이므로 V₊ = (${a.Vx} + ${v.V1 * kRatio})/${1 + kRatio} = ${a.Vplus} [V].`,
          `[단계 2] ${stage1Rx}`,
          `[단계 3] ${stage2}`,
        ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_optsrx_${i + 1}`,
        label: "2단 연산 증폭기 응용 회로 (R_X 설계)",
        role: "original_circuit",
        diagramType: "opamp_two_stage_rx_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 2단 OPAMP + 저항 R_X 설계 감지 — 분류·route 안전망(stale analysis 방어).
 *
 * ★ 실측(2026-08-02): 이 원본이 generic `analog_netlist` 경로로 떨어져 **없던 전원(V₃·V_ref)과
 *   가변저항이 생기고 두 OPAMP 배선이 무너진** 회로가 생성됐다.
 *
 * 구조 시그니처: OPAMP 맥락 + **저항을 구한다**(설계) + 목표 전압(V_X 또는 V_o) + 2단(또는 OPAMP 2개).
 *   · 형제 양보: 전달함수(V_o/V_i)·발진기·필터/대역폭·적분기/미분기·정전압(제너)·유한이득/블록도·루프이득.
 */
export function detectOpampTwoStageRx(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const inv = analysis.componentInventory ?? [];
  const nOp = inv.filter((c) => String(c.type ?? "").toUpperCase() === "OPAMP").length;
  const opampCtx = nOp >= 1 || /연산\s*증폭기|op[\s-]?amp|opamp|가상\s*단락|이상적인?\s*연산/.test(text);
  if (!opampCtx) return false;

  // 형제 양보 — 각자 전용 archetype이 있는 유형들.
  if (/전달\s*함수|주파수\s*응답|발진|오실레이터|필터|대역폭|차단\s*주파수|적분기|미분기|슈미트|비교기/.test(text)) return false;
  if (/제너|정전압|레귤레이터|개방\s*루프|개루프|블록\s*선도|블록도|루프\s*이득|특성\s*방정식|안정/.test(text)) return false;

  // 이 유형의 요구 — **저항을 구한다(설계)** + 목표 전압.
  //   ★ 미지 저항 R_X는 inventory 값("Rx[kΩ]")에만 남는 회차도 있다(실측) → 값도 함께 본다.
  const rxSig = /r_?x/i.test(text) || inv.some((c) => /r_?x/i.test(String(c.value ?? "")));
  const designR = rxSig || /저항\s*(값)?\s*(을|를)?\s*(구|결정|산출)|저항의?\s*값/.test(text);
  const targetV = /가\s*되기\s*위한|되도록|목표|출력\s*전압|v_?x|v_?o/.test(text);
  if (!(designR && targetV)) return false;

  // 2단 구조 — inventory OPAMP 2개, 텍스트("2단"), 또는 ★구조 신호★(미지 R_X + 중간 V_X + 출력 V_o).
  //   ★ Vision이 OPAMP를 inventory에 안 넣고 "연산 증폭기"를 단수로 쓰는 회차 대응(실측).
  const midOut = (/v_?x\b/i.test(text) || /중간\s*전압|1단\s*출력/.test(text)) && /v_?o\b/i.test(text);
  const twoStage =
    nOp >= 2 || /2\s*단|두\s*개의\s*연산\s*증폭기|이단|u_?1.*u_?2|1단.*2단/.test(text) || (rxSig && midOut);
  return twoStage;
}
