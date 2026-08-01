/**
 * D-FF/T-FF + 2×1 MUX 자율 순차회로 (임용 8번 정보과). 결정론 파이프라인. GPT 없음.
 *  (가) 상태 전이도 + (나) FF+MUX 구현회로(전용 세로 스택 렌더러) + (다) MUX 진리표 + 3단계.
 *  유사=D-FF / 변형(응용)=T-FF.
 */
import { createLogger } from "@/lib/logger";
import { generateDffMuxSequential } from "@/lib/generation/topologies/dffMuxSequential";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDffMuxSequentialPipeline");

/**
 * 안전망 감지 — stale analysis(프론트가 캐시한 fsm/sequential_dff_generic/universal_digital 등)라도
 * 텍스트·inventory가 "D 플립플롭 + 2×1 MUX + 상태도/순차(자율)"이면 dff_mux_sequential로 교정.
 * ※ SR-FF(→sr_ff_mux_sequential)·JK-FF(→fsm)는 각자 전용 경로가 있으므로 여기서 양보.
 */
export function detectDffMuxSequential(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => (typeof b === "string" ? b : (b as { text?: string })?.text ?? "")).join(" "),
  ].join(" ").toLowerCase();
  const inv = analysis.componentInventory ?? [];
  const upc = (t: unknown) => String(t ?? "").toUpperCase();
  const lvc = (v: unknown) => String(v ?? "").toLowerCase();

  const hasMux = /mux|멀티플렉서|multiplex|2\s*[×x:]\s*1/.test(text) ||
    inv.some((c) => upc(c.type) === "MUX" || /mux|멀티플렉서/.test(lvc(c.value)));
  const hasDff = /d[\s-]?플립플롭|d[\s-]?ff|d\s*flip/.test(text) ||
    inv.some((c) => upc(c.type) === "D" || /d\s*플립플롭|d[\s-]?ff/.test(lvc(c.value)));
  const hasSeq = /상태도|상태\s*전이도|상태천이도|순서논리|순차논리|순서\s*논리|순차\s*논리|순서회로|순차회로/.test(text);
  // 양보: SR·JK 플립플롭 유형은 각자 전용/generic 경로
  const hasSr = /sr[\s-]?플립플롭|s-?r[\s-]?ff|rs[\s-]?플립플롭|셋[\s/]*리셋/.test(text) ||
    inv.some((c) => ["SR", "RS"].includes(upc(c.type)));
  const hasJk = /jk[\s-]?플립플롭|j-?k[\s-]?ff|제이케이/.test(text) ||
    inv.some((c) => upc(c.type) === "JK");

  return hasMux && hasDff && hasSeq && !hasSr && !hasJk;
}

