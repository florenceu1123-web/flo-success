import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateFsm, generateJkStateTableFsm } from "@/lib/generation/topologies/fsm";
import { writeFsmText } from "@/lib/generation/topologies/fsmTextWriter";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runFsmPipeline");

export async function runFsmPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);

  // ★ JK 상태표 형식 (임용 9번 전자) — 원본이 "JK-FF 2개 + 상태도 + 상태표(빈칸 ㉠~㉥)"이면
  //   D-FF + MUX 구현회로 형식이 아니라 원본 방향(빈칸 → y 논리식 → J_A·J_B 식)으로 생성.
  //   classifier가 params.ffTypes=["JK"] + hasStateTable=true 로 신호.
  const params = analysis?.circuitType?.params;
  const isJkStateTable =
    (params?.ffTypes ?? []).includes("JK") && Boolean(params?.hasStateTable);
  if (isJkStateTable) {
    log.info("fsm_jk_state_table_mode", { mode, count });
    return runJkStateTableMode({ mode, count, topicKey });
  }

  return generateInParallel(count, async (i, seed) => {
    const gen = generateFsm({ params: analysis?.circuitType?.params, seed });
    log.info("fsm_generated", {
      D1: gen.d1Expression, D0: gen.d0Expression, Z: gen.zExpression,
      nextState: gen.nextState, output: gen.output,
    });

    const text = await writeFsmText({ generation: gen, mode, topicLabel, contextHint });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_state_diagram_${i + 1}`,
        label: "(가) 상태 전이도",
        role: "state_diagram",
        diagramType: "concept_diagram",
        diagram: gen.stateDiagram,
      },
      {
        id: `fig_impl_${i + 1}`,
        label: "(나) FSM 구현 회로 (D 플립플롭 + 2×1 MUX)",
        role: "implementation_circuit",
        diagramType: "logic_network",
        diagram: gen.logicNetworkDiagram,
      },
      {
        id: `fig_mux_table_${i + 1}`,
        label: "(다) 2×1 MUX 동작 특성",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: {
          variables: ["S"],
          outputLabel: "F (출력)",
          rows: [
            { inputs: [0], output: "I₀" },
            { inputs: [1], output: "I₁" },
          ],
        },
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
    };
  });
}

// =====================================================================
// JK 상태표 모드 — 임용 9번 전자 형식 (결정론 텍스트, GPT textWriter 불필요)
// =====================================================================
async function runJkStateTableMode(args: {
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateJkStateTableFsm({ seed, mode });
    log.info("jk_state_table_generated", {
      y: gen.yExpression,
      JA: gen.jkExpressions.JA,
      JB: gen.jkExpressions.JB,
      blanks: gen.blankAnswers.map((b) => `${b.symbol}=${b.answer}`).join(","),
    });

    const [A, B] = gen.names.stateVars;
    const x = gen.names.input;
    const y = gen.names.output;
    const blankList = gen.blankAnswers.map((b) => b.symbol).join(", ");

    // ── 문제 텍스트 (원본 해석 절차 방향 그대로) ──
    const content = [
      `그림 (가)는 출력 ${A}를 갖는 J-K 플립플롭과 출력 ${B}를 갖는 J-K 플립플롭으로 구성된 순서논리회로의 상태도이다.`,
      `그림 (나)는 (가)를 상태표로 나타낸 것이다.`,
      `제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오.`,
      `(단, (가)에서 ${x}/${y}는 입력 ${x}에 대한 출력 ${y}이고, 원(동그라미) 안의 2개 비트는 J-K 플립플롭의 출력 ${A}${B}이다.)`,
    ].join(" ");

    const conditions = [
      `J-K 플립플롭 2개 (출력 ${A}·${B})로 구성된 순서논리회로`,
      `상태도: 4개 상태 (${A}${B} = 00·01·10·11), Mealy 형식 (전이 라벨 ${x}/${y})`,
      `상태표 (나)의 ${blankList}은 빈칸 — 학생이 상태도에서 읽어 채움`,
    ];

    const question = [
      `[단계 1] (나)의 ${blankList}을 순서대로 구한다.`,
      `[단계 2] (나)를 이용하여 출력 ${y}의 논리식을 구한다.`,
      `[단계 3] J-K 플립플롭의 출력 ${A}와 출력 ${B}에 대한 입력 J_${A}와 입력 J_${B}의 최소화된 논리식을 각각 순서대로 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] ${gen.blankAnswers.map((b) => `${b.symbol} = ${b.answer}`).join(",  ")}`,
      `[단계 2] ${y} = ${gen.yExpression}`,
      `[단계 3] J_${A} = ${gen.jkExpressions.JA},  J_${B} = ${gen.jkExpressions.JB}`,
    ].join("\n");

    const solution = [
      `[단계 1] 상태도 (가)에서 빈칸 행의 현재 상태에 해당하는 노드를 찾아, ${x}=0·${x}=1 전이 화살표가`,
      `  가리키는 차기 상태와 전이 라벨의 출력값(${x}/${y}의 ${y})을 읽으면:`,
      `  ${gen.blankAnswers.map((b) => `${b.symbol} = ${b.answer}`).join(", ")}`,
      `[단계 2] 상태표의 출력 ${y} 컬럼에서 ${y}=1인 (${A}, ${B}, ${x}) 조합을 카르노 맵으로 최소화하면`,
      `  ${y} = ${gen.yExpression}`,
      `[단계 3] J-K 플립플롭 여기표(excitation table)를 적용한다:`,
      `  Q(t)=0→Q(t+1)=1 이면 J=1·K=무관 / Q(t)=1→Q(t+1)=0 이면 K=1·J=무관 /`,
      `  Q(t)=0→0 이면 J=0·K=무관 / Q(t)=1→1 이면 J=무관·K=0.`,
      `  각 플립플롭의 J 입력을 (${A}, ${B}, ${x}) 3변수 카르노 맵으로 최소화 (무관항 활용):`,
      `  · J_${A} = ${gen.jkExpressions.JA}  (참고: K_${A} = ${gen.jkExpressions.KA})`,
      `  · J_${B} = ${gen.jkExpressions.JB}  (참고: K_${B} = ${gen.jkExpressions.KB})`,
    ].join("\n");

    // ── Figures: (가) 상태도 + (나) 상태표(빈칸), 풀이 영역에 채워진 상태표 ──
    const figureVariants: FigureVariant[] = [
      {
        id: `fig_state_diagram_${i + 1}`,
        label: "(가) 상태도",
        role: "state_diagram",
        diagramType: "concept_diagram",
        diagram: gen.stateDiagram,
      },
      {
        id: `fig_state_table_${i + 1}`,
        label: `(나) 상태표 (${blankList} 빈칸)`,
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.stateTable,
      },
    ];
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_solution_state_table_${i + 1}`,
        label: "[풀이] 완성된 상태표",
        role: "truth_table",
        diagramType: "truth_table",
        diagram: gen.solutionStateTable,
      },
    ];

    return {
      id: randomUUID(),
      content,
      conditions,
      question,
      answer,
      solution,
      topicKey,
      figureVariants,
      solutionFigures,
    };
  });
}
