import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateInParallel } from "./_common";
import { buildStepAnswer, buildStepQuestion, THREE_STEP_TAIL } from "@/lib/format/threeStep";
import {
  generatePeriodicSignalDcRms,
  matchesPeriodicSignalDcRms,
  trigFnFromAnalysis,
} from "@/lib/generation/topologies/periodicSignalDcRms";
import type { AnalysisResult, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runPeriodicSignalDcRmsPipeline");

/**
 * 재검출 안전망 — 분류기와 **같은 매처**를 쓴다(복제 금지: 한쪽만 고치면 조용히 드리프트한다).
 * 브라우저가 stale circuitType(`unsupported`·`dc_nodal` 등)을 들고 있어도 여기서 잡는다.
 */
export function detectPeriodicSignalDcRms(analysis?: AnalysisResult | null): boolean {
  return matchesPeriodicSignalDcRms(analysis);
}

/**
 * 주기 신호의 직류값·실효값 (임용 36번) — 결정론 파이프라인. GPT 없음, **그림 없음**(원본과 동일).
 *
 * 원본이 객관식이므로 생성물은 3단계 단계별 주관식으로 낸다([[lib/format/threeStep]]).
 *   [단계 1] 항등식으로 직류 성분과 교류 성분 분리
 *   [단계 2] 직류값 V_dc
 *   [단계 3] 실효값 V_rms
 */
export async function runPeriodicSignalDcRmsPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, count, topicKey, mode } = args;
  const genMode: "exam_similar" | "exam_variant" = mode === "exam_variant" ? "exam_variant" : "exam_similar";
  const fn = trigFnFromAnalysis(analysis);
  log.info("dispatch", { mode: genMode, count, fn });

  return generateInParallel(count, async (i, seed) => {
    const gen = generatePeriodicSignalDcRms({ seed, mode: genMode, index: i, fn });
    const { values: v, answer: a } = gen;
    // ★ 발문·풀이는 **신호 형태**로 갈린다(모드가 아니라) — 변형이 sin²(제곱형)과
    //   직류 오프셋 정현파 두 가족을 함께 내기 때문이다.
    const offsetForm = v.form === "offset";

    const content =
      `다음은 주기 신호를 나타낸 수식이다.\n\\( ${gen.signal} \\)\n` +
      `이 신호의 직류값 \\( V_{dc}\\,[\\mathrm{V}] \\)와 실효값 \\( V_{rms}\\,[\\mathrm{V}] \\)를 구하려고 한다. ${THREE_STEP_TAIL}`;

    const conditions = [
      `신호: \\( ${gen.signal} \\)`,
      `직류값은 한 주기 동안의 **평균값**, 실효값은 **제곱 평균의 제곱근**으로 정의한다.`,
      `정현파의 한 주기 평균은 \\( 0 \\), 정현파 제곱의 한 주기 평균은 \\( \\dfrac{1}{2} \\)이다.`,
    ];

    const question = buildStepQuestion(
      offsetForm
        ? [
            "주어진 신호를 직류 성분과 교류 성분으로 분리하여, 각 성분의 크기를 쓰시오.",
            "이 신호의 직류값 \\( V_{dc}\\,[\\mathrm{V}] \\)를 구하시오.",
            "[단계 1]의 결과를 이용하여 실효값 \\( V_{rms}\\,[\\mathrm{V}] \\)를 구하시오.",
          ]
        : [
            `삼각함수 항등식 \\( \\${v.fn}^{2}\\theta = \\dfrac{1 ${v.fn === "cos" ? "+" : "-"} \\cos 2\\theta}{2} \\)를 이용하여, ` +
              "주어진 \\( v(t) \\)를 직류 성분과 교류 성분의 합으로 나타내시오.",
            "[단계 1]의 결과로부터 이 신호의 직류값 \\( V_{dc}\\,[\\mathrm{V}] \\)를 구하시오.",
            "이 신호의 실효값 \\( V_{rms}\\,[\\mathrm{V}] \\)를 구하시오.",
          ],
    );

    const answer = buildStepAnswer([
      offsetForm ? a.decomposed : `\\( ${a.decomposed} \\)`,
      `\\( V_{dc} = ${a.vdc}\\,[\\mathrm{V}] \\)`,
      `\\( V_{rms} = ${a.vrms}\\,[\\mathrm{V}] \\)`,
    ]);

    const m = v.A / 2;
    const solution = offsetForm
      ? [
          `[단계 1] 이미 직류 항과 교류 항의 합으로 주어져 있다: 직류 성분 \\( ${v.B}\\,[\\mathrm{V}] \\), ` +
            `교류 성분의 진폭 \\( ${v.A}\\,[\\mathrm{V}] \\). 교류 항의 한 주기 평균은 \\( 0 \\)이다.`,
          `[단계 2] 직류값은 한 주기 평균이므로 \\( V_{dc} = ${v.B}\\,[\\mathrm{V}] \\) (주파수·위상과 무관하다).`,
          `[단계 3] \\( \\overline{v^2} = ${v.B}^2 + \\dfrac{${v.A}^2}{2} = ${a.msq} \\)이므로 ` +
            // 근호가 더 간단해질 때만 "= 2√3"처럼 정리 과정을 덧붙인다("√22 = √22" 중복 방지).
            `\\( V_{rms} = \\sqrt{${a.msq}}${a.vrms === `\\sqrt{${a.msq}}` ? "" : ` = ${a.vrms}`}\\,[\\mathrm{V}] \\). ` +
            `(직류 성분과 교류 성분의 실효값이 직교하므로 \\( V_{rms}=\\sqrt{V_{dc}^2 + \\left(\\dfrac{A}{\\sqrt{2}}\\right)^2} \\).)`,
        ].join("\n")
      : [
          `[단계 1] \\( \\${v.fn}^{2}\\theta = \\dfrac{1 ${v.fn === "cos" ? "+" : "-"} \\cos 2\\theta}{2} \\)이므로 ` +
            `\\( ${a.decomposed} \\). 즉 직류 성분 \\( ${m} \\), 교류 성분의 진폭 \\( ${m} \\)이다.`,
          `[단계 2] 코사인 항의 한 주기 평균은 \\( 0 \\)이므로 \\( V_{dc} = ${m}\\,[\\mathrm{V}] \\) ` +
            `(각주파수 \\( ${v.wCoef}\\pi \\)와 위상에 무관하다).`,
          `[단계 3] \\( \\overline{v^2} = ${m}^2 + \\dfrac{${m}^2}{2} = \\dfrac{3}{2}\\cdot ${m}^2 \\)이므로 ` +
            `\\( V_{rms} = \\sqrt{\\dfrac{3}{2}}\\cdot ${m} = ${a.vrms}\\,[\\mathrm{V}] \\). ` +
            `(${v.fn === "cos" ? "코사인" : "사인"} 제곱의 한 주기 평균이 \\( \\dfrac{1}{2} \\)임을 이용.)`,
        ].join("\n");

    log.info("generated", {
      mode: genMode, form: v.form, fn: v.fn, A: v.A, B: v.B, wCoef: v.wCoef, vdc: a.vdc, vrms: a.vrms,
    });

    return {
      id: randomUUID(),
      content,
      conditions,
      question,
      answer,
      solution,
      topicKey: (topicKey ?? "dc_resistive") as TopicKey,
      figureVariants: [], // ★ 원본에 그림이 없다 — 회로를 지어내지 않는다.
    } satisfies GeneratedProblem;
  });
}