export async function runDffMuxSequentialPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { count, topicKey } = args;
  const mode: "exam_similar" | "exam_variant" =
    args.mode === "exam_variant" ? "exam_variant" : "exam_similar";

  return generateInParallel(count, async (i, seed) => {
    const g = generateDffMuxSequential({ seed, mode });
    const ff = g.ffType === "T" ? "T" : "D";
    const ffName = g.ffType === "T" ? "T 플립플롭" : "D 플립플롭";
    log.info("dff_mux_sequential_generated", { ffType: g.ffType, cycle: g.cycleSeq, sel: g.selectVar, muxA: g.muxA, muxB: g.muxB, qAHz: g.qAHz });

    const figState: FigureVariant = {
      id: `fig_state_${i + 1}`, label: "(가) 상태 전이도", role: "state_diagram",
      diagramType: "concept_diagram", diagram: g.stateDiagram,
    };
    const figCirc: FigureVariant = {
      id: `fig_circ_${i + 1}`, label: `(나) FSM 구현 회로 (${ffName} + 2×1 MUX)`,
      role: "implementation_circuit", diagramType: "dff_mux_sequential_circuit", diagram: g.circuitDiagram,
    };
    const figTable: FigureVariant = {
      id: `fig_muxtbl_${i + 1}`, label: "(다) 2×1 MUX 동작 특성", role: "truth_table",
      diagramType: "truth_table",
      diagram: { variables: ["S"], outputLabel: "F (출력)", rows: [{ inputs: [0], output: "I₀" }, { inputs: [1], output: "I₁" }] },
    };

    const cycleStr = g.cycleSeq.map((s) => `${(s >> 1) & 1}${s & 1}`).join("→") + `→${(g.cycleSeq[0] >> 1) & 1}${g.cycleSeq[0] & 1}`;

    const content = [
      `그림 (가)는 순서논리회로의 상태 변수를 Q_AQ_B 순으로 표기한 상태 전이도이고(입력 없는 자율 순환), 그림 (나)는 그림 (가)에서 동작하도록 ${ffName} 2개와 2×1 멀티플렉서(MUX) 2개로 구현한 회로이다. 그림 (다)는 2×1 MUX의 동작 특성이다.`,
      `제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. (단, 모든 소자는 이상적으로 동작한다.)`,
    ].join(" ");

    const conditions = [
      `상태 순환: ${cycleStr} (입력 없는 자율 순환)`,
      `(나): 각 MUX 공통 선택선 S = ${g.selectVar}. 상단 MUX→${ff}_A(Q_A), 하단 MUX→${ff}_B(Q_B).`,
      `MUX 데이터입력 ㉠㉡(상단)·㉢㉣(하단)은 빈칸 — 학생 도출. (다) S=0→I₀, S=1→I₁.`,
    ];

    const question = [
      `[단계 1] 그림 (가)와 같이 동작하도록 그림 (나)의 ㉠·㉡·㉢·㉣을 각각 구한다. (Q_A, Q_B, 그 보수, 0 또는 1 이용)`,
      `[단계 2] 그림 (나)에서 ${ffName}의 입력 ${ff}_A에 대한 최소화된 곱의 합(SOP)을 구한다.`,
      `[단계 3] 그림 (나)에서 클록의 주파수가 ${g.clkHz}[Hz]일 때, 출력 Q_A의 주파수[Hz]를 구한다. (Q_A=0, Q_B=0 상태에서 시작.)`,
    ].join("\n");

    const answer = [
      `[단계 1] ㉠=${g.muxA.i0}, ㉡=${g.muxA.i1}, ㉢=${g.muxB.i0}, ㉣=${g.muxB.i1}`,
      `[단계 2] ${ff}_A = ${g.inAExpr}`,
      `[단계 3] Q_A 주파수 = ${g.qAHz} Hz`,
    ].join("\n");

    const solution = [
      `[단계 1] ${ffName}는 ${g.ffType === "T" ? "T=현재상태 XOR 차기상태" : "입력=차기상태"}. 각 상태의 ${ff}_A·${ff}_B를 구한 뒤, 공통 선택선 S=${g.selectVar}로 분해하면 상단 MUX 입력 ㉠=${g.muxA.i0}·㉡=${g.muxA.i1}, 하단 MUX 입력 ㉢=${g.muxB.i0}·㉣=${g.muxB.i1}.`,
      `[단계 2] ${ff}_A를 (Q_A, Q_B) 카르노맵으로 최소화 → ${ff}_A = ${g.inAExpr}.`,
      `[단계 3] 상태가 ${cycleStr}로 순환(주기 ${g.cycleSeq.length}클록). 이 동안 Q_A의 파형 주기를 보면 Q_A 주파수 = ${g.clkHz}×(Q_A 상승에지수)/(주기) = ${g.qAHz}Hz.`,
    ].join("\n");

    return {
      id: `dffmux_${i + 1}`,
      topicKey: topicKey ?? "fsm",
      content, conditions, question, answer, solution,
      figureVariants: [figState, figCirc, figTable],
    } as GeneratedProblem;
  });
}
