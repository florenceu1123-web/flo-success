import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateDffStateDesign } from "@/lib/generation/topologies/dffStateDesign";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDffStateDesignPipeline");

/**
 * D-FF 2개 상태도 순차회로 설계 (임용 9번 정보과) 재검출 — generate 단계 안전망.
 *
 * ★ 프론트가 analysis를 React state에 캐시하므로 분류기를 고쳐도 이전 분석의
 *   stale circuitType(fsm·sequential_dff_generic 등)이 넘어오면 generic FSM으로 빠져
 *   ★있지도 않은 입력 X·출력 Z★가 있는 Mealy 문제로 변질된다(실측 신고).
 *   circuitType과 무관하게 텍스트 시그니처로 판정해 route에서 교정한다.
 *
 * 시그니처: 상태도/상태표 + (D 플립플롭 | 플립플롭+설계·게이트) + 자율 순환.
 *   ★ 양보: JK·T-FF·SR·MUX·비동기 리플(각자 전용 archetype),
 *          그리고 **실제 외부 입출력**(입력 X·출력 Z/y·외부 입력)이 있으면 generic FSM.
 *   ※ bare "mealy"/"moore"는 양보 근거로 쓰지 않는다 — Vision이 자율 순환 문제에도
 *     개념 태그로 붙이는 일이 잦다(이번 신고의 실제 원인).
 */
export function detectDffStateDesign(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const has = (...kw: string[]) => kw.some((k) => text.includes(k));

  const stateGraph = has("상태도", "상태 전이도", "상태전이도", "상태 천이도", "상태천이도", "상태표", "상태 표", "state diagram", "state table");
  const dff = has("d 플립플롭", "d플립플롭", "d-ff", "d ff", "d_a", "d_b");
  const ffContext = has("플립플롭", "flip-flop", "flipflop");
  const designCtx = has("게이트", "gate", "설계", "구현", "순서 논리", "순서논리", "순차 회로", "순차회로");
  // 형제 archetype·generic FSM으로 양보할 신호들.
  const jk = has("jk 플립플롭", "jk플립플롭", "jk-ff", "j-k 플립플롭");
  const tff = has("t 플립플롭", "t플립플롭", "t-ff");
  const sr = has("sr 플립플롭", "sr플립플롭", "rs 플립플롭", "s-r 플립플롭");
  const mux = has("멀티플렉서", "multiplexer", "mux", "선택선");
  const asyncRipple = has("비동기", "리플 카운터", "리플카운터", "프리셋");
  // ★ 시퀀스 검출기는 입력 비트열 → 출력 1 유형(sequence_detector) — 자율 순환 설계가 아니다.
  //   Vision이 "출력이 1이 되는"처럼 적어 리터럴 "출력 z" 가드에 안 걸리므로 고유어로 양보한다(실측).
  const seqDetector = has("시퀀스 검출기", "시퀀스검출기", "순서 검출기", "순차 검출기", "sequence detector", "검출기");
  const externalIo = has("입력 x", "출력 z", "출력 y", "외부 입력") || seqDetector;

  if (jk || tff || sr || mux || asyncRipple || externalIo) return false;
  return stateGraph && designCtx && (dff || ffContext);
}

/**
 * D-FF 2개 상태도 순차회로 설계 (임용 9번 정보과) — 결정론 파이프라인. GPT 없음.
 *  [1] 상태도→상태표 다음상태(㉠~㉣), [2] D_A·D_B 입력, [3] 게이트 ㉮·㉯ 도출.
 */
