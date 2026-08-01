import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampFiniteGainOffset } from "@/lib/generation/topologies/opampFiniteGainOffset";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampFiniteGainOffsetPipeline");

/**
 * 유한 개방루프 이득 OPAMP + **출력단 오프셋 전압원 V_B** (임용 9번 전자회로) 감지 — 라우팅용.
 *
 * ★ 실측 신고(2026-07-30): 형제 `opamp_finite_gain_block`(임용 11번 — 블록도 + A(s)=A₀ω₀/(s+ω₀))로
 *   dispatch됐다. 두 유형 모두 "개방루프 이득 A₀"를 쓰지만, 이쪽의 정의적 특징은
 *   **출력단에 직렬로 놓인 전압원 V_B**와 관계식 **V_out = V_D − V_B**다.
 */
export function detectOpampFiniteGainOffset(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const opampCtx = /연산\s*증폭기|op[\s.\-]?amp|opamp/.test(text);
  const finiteGain = /개방\s*루프|개루프|open[\s-]?loop|a_?0\b|a₀/.test(text);
  // 출력단 오프셋 전압원 — 이 유형의 결정적 신호
  const offsetSrc =
    /v_?b\b|v₂?_b|출력.{0,12}(직류\s*)?전압원|직류\s*전압원.{0,10}직렬|v_?out\s*=\s*v_?d\s*[-−]|v_?d\s*[-−]\s*v_?b/.test(text);
  // ★ Vision이 V_B를 말로 안 쓰는 실행 대비 — 인벤토리 구조로도 잡는다.
  //   형제 opamp_finite_gain_block(임용 11번)은 전원이 V_in 하나뿐이다. 여기는 v_in + V_B로 **2개**.
  const inv = analysis.componentInventory ?? [];
  const cnt = (ty: string) => inv.filter((c) => String(c.type ?? "").toUpperCase() === ty).length;
  const twoSourceSig = cnt("OPAMP") >= 1 && cnt("V") >= 2 && cnt("R") >= 2 && cnt("C") === 0 && cnt("L") === 0;
  // 블록도·주파수 응답(형제 archetype) 문맥이면 양보
  if (/블록도|block\s*diagram|ω_?0|ω₀|차단\s*주파수|주파수\s*응답|a\(s\)/.test(text)) return false;
  // 루프이득·루프 절단·안정도(임용 12번)도 전원이 2개로 세어질 수 있다 — 형제에 양보.
  //   ★ substring 함정: "개루프 이득"·"개방 루프 이득" ⊃ "루프 이득" — 이 유형 자체가 개루프 이득을 쓴다.
  //     "비정현파 ⊃ 정현파" 선례와 동일하게 **형제 어구를 먼저 지우고** 검사한다(안 하면 자기 자신을 양보시킨다).
  const noOpen = text.replace(/개방\s*루프\s*이득|개루프\s*이득|open[\s-]?loop\s*gain|폐루프/g, " ");
  if (/루프\s*이득|loop\s*gain|귀환\s*루프를?\s*끊|좌반평면|특성\s*방정식/.test(noOpen)) return false;
  return opampCtx && finiteGain && (offsetSrc || twoSourceSig);
}

/**
 * 유한 이득 OPAMP + 출력 오프셋 V_B (임용 9번) — 결정론 파이프라인. GPT 없음.
 *  [1] β·V_D, [2] V_out 관계식, [3] 수치 대입.
 */
export async function runOpampFiniteGainOffsetPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampFiniteGainOffset({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("opamp_finite_gain_offset_generated", {
      mode, a0: v.a0, r1k: v.r1k, r2k: v.r2k, vb: v.vb, gain: a.gain, offset: a.offset,
    });

    const content =
      "그림의 회로에서 출력전압 \\( V_{out} \\)을 구하려고 한다. 제시된 〈해석 절차〉에 따라 각 단계별로 " +
      "풀이 과정과 함께 결과를 서술하시오. (단, 연산증폭기의 개루프 이득(open-loop gain)은 \\( A_0 \\)이고, " +
      "입력 임피던스는 무한대, 출력 임피던스는 0이라 가정한다.)";

    const conditions = [
      `되먹임 저항: \\( R_1 = ${v.r1k}\\,[\\mathrm{k\\Omega}] \\) (반전 단자–접지), \\( R_2 = ${v.r2k}\\,[\\mathrm{k\\Omega}] \\) (출력–반전 단자)`,
      `출력단에 직렬로 연결된 전압원 \\( V_B = ${v.vb}\\,[\\mathrm{V}] \\) — 즉 \\( V_{out} = V_D - V_B \\)`,
      `입력 \\( v_{in} = ${v.vinAmp}\\sin(${a.omegaText} t)\\,[\\mathrm{V}] \\), 개루프 이득 \\( A_0 = ${v.a0} \\)`,
    ];

    const question = [
      "[단계 1] 연산증폭기 반전 단자의 전압을 \\( V^- = \\beta V_{out} \\)으로 나타낼 때 \\( \\beta \\)를 구하고, " +
        "연산증폭기 출력단자 전압 \\( V_D \\)를 \\( A_0,\\ \\beta,\\ V_{in},\\ V_{out} \\)으로 나타낸다.",
      "[단계 2] \\( V_{out} = V_D - V_B \\)의 관계식을 이용하여 출력전압 \\( V_{out} \\)을 " +
        "\\( A_0,\\ \\beta,\\ V_{in},\\ V_B \\)로 나타낸다.",
      `[단계 3] 회로에서 \\( A_0 = ${v.a0} \\), \\( R_1 = ${v.r1k}\\,[\\mathrm{k\\Omega}] \\), ` +
        `\\( R_2 = ${v.r2k}\\,[\\mathrm{k\\Omega}] \\), \\( V_B = ${v.vb}\\,[\\mathrm{V}] \\), ` +
        `\\( v_{in} = ${v.vinAmp}\\sin(${a.omegaText} t)\\,[\\mathrm{V}] \\)일 때 \\( V_{out}\\,[\\mathrm{V}] \\)를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] \\( \\beta = \\dfrac{R_1}{R_1+R_2} = ${a.beta} \\), \\( V_D = A_0(V_{in} - \\beta V_{out}) \\)`,
      `[단계 2] \\( V_{out} = \\dfrac{A_0 V_{in} - V_B}{1 + A_0\\beta} \\)`,
      `[단계 3] \\( V_{out} = ${a.voutText}\\,[\\mathrm{V}] \\)`,
    ].join("\n");

    const solution = [
      `[단계 1] 입력 임피던스가 무한대이므로 R₁·R₂ 분압에 OPAMP 입력 전류가 흐르지 않는다. ` +
        `따라서 \\( V^- = \\dfrac{R_1}{R_1+R_2}V_{out} = ${a.beta}\\,V_{out} \\) 이고, ` +
        `개루프 이득 정의에서 \\( V_D = A_0(V^+ - V^-) = A_0(V_{in} - \\beta V_{out}) \\).`,
      `[단계 2] 출력단 직렬 전압원 때문에 \\( V_{out} = V_D - V_B \\)이다. 대입하면 ` +
        `\\( V_{out} = A_0 V_{in} - A_0\\beta V_{out} - V_B \\Rightarrow V_{out}(1 + A_0\\beta) = A_0V_{in} - V_B \\) ` +
        `\\( \\Rightarrow V_{out} = \\dfrac{A_0V_{in} - V_B}{1 + A_0\\beta} \\).`,
      `[단계 3] \\( \\beta = ${a.beta} \\Rightarrow 1 + A_0\\beta = ${a.denom} \\). ` +
        `이득 \\( \\dfrac{A_0}{1+A_0\\beta} = ${a.gain} \\), 오프셋 \\( \\dfrac{V_B}{1+A_0\\beta} = ${a.offset} \\)이므로 ` +
        `\\( V_{out} = ${a.voutText}\\,[\\mathrm{V}] \\).`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [{
      id: `fig_opampoffset_${i + 1}`,
      label: "유한 이득 OPAMP + 출력단 오프셋 전압원",
      role: "original_circuit",
      diagramType: "opamp_finite_gain_offset_circuit",
      diagram: gen.circuitDiagram,
    }];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
