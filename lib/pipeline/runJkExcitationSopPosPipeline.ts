import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateJkExcitationSopPos } from "@/lib/generation/topologies/jkExcitationSopPos";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runJkExcitationSopPosPipeline");

/**
 * JK-FF 2개 상태 여기표 + 조합 논리 J_A(SOP→POS) (2025 전기 A-8) 감지 — generate 단계 안전망.
 *
 * 시그니처(표현 무관): JK 플립플롭 + 여기표/상태표 + 조합 논리 불함수(논리식·최소항·간략화) 문맥.
 *   ★ 양보: 2×1 MUX(dff_mux_sequential)·D 플립플롭 설계(dff_state_design)·상태도 출력 y(fsm)·
 *     카운터(jk_sync_counter)는 각자 archetype 소관.
 */
export function detectJkExcitationSopPos(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const hasJk = /j-?k\s*플립|jk\s*플립|j-?k\s*flip|jk-ff/.test(text);
  // ★ Vision이 FF 종류를 D로 오독하는 일이 잦다(실측) → "여기(표)"를 주 판별자로.
  const hasExcitation = /여기표|상태\s*여기|여기\s*표|여기\s*도|상태\s*여표|excitation/.test(text);
  const hasFf = hasJk || /플립플롭|flip[\s-]?flop/.test(text);
  const hasTask = /플립플롭\s*입력|입력을\s*(구|결정)|논리\s*회로.{0,10}완성|불\s*함수|논리식|최소항|간략화|조합\s*논리/.test(text);
  const hasStateTable = /상태\s*표|상태\s*전이표|상태\s*천이표/.test(text);
  const hasBooleanTask = /불\s*함수|부울\s*함수|논리식|최소항|최대항|간략화|간소화|합의\s*곱|곱의\s*합|분배\s*법칙|sop|pos/.test(text);
  // 형제 archetype 양보
  if (/mux|멀티플렉서|다중화기|2×1|2x1/.test(text)) return false;
  if (/카운터|counter|계수기/.test(text)) return false;
  // D/T 플립플롭 명시는 **여기 신호가 없을 때만** 양보 근거로 쓴다(D 오독 방어).
  if (!hasExcitation && /d\s*플립플롭|d-ff|t\s*플립플롭|t-ff/.test(text)) return false;

  // ★ 출력 함수 y·z가 있는 Mealy/Moore 상태도 형식은 fsm(임용 9번 전자)에 양보.
  if (/출력\s*[yz]\b|출력\s*함수|출력\s*논리식/.test(text)) return false;
  // "여기(표)"는 이 유형 고유 신호 — D-FF는 D=다음 상태라 여기표가 필요 없다.
  return (hasExcitation && hasFf && hasTask) || (hasJk && hasStateTable && hasBooleanTask);
}

/**
 * JK 여기표 + 조합 논리 J_A (2025 전기 A-8) — 결정론 파이프라인. GPT 없음.
 *  [1] 여기표 빈칸 ㉠~㉣, [2] J_A 최소 SOP, [3] 분배 법칙 → 합의 곱(POS).
 */
export async function runJkExcitationSopPosPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateJkExcitationSopPos({ seed, mode });
    const a = gen.answer;
    const tgt = gen.values.target;   // 유사=J_A(원본) / 변형=K_A(구하는 양 교환)
    log.info("jk_excitation_sop_pos_generated", {
      mode, target: tgt, nextA: gen.values.nextA.join(""), sop: a.sop, pos: a.pos,
      sopCount: gen.values.sopCount, posCount: gen.values.posCount,
    });

    const content = [
      "표 (가)는 어떤 순서 논리 회로의 상태 여기표이고, 그림 (나)는 (가)에 대한 순서 논리 회로이다.",
      `(나)의 논리 회로를 완성하기 위한 불 함수 ${tgt}를 제시된 〈설계 절차〉에 따라 단계별로 구하여 서술하시오.`,
      "(단, 모든 소자는 이상적으로 동작한다.)",
    ].join(" ");

    const conditions = [
      "(가) 상태 여기표: 현재 상태 Q_A(t)·Q_B(t)와 입력 x(t)에 대한 플립플롭 입력(J_A K_A, J_B K_B)과 다음 상태 Q_A(t+1)·Q_B(t+1).",
      "(나) 회로: J-K 플립플롭 2개(FF_A·FF_B)와 조합 논리 회로 ㉲. FF_B의 J_B·K_B는 HIGH(1)에 연결되고, 두 플립플롭은 공통 클럭(CLK)으로 동작한다.",
      "㉲의 입력은 x와 두 플립플롭의 출력 Q_A·Q_B이며, 출력은 J_A·K_A이다.",
      "여기표의 '×'는 무관(don't care) 항이다.",
    ];

    const question = [
      "[단계 1] 표 (가)의 상태 여기표에서 ㉠과 ㉡에 해당하는 J_A K_A와, ㉢과 ㉣에 해당하는 Q_A(t+1) Q_B(t+1)을 각각 구한다.",
      `[단계 2] [단계 1]의 결과를 이용하여, 그림 (나)의 ㉲에 해당하는 조합 논리 회로를 완성하기 위한 불 함수 ${tgt}를 간략화된 최소항의 합으로 구한다.`,
      `[단계 3] [단계 2]에서 구한 ${tgt}에 분배 법칙을 적용하여 합의 곱으로 변환한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ㉠ = ${a.blank1},  ㉡ = ${a.blank2},  ㉢ = ${a.blank3},  ㉣ = ${a.blank4}`,
      `[단계 2] ${tgt} = ${a.sop}`,
      `[단계 3] ${tgt} = ${a.pos}`,
    ].join("\n");

    const solution = [
      "[단계 1] J-K 플립플롭의 여기표(현재→다음 상태에 필요한 입력)를 적용한다: " +
        "0→0이면 J=0·K=×, 0→1이면 J=1·K=×, 1→0이면 J=×·K=1, 1→1이면 J=×·K=0. " +
        `이를 해당 행에 적용하면 ㉠ = ${a.blank1}, ㉡ = ${a.blank2}이다. ` +
        "㉢·㉣은 반대로 주어진 J·K로 다음 상태를 구한다 — FF_B는 J_B=K_B=1(HIGH)이므로 Q_B는 매 클럭 반전되고, " +
        `FF_A는 주어진 J_A·K_A로 결정되어 ㉢ = ${a.blank3}, ㉣ = ${a.blank4}이다.`,
      `[단계 2] 여기표의 ${tgt} 열을 (Q_A, Q_B, x) 3변수 카르노맵에 옮긴다. ` +
        `'×'(무관) 항을 1로 활용해 묶으면 최소항의 합은 ${tgt} = ${a.sop}이다.`,
      `[단계 3] 분배 법칙 X + YZ = (X+Y)(X+Z)를 반복 적용해 곱의 합을 합의 곱으로 바꾸면 ${tgt} = ${a.pos}이다. ` +
        "(같은 함수를 카르노맵의 0-셀로 묶어 얻은 결과와 일치한다.)",
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_jkexc_table_${i + 1}`,
        label: "(가) 상태 여기표",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.tableDiagram,
      },
      {
        id: `fig_jkexc_circuit_${i + 1}`,
        label: "(나) 순서 논리 회로 (J-K 플립플롭 2개 + 조합 논리 ㉲)",
        role: "implementation_circuit",
        diagramType: "jk_excitation_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