export async function runDffStateDesignPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDffStateDesign({ seed, mode, index: i });
    log.info("dff_state_design_generated", {
      transitions: gen.transitions.join(", "),
      dA: gen.dAExpr, dB: gen.dBExpr,
    });

    const transitionStr = gen.transitions.join(",  ");
    // FF_A는 항상 D, FF_B는 ffBType(similar=D, variant=T). 입력 라벨/단계 텍스트를 종류에 맞게 구성.
    const ffDesc = `FF_A = ${gen.ffAType} 플립플롭, FF_B = ${gen.ffBType} 플립플롭`;
    const isTB = gen.ffBType === "T";
    const inA = gen.inputAName, inB = gen.inputBName; // "D_A" / "D_B"|"T_B"

    const content = [
      `그림 (가)는 Q_A Q_B 순으로 상태가 표시된 상태도이고, 표 (나)는 ${ffDesc}을 이용하여 (가)의 상태도로 동작하는 순서 논리 회로를 설계하는 과정이다.`,
      "(나)의 ㉠~㉣과 (다)의 ㉮·㉯를 제시된 <해석 절차>에 따라 단계별로 구하여 서술하시오.",
      "(단, 모든 소자는 이상적으로 동작한다.)",
    ].join(" ");

    // FF_B 입력 도출 규칙 설명 (D-FF: D=다음상태 / T-FF: T=현재 Q ⊕ 다음 Q, 여기표 필요)
    const ffBRule = isTB
      ? `FF_B는 T 플립플롭이므로 여기표로 T_B = Q_B(t) ⊕ Q_B(t+1)를 구한다.`
      : `FF_B는 D 플립플롭이므로 D_B = Q_B(t+1)(다음 상태)이다.`;
    const ffBSolveLine = isTB
      ? `T_B(여기): 각 현재상태에서 Q_B가 바뀌면 1, 유지면 0. ${gen.ffInputAnswers.map((r) => `${r.state}:${r.value}`).join(", ")}.`
      : `D_B = Q_B(t+1).`;

    const conditions = [
      `상태 전이(입력 없음): ${transitionStr}`,
      `${ffDesc}. FF_A(D): D_A = 다음 Q_A. ${ffBRule}`,
      `(나) 상태표의 다음상태 칸 ㉠~㉣, (다)의 게이트 ㉮(${inA})·㉯(${inB})는 빈칸 — 학생 도출.`,
    ];

    const question = [
      `[단계 1] 그림 (가)의 상태도를 이용하여, 표 (나)의 ㉠~㉣에 해당하는 다음 상태(Q_A(t+1) Q_B(t+1)) 값을 순서대로 구한다.`,
      `[단계 2] 표 (나)에서 플립플롭 입력 ${inA}·${inB}를 구한다. (FF_A는 D-FF: D_A = 다음 상태. ${isTB ? "FF_B는 T-FF: 여기표 T_B = Q_B(t) ⊕ Q_B(t+1)" : "FF_B는 D-FF: D_B = 다음 상태"})`,
      `[단계 3] [단계 1]·[단계 2]를 이용하여, 그림 (다)의 ㉮(${inA} 구현)·㉯(${inB} 구현) 논리 게이트를 각각 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ${gen.nextAnswers.map((a) => `${a.symbol} = ${a.answer}`).join(",  ")}`,
      `[단계 2] ${inA} = ${gen.dAExpr},  ${inB} = ${gen.dBExpr}`,
      `[단계 3] ㉮: ${gen.dAExpr} → ${gen.dAGate} 게이트,  ㉯: ${gen.dBExpr} → ${gen.dBGate} 게이트`,
    ].join("\n");

    const solution = [
      `[단계 1] 상태도의 각 상태에서 화살표가 가리키는 다음 상태를 읽는다: ${gen.nextAnswers.map((a) => a.answer).join(", ")} (㉠~㉣).`,
      `[단계 2] FF_A(D-FF): Q_A(t+1) = D_A이므로 D_A = Q_A(t+1). ${ffBSolveLine}`,
      `[단계 3] ${inA}·${inB}를 (Q_A, Q_B) 2변수 카르노맵으로 최소화:`,
      `  · ${inA} = ${gen.dAExpr}  →  ㉮ = ${gen.dAGate} 게이트.`,
      `  · ${inB} = ${gen.dBExpr}  →  ㉯ = ${gen.dBGate} 게이트.`,
    ].join("\n");

    const tableLabel = `(나) 상태표 (다음상태·플립플롭 입력 ${inA}·${inB}, ㉠~㉣ 빈칸)`;
    const circuitLabel = `(다) ${gen.ffAType}-FF + ${gen.ffBType}-FF + 게이트(㉮·㉯) 구현 회로`;
    const figureVariants: FigureVariant[] = [
      { id: `fig_dffsd_diagram_${i + 1}`, label: "(가) 상태도 (입력 없는 순환)", role: "state_diagram", diagramType: "concept_diagram", diagram: gen.stateDiagram },
      { id: `fig_dffsd_table_${i + 1}`, label: tableLabel, role: "truth_table", diagramType: "truth_table", diagram: gen.stateTable },
      { id: `fig_dffsd_circuit_${i + 1}`, label: circuitLabel, role: "implementation_circuit", diagramType: "dff_state_design_circuit", diagram: gen.circuitDiagram },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
