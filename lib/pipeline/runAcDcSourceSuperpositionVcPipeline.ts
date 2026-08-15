import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  fracTex, generateAcDcSourceSuperpositionVc, matchesAcDcSourceSuperpositionVc, rootTex,
  type AcDcVcGeneration,
} from "@/lib/generation/topologies/acDcSourceSuperpositionVc";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem,
  type GenerationMode, type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runAcDcSourceSuperpositionVcPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다. */
export function detectAcDcSourceSuperpositionVc(a?: Partial<AnalysisResult> | null): boolean {
  return matchesAcDcSourceSuperpositionVc(a);
}

function buildText(g: AcDcVcGeneration) {
  const v = g.values, s = g.sol;
  const isVc = g.target === "vc";
  const sym = isVc ? "v_c(t)" : "i(t)";
  const unit = isVc ? "V" : "A";
  const wt = `${v.w}t`;
  const acAmp = isVc ? rootTex(s.vK) : rootTex(s.iK);
  const acPhase = isVc ? "135°" : "45°";
  const dcPart = isVc ? fracTex(s.vcDc) : "0";

  const content =
    `그림은 **교류 전압원과 직류 전류원이 함께 포함된** 회로이다. ` +
    (isVc
      ? `커패시터 양단 전압 v_c(t)[V]의 **정상상태** 값을 〈해석 절차〉에 따라 구하고자 한다.`
      : `가운데 가지에 흐르는 전류 i(t)[A]의 **정상상태** 값을 〈해석 절차〉에 따라 구하고자 한다.`);

  const conditions = [
    `교류 전압원은 v(t) = ${v.Vm}cos(${wt})[V]이고, 직류 전류원의 세기는 ${fracTex(v.Idc)}[A]이다.`,
    "모든 소자는 이상적이며, 회로는 충분히 오랜 시간이 지나 정상상태에 있다.",
    "중첩의 원리를 적용할 때 전압원은 단락, 전류원은 개방으로 대체한다.",
  ];

  const question = [
    "〈해석 절차〉에 따라 각 단계의 풀이 과정과 결과를 기술하시오.",
    "",
    `[단계 1] **직류 전류원만** 인가된 경우를 해석하여 ${sym}의 **직류 성분**을 구하시오. (이때 커패시터와 인덕터를 각각 어떻게 취급하는지 밝힐 것)`,
    `[단계 2] **교류 전압원만** 인가된 경우의 임피던스 Z를 구하고, 페이저 해석으로 ${sym}의 **교류 성분**을 구하시오.`,
    `[단계 3] **중첩의 원리**를 이용하여 ${sym}를 시간 함수로 나타내시오.`,
  ].join("\n");

  const answer = [
    `[단계 1] 커패시터는 직류를 차단(개방), 인덕터는 단락으로 본다. 가운데 가지에 직류 전류가 흐르지 않으므로 ` +
      (isVc
        ? `${fracTex(v.R2)}[Ω]과 ${fracTex(v.L2)}[H]에 강하가 없고, **직류 성분 = ${fracTex(v.Idc)} × ${fracTex(v.R1)} = ${dcPart}[V]**`
        : `**직류 성분 = 0[A]**`),
    "",
    `[단계 2] X_L = ${v.w}(${fracTex(v.L1)} + ${fracTex(v.L2)}) = ${fracTex(s.XL)}[Ω], X_C = 1/(${v.w}·${fracTex(v.C)}) = ${fracTex(s.XC)}[Ω]`,
    `  · Z = (${fracTex(v.R1)} + ${fracTex(v.R2)}) + j(${fracTex(s.XL)} − ${fracTex(s.XC)}) = ${fracTex(s.Rtot)} + j${fracTex(s.Rtot)} = ${rootTex(s.zK)}∠45°[Ω]`,
    `  · I = ${v.Vm}∠0° / ${rootTex(s.zK)}∠45° = ${rootTex(s.iK)}∠−45°[A]`,
    isVc
      ? `  · V_c = I·(−jX_C) = ${rootTex(s.iK)}∠−45° × ${fracTex(s.XC)}∠−90° = ${acAmp}∠−135°[V]`
      : `  · 교류 성분 = ${acAmp}cos(${wt} − 45°)[A]`,
    "",
    isVc
      ? `[단계 3] v_c(t) = ${dcPart} + ${acAmp}cos(${wt} − ${acPhase})[V]`
      : `[단계 3] i(t) = ${acAmp}cos(${wt} − ${acPhase})[A]  (직류 성분이 0이므로 교류 성분만 남는다)`,
  ].join("\n");

  const solution = [
    `[단계 1] 정상상태 직류 해석에서 **커패시터는 개방, 인덕터는 단락**이다.`,
    `커패시터가 직류를 차단하므로 ${fracTex(v.R2)}[Ω]·${fracTex(v.L2)}[H]가 있는 가운데 가지에는 직류 전류가 흐르지 않는다.`,
    `직류 전류원 ${fracTex(v.Idc)}[A]는 상단 도선 → ${fracTex(v.L1)}[H](단락) → ${fracTex(v.R1)}[Ω] → 전압원(단락) 경로로 흐르므로`,
    isVc
      ? `커패시터 양단에는 ${fracTex(v.R1)}[Ω]의 전압 강하가 그대로 나타나 **${dcPart}[V]** 가 된다.`
      : `가운데 가지의 직류 전류는 **0[A]** 이다 (이것이 이 문항의 핵심 관찰이다).`,
    "",
    `[단계 2] 교류 해석에서는 직류 전류원을 **개방**하므로 회로가 단일 직렬 루프가 된다.`,
    `X_L = ω(L₁+L₂) = ${fracTex(s.XL)}[Ω], X_C = 1/(ωC) = ${fracTex(s.XC)}[Ω]이므로`,
    `Z = ${fracTex(s.Rtot)} + j(${fracTex(s.XL)} − ${fracTex(s.XC)}) = ${fracTex(s.Rtot)}(1 + j) = ${rootTex(s.zK)}∠45°[Ω].`,
    `I = V/Z = ${v.Vm}∠0°/${rootTex(s.zK)}∠45° = ${rootTex(s.iK)}∠−45°[A].`,
    isVc
      ? `커패시터 임피던스가 −jX_C = ${fracTex(s.XC)}∠−90°이므로 V_c = I·(−jX_C) = ${acAmp}∠−135°[V]이고, 시간 함수로는 ${acAmp}cos(${wt} − 135°)[V]이다.`
      : `따라서 가운데 가지 전류의 교류 성분은 ${acAmp}cos(${wt} − 45°)[A]이다.`,
    "",
    `[단계 3] 회로가 선형이므로 두 성분을 더한다 — ${sym} = (직류 성분) + (교류 성분) = ${isVc ? `${dcPart} + ${acAmp}cos(${wt} − 135°)` : `${acAmp}cos(${wt} − 45°)`}[${unit}].`,
    isVc
      ? `★ 직류 성분이 ${dcPart}[V]로 남는 것은 커패시터가 직류를 차단해 전류원의 전류가 전부 ${fracTex(v.R1)}[Ω]을 지나기 때문이다.`
      : `★ 직류 성분이 0인 것은 커패시터가 직류를 차단하기 때문이다 — 전류원의 직류는 이 가지로 흐르지 못한다.`,
  ].join("\n");

  return { content, conditions, question, answer, solution };
}

export async function runAcDcSourceSuperpositionVcPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateAcDcSourceSuperpositionVc({ seed, index: i, mode });
    log.info("ac_dc_source_superposition_vc_generated", {
      mode, target: gen.target, values: gen.values, vcDc: gen.sol.vcDc, iK: gen.sol.iK,
    });
    const text = buildText(gen);
    const figureVariants: FigureVariant[] = [{
      id: `fig_circuit_${i + 1}`,
      label: "그림. 교류 전압원과 직류 전류원이 포함된 회로",
      role: "main_circuit",
      diagramType: "ac_dc_source_superposition_circuit",
      diagram: gen.circuitDiagram,
    }];
    return {
      id: randomUUID(),
      content: text.content, conditions: text.conditions, question: text.question,
      answer: text.answer, solution: text.solution, topicKey, figureVariants,
    };
  });
}
