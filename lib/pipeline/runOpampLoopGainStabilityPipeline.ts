import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateOpampLoopGainStability } from "@/lib/generation/topologies/opampLoopGainStability";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runOpampLoopGainStabilityPipeline");

/**
 * OPAMP 루프이득 L(s)=V_r/V_t + 특성방정식 좌반평면 안정도 (임용 12번 전자회로) 감지 — 라우팅용.
 *
 * ★ 형제 archetype이 "개방루프 이득 A(s)"를 공유하므로 **고유 신호**로만 잡는다:
 *   루프이득(loop gain)·V_r/V_t·루프 절단·특성방정식·좌반평면. 블록도(임용 11번)·SW step(임용 6번)엔 양보.
 */
export function detectOpampLoopGainStability(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const opampCtx = /연산\s*증폭기|op[\s.\-]?amp|opamp/.test(text);
  // ★ substring 함정: **"개루프 이득"·"개방 루프 이득" ⊃ "루프 이득"** — 형제(임용 9·11·6번)가 모두
  //   개루프 이득을 쓰므로, "비정현파 ⊃ 정현파" 선례처럼 **형제 어구를 먼저 지우고** 검사한다(실측).
  const noOpen = text.replace(/개방\s*루프\s*이득|개루프\s*이득|open[\s-]?loop\s*gain|폐루프/g, " ");
  const loopGain = /루프\s*이득|loop\s*gain|v_?r\s*\/\s*v_?t|귀환\s*루프를?\s*끊|루프를?\s*절단|break.{0,10}loop/.test(noOpen);
  const stability = /좌반평면|left\s*half|특성\s*방정식|characteristic\s*equation|안정(적|성|도)|stab(le|ility)|1\s*[-−]\s*l\(s\)/.test(text);
  // 형제 양보 — 발진(Wien·함수발생기)은 "발진 조건"(등식)이지 안정도 부등식이 아니다.
  if (/발진기|oscillat|wien|위상\s*천이|barkhausen/.test(text)) return false;
  return opampCtx && loopGain && stability;
}

/**
 * 임용 12번 전자회로 — 결정론 파이프라인 (GPT 없음).
 *   [1] V⁺·V⁻를 V_t로, [2] L(s)와 특성방정식 근, [3] 좌반평면 조건 → R_S·R 부등식.
 */
export async function runOpampLoopGainStabilityPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateOpampLoopGainStability({ seed, mode });
    const v = gen.values, a = gen.answer, L = gen.labels;
    log.info("opamp_loop_gain_stability_generated", {
      mode, a: v.a, f: v.f, p: v.p, invertingSource: v.invertingSource, ineq: a.ineqText,
    });

    const divName = v.invertingSource ? "V^{+}" : "V^{-}";
    const srcName = v.invertingSource ? "V^{-}" : "V^{+}";
    const divPin = v.invertingSource ? "비반전" : "반전";
    const srcPin = v.invertingSource ? "반전" : "비반전";

    const content =
      "그림 (가)는 연산 증폭기 응용 회로이고, 그림 (나)는 복소주파수 \\( s \\)의 함수인 루프이득 " +
      "\\( L(s) = \\dfrac{V_r}{V_t} \\)를 구하기 위하여 회로에서 입력 \\( V_s \\)를 제거한 후 귀환 루프를 끊고 " +
      "\\( V_t \\)를 인가하여 \\( V_r \\)을 얻는 회로이다. 그림 (가)의 회로가 **안정적인 선형증폭기**로 동작되기 위한 " +
      "저항 \\( R_S \\)와 \\( R \\)의 관계를 구하려고 한다. 제시된 〈해석 절차〉에 따라 각 단계별로 풀이 과정과 함께 " +
      "결과를 서술하시오. (단, 연산 증폭기의 입출력 전달특성은 \\( A(s) = \\dfrac{A_0\\omega_0}{s} \\)로 나타내며, " +
      "\\( A_0\\omega_0 \\)는 이득과 대역폭의 곱이다. 그 외의 연산 증폭기 특성은 이상적이라 가정한다.)";

    const conditions = [
      `${divPin} 단자 쪽 분압: \\( ${L.ra} \\)(단자↔접지)와 \\( ${L.rf} \\)(단자↔출력)`,
      `${srcPin} 단자 쪽: \\( R_S \\)(단자↔\\( V_s \\))와 \\( ${L.rp} \\)(단자↔출력) — ${v.invertingSource ? "부" : "정"}귀환 경로`,
      "연산 증폭기 개방루프 전달특성: \\( A(s) = A_0\\omega_0 / s \\) (그 외 특성은 이상적)",
    ];

    const question = [
      `[단계 1] 그림 (나)의 회로에서 \\( ${srcName} \\)와 \\( ${divName} \\)를 \\( V_t \\)로 나타내는 식을 각각 구한다.`,
      "[단계 2] [단계 1]에서 구한 \\( V^{+},\\ V^{-} \\)와 \\( A(s) \\)를 사용하여 루프이득 \\( L(s) \\)를 구하고, " +
        "특성방정식 \\( 0 = 1 - L(s) \\)의 근을 구한다.",
      "[단계 3] [단계 2]에서 구한 특성방정식의 근이 복소수 \\( s \\)의 좌반평면(left half s-plane)에 위치하는 조건으로 " +
        "저항 \\( R_S \\)와 \\( R \\)의 관계를 부등식으로 구한다.",
    ].join("\n");

    const answer = [
      `[단계 1] \\( ${divName} = ${a.betaText}\\,V_t \\), \\( ${srcName} = \\dfrac{R_S}{R_S + ${L.rp}}\\,V_t \\)`,
      `[단계 2] \\( L(s) = \\dfrac{A_0\\omega_0}{s}\\left(${a.kText}\\right) \\), 근 \\( ${a.rootText} \\)`,
      `[단계 3] \\( ${a.ineqText} \\)`,
    ].join("\n");

    const solution = [
      `[단계 1] 입력 임피던스가 무한대라 연산 증폭기 입력 전류는 0이다. (나)에서 \\( V_s \\)는 제거되어 ` +
        `\\( R_S \\)의 아래 끝이 접지이고, 귀환망은 \\( V_t \\)가 구동한다. 따라서 두 단자는 각각 단순 분압이다. ` +
        `\\( ${divName} = \\dfrac{${L.ra}}{${L.ra} + ${L.rf}}V_t = ${a.betaText}V_t \\), ` +
        `\\( ${srcName} = \\dfrac{R_S}{R_S + ${L.rp}}V_t \\).`,
      `[단계 2] 루프를 끊은 상태의 출력은 \\( V_r = A(s)\\,(V^{+} - V^{-}) \\)이므로 ` +
        `\\( L(s) = \\dfrac{V_r}{V_t} = A(s)\\left(${a.kText}\\right) = \\dfrac{A_0\\omega_0}{s}\\left(${a.kText}\\right) \\). ` +
        `특성방정식 \\( 0 = 1 - L(s) \\)에 대입하면 \\( s = A_0\\omega_0\\left(${a.kText}\\right) \\) — 실수 단일근이다.`,
      `[단계 3] \\( A_0\\omega_0 > 0 \\)이므로 근이 좌반평면(\\( \\mathrm{Re}\\,s < 0 \\))에 있으려면 괄호 안이 음수여야 한다. ` +
        `즉 \\( ${a.kText} < 0 \\) ⇒ ${v.invertingSource
          ? `\\( ${a.betaText} < \\dfrac{R_S}{R_S + ${L.rp}} \\)`
          : `\\( \\dfrac{R_S}{R_S + ${L.rp}} < ${a.betaText} \\)`} ` +
        `⇒ **\\( ${a.ineqText} \\)**. (부등식이 깨지면 근이 우반평면으로 이동해 발산 — 선형증폭기로 동작하지 못한다.)`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_oplg_a_${i + 1}`,
        label: "(가) 연산 증폭기 응용 회로",
        role: "original_circuit",
        diagramType: "opamp_loop_gain_circuit",
        diagram: gen.circuitA,
      },
      {
        id: `fig_oplg_b_${i + 1}`,
        label: "(나) 루프이득 측정 회로 (V_s 제거 + 루프 절단)",
        role: "equivalent_circuit",
        diagramType: "opamp_loop_gain_circuit",
        diagram: gen.circuitB,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
