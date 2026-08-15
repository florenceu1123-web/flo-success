import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateTffStateDesignInput } from "@/lib/generation/topologies/tffStateDesignInput";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runTffStateDesignInputPipeline");

/**
 * 외부 입력 X를 갖는 2-bit 상태기계 → **T 플립플롭** 2개 + 게이트 설계 (임용 12번 디지털논리)
 * — 결정론 파이프라인. GPT 없음.
 *
 *  ★ 원본은 D 플립플롭이지만 사용자 지정으로 **T 플립플롭**으로 출제한다(T = Q(t) ⊕ Q(t+1)).
 *  figure 5개: (가) 상태도 / (나) 상태표 / (다) 카르노맵 2개 / (라) 구현 회로.
 */
export async function runTffStateDesignInputPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateTffStateDesignInput({ seed, mode });
    log.info("tff_state_design_input_generated", {
      mode, tA: gen.tAExpr, tB: gen.tBExpr, terms: gen.tATermCount,
    });

    const content = [
      "그림 (가)는 상태 변수 Q_A, Q_B와 입력 X를 갖는 상태도(state diagram)이고, (나)~(다)는 2개의",
      "T 플립플롭을 이용하여 (가)의 상태도로 동작하는 논리회로를 설계하는 과정이다.",
      "(가)로부터 상태표 (나)와 카르노맵 (다)를 작성하여 플립플롭의 입력 T_A, T_B와 논리회로도 (라)를",
      "제시된 <설계 절차>에 따라 구하여 서술하시오.",
      "(단, 모든 소자는 이상적으로 동작하며, (가)의 상태 변수는 Q_A Q_B의 순서로 표기한 것이다.)",
    ].join(" ");

    const conditions = [
      "상태는 Q_A Q_B (00, 01, 11, 10) 4개이고, 외부 입력 X(0 또는 1)에 따라 다음 상태가 결정된다.",
      "T 플립플롭의 여기표: T = Q(t) ⊕ Q(t+1)  (T=1이면 반전, T=0이면 유지)",
      "두 플립플롭은 공통 클록(CLK)으로 동기 동작한다.",
      "불 함수는 간략화된 최소항의 합(SOP)으로 표현한다.",
    ];

    const question = [
      "[단계 1] (가)의 상태도를 이용하여 (나)의 ㉠(플립플롭 입력 T_A, T_B 열)을 순서대로 구한다.",
      "[단계 2] (나)와 (다)를 이용하여 플립플롭의 입력 T_A, T_B를 불 함수로 구한다. (단, 불 함수는 간략화된 최소항의 합으로 표현한다.)",
      "[단계 3] [단계 2]에서 구한 결과를 이용하여 (라)의 ㉡을 2개의 AND 게이트와 1개의 OR 게이트로 구성하여 도시한다.",
    ].join("\n");

    const tACol = gen.stateTable.rows.map((r) => r.outputs?.[2]).join(" ");
    const tBCol = gen.stateTable.rows.map((r) => r.outputs?.[3]).join(" ");
    const answer = [
      `[단계 1] (Q_A Q_B X = 000, 001, 010, 011, 100, 101, 110, 111 순서)`,
      `  T_A = ${tACol}`,
      `  T_B = ${tBCol}`,
      `[단계 2] T_A = ${gen.tAExpr},  T_B = ${gen.tBExpr}`,
      `[단계 3] ㉡ = ${gen.tAExpr} — 두 곱항을 각각 2입력 AND 게이트로 만들고, 두 출력을 2입력 OR 게이트로 묶어 T_A에 연결한다.`,
    ].join("\n");

    const solution = [
      `[단계 1] 상태도의 각 간선은 (현재 상태, 입력 X) → (다음 상태)를 나타낸다. 전이는 다음과 같다.`,
      `  ${gen.transitions.join(",  ")}`,
      `  T 플립플롭은 여기표가 T = Q(t) ⊕ Q(t+1)이므로, 각 행에서 현재 비트와 다음 비트가 **다르면 T=1**, 같으면 T=0이다.`,
      `  (D 플립플롭이라면 D = 다음 상태였겠지만, T 플립플롭은 이 배타적 논리합 단계가 한 번 더 필요하다.)`,
      `  그 결과가 (나)의 ㉠ 열이다: T_A = ${tACol} / T_B = ${tBCol}.`,
      `[단계 2] (나)의 T_A·T_B 열을 (다)의 카르노맵(행 Q_A Q_B, 열 X)에 옮겨 인접한 1들을 묶으면`,
      `  T_A = ${gen.tAExpr},  T_B = ${gen.tBExpr} 를 얻는다.`,
      `[단계 3] T_A는 두 개의 곱항의 합이므로, 각 곱항을 2입력 AND 게이트 하나씩으로 구현하고(입력은 Q_A·Q_B·X 중 해당 리터럴,`,
      `  보수는 인버터를 거친 신호), 두 AND 출력을 2입력 OR 게이트로 합쳐 T_A 핀에 연결한다. 즉 ㉡ = ${gen.tAExpr}.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      { id: `fig_tffsd_diagram_${i + 1}`, label: "(가) 상태도 (입력 X에 따른 전이)", role: "state_diagram", diagramType: "concept_diagram", diagram: gen.stateDiagram },
      { id: `fig_tffsd_table_${i + 1}`, label: "(나) 상태표 (㉠ = T_A·T_B 열)", role: "truth_table", diagramType: "truth_table", diagram: gen.stateTable },
      { id: `fig_tffsd_kmapa_${i + 1}`, label: "(다-1) 카르노맵 T_A", role: "kmap", diagramType: "kmap", diagram: gen.kmapA },
      { id: `fig_tffsd_kmapb_${i + 1}`, label: "(다-2) 카르노맵 T_B", role: "kmap", diagramType: "kmap", diagram: gen.kmapB },
      { id: `fig_tffsd_circuit_${i + 1}`, label: "(라) T 플립플롭 2개 + 게이트 ㉡ 구현 회로", role: "implementation_circuit", diagramType: "dff_state_design_circuit", diagram: gen.circuitDiagram },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 입력 X를 갖는 2-bit 상태기계 + FF 설계 감지 — 분류·route 안전망.
 *
 * ★ 형제 `dff_state_design`(입력 없는 **자율** 상태도)과의 판별선 = **외부 입력 X의 존재**.
 *   이쪽은 상태표가 8행(Q_A Q_B X)·카르노맵이 3변수다.
 *   ★ Mealy/Moore 출력(Z·y)이 있으면 generic fsm 소관 — 양보한다.
 */
export function detectTffStateDesignInput(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  // 상태도/상태표 + 플립플롭 설계 문맥
  const stateCtx = /상태도|state\s*diagram|상태표|상태\s*전이/.test(text);
  const ffCtx = /플립플롭|flip[\s-]?flop|f\/f|\bff\b/.test(text);
  if (!(stateCtx && ffCtx)) return false;

  // 외부 입력 X — 이 유형 고유(형제는 입력 없는 자율 상태기계)
  const hasInputX = /입력\s*x|입력\s*변수\s*x|\bx\b\s*를?\s*갖는|입력을?\s*갖는/.test(text);
  if (!hasInputX) return false;

  // 상태 변수 Q_A·Q_B (2비트) + 카르노맵/불함수 설계
  const twoBit = /q_?a.*q_?b|q_?a\s*,\s*q_?b|2\s*비트|두\s*개의\s*플립플롭/.test(text);
  const designKw = /카르노맵|k[\s-]?map|불\s*함수|논리식|최소항|간략화|설계/.test(text);
  if (!(twoBit && designKw)) return false;

  // Mealy/Moore 출력이 명시되면 generic fsm 소관
  if (/출력\s*z|출력\s*y|출력\s*함수/.test(text)) return false;
  // JK·SR 플립플롭이면 형제 archetype
  if (/j-?k\s*플립플롭|jk\s*플립플롭|s-?r\s*플립플롭|sr\s*플립플롭|여기표\s*j/.test(text)) return false;
  return true;
}
