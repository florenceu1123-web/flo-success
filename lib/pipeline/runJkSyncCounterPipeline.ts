import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateJkStateMachine, generateJkStateMachineVariant, stateBits as smBits } from "@/lib/generation/topologies/jkStateMachine";
import type { ClockEdge } from "@/lib/generation/topologies/jkStateMachine";
import { detectClockEdge } from "@/lib/analysis/clockEdge";
import { buildContextHint, generateInParallel } from "./_common";
import type {
  AnalysisResult,
  FigureVariant,
  GeneratedProblem,
  GenerationMode,
  TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runJkSyncCounterPipeline");

/**
 * JK 동기식 카운터 재검출 (route 안전망) — analysis 텍스트가 "JK 플립플롭 + 카운터"면 true.
 *
 * classifyCircuitType의 JK 분기는 `subject==="digital_logic"` 안에서만 동작한다. 사용자가
 * 과목을 다른 것으로 골라 분석하면(또는 이전 분류기 버전의 stale circuitType이 남으면) JK 카운터인데도
 * circuitType이 sequential_dff_generic 등으로 와서 D-FF 회로로 변질된다. route에서 이 검출로
 * circuitType·subject를 강제 보정한다(ac_power_factor 코어션과 동일 패턴).
 */
export function detectJkSyncCounter(
  analysis?: { topic?: string; interpretation?: string; relatedConcepts?: string[]; fillInTheBlanks?: Array<{ sentence?: string; answer?: string }> } | null,
): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  const hasJk = /jk\s*플립플롭|j-k\s*플립플롭|jk-ff|j-k\s*플립|jk\s*플립|jk플립플롭|jk\s*flip-?flop|j-k\s*flip/.test(text);
  const hasCounter = /카운터|계수기|계수\s*회로|counter/.test(text);
  const hasMux = /멀티플렉서|multiplexer|2×1\s*mux|2x1\s*mux/.test(text);
  // ★ 복합형(임용 8번: 카운터 + D/A 변환 + 비교기)에 양보 (2026-07-27).
  //   그쪽도 JK 플립플롭 카운터를 쓰지만 **DAC·비교기와 결합된 별개 유형**이다.
  //   실측 회귀: 분류기가 counter_dac_comparator로 맞게 분류했는데 이 안전망이 덮어써
  //   순수 JK 카운터 문제가 생성됐다(원본의 DAC·비교기·V_o 파형이 통째로 사라짐).
  const hasDacOrComparator =
    /d\/a|da\s*변환|디지털[\s-]*아날로그|dac|r-?2r|비교기|comparator/.test(text);
  return hasJk && hasCounter && !hasMux && !hasDacOrComparator;
}

/**
 * JK 플립플롭 동기식 카운터 파이프라인 (결정론, GPT 없음). 모드로 분기:
 *  - exam_similar(기출유사): 원본처럼 **비순환 상태가 있는** JK 카운터(6-사이클 + 비순환 2개)
 *    — (가)회로 + (나)타이밍 + (다)상태도, "순환하지 않는 상태값" 도출. (원본에 가까움)
 *  - exam_variant(기출변형): 깔끔한 2진 **상향·하향** 카운터 — (가)회로 + (나)타이밍.
 */
export async function runJkSyncCounterPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  void buildContextHint(analysis); // 결정론 — 컨텍스트는 참고만.

  // ★ 클럭 에지는 원본의 구조적 속성이다(원본 임용 6번은 CP 입력에 버블 = 하강 에지).
  //   분석 텍스트에 근거가 있으면 그대로 따르고, 없으면 원본을 보존한다(절대규칙 0).
  const clockEdge: ClockEdge = detectClockEdge(analysis) ?? "falling";
  log.info("jk_clock_edge", { clockEdge, detected: detectClockEdge(analysis) ?? "none" });

  if (mode === "exam_similar") {
    return runStateMachineMode(count, topicKey, clockEdge);
  }
  // exam_variant: 게이트 1개 추가한 카운터 (비순환 상태형 + 게이트).
  return runVariantMode(count, topicKey, clockEdge);
}

/** 발문·풀이에 쓰는 에지 표기. */
function edgeKo(e: ClockEdge): string {
  return e === "falling" ? "하강 에지" : "상승 에지";
}

/** exam_similar: 비순환 상태가 있는 JK 카운터 (원본 임용 6번 재현). index 0 = 원본 답. */
async function runStateMachineMode(count: number, topicKey: TopicKey | undefined, clockEdge: ClockEdge): Promise<GeneratedProblem[]> {
  return generateInParallel(count, async (i) => {
    const gen = generateJkStateMachine({ index: i, clockEdge });
    const cycleText = gen.cycle.map(smBits).join(" → ") + " → " + smBits(gen.cycle[0]);
    const ncVals = gen.nonCyclic.map((n) => smBits(n.state));
    log.info("jk_state_machine_generated", { cycle: cycleText, nonCyclic: ncVals.join(",") });

    const jkLabel = (s: string) => (s === "1" ? "1" : s.startsWith("n") ? `Q̄${sub(s)}` : `Q${sub(s)}`);
    const c = gen.config;

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_circuit_${i + 1}`,
        label: "(가) JK 플립플롭 동기식 카운터 회로",
        role: "implementation_circuit",
        diagramType: "jk_state_machine_circuit",
        diagram: { j0: c.J0, k0: c.K0, j1: c.J1, k1: c.K1, j2: c.J2, k2: c.K2, clockEdge },
      },
      {
        id: `fig_waveform_${i + 1}`,
        label: "(나) 타이밍 도표 (Q₂Q₁Q₀ 빈칸 — 학생 도시)",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveformTemplate,
      },
      {
        id: `fig_state_${i + 1}`,
        label: "(다) 상태도 (점선 = 순환하지 않는 상태)",
        role: "state_diagram",
        diagramType: "jk_state_diagram",
        diagram: gen.stateDiagram,
      },
    ];
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_waveform_sol_${i + 1}`,
        label: "(나) 타이밍 도표 — 정답 (Q 채움)",
        role: "solution_waveform",
        diagramType: "waveform",
        diagram: gen.waveformSolution,
      },
    ];

    const markerAns = gen.markerStates.map((m) => `${m.label}: Q₂Q₁Q₀ = ${smBits(m.state)}`).join(", ");

    const content = `그림 (가)는 이상적으로 동작하는 JK 플립플롭 3개(Q₂·Q₁·Q₀)를 이용한 동기식 카운터 회로이다. 세 플립플롭은 공통 클럭 펄스(CP)의 ${edgeKo(clockEdge)}에서 동시에 트리거되며, 각 J·K 입력은 J₀=${jkLabel(c.J0)}·K₀=${jkLabel(c.K0)}, J₁=${jkLabel(c.J1)}·K₁=${jkLabel(c.K1)}, J₂=${jkLabel(c.J2)}·K₂=${jkLabel(c.K2)} 로 배선되어 있다. 초기 상태는 Q₂Q₁Q₀ = 000이다.`;
    const conditions = [
      `모든 플립플롭은 공통 클럭 CP의 **${edgeKo(clockEdge)}**에서 동시에 상태가 바뀐다(동기식).`,
      "상태값은 Q₂Q₁Q₀ 순서로 표기하며, 초기값은 000이다.",
    ];
    const question = `(1) 클럭 펄스 CP에 따른 Q₂·Q₁·Q₀의 변화를 그림 (나)의 타이밍 도표에 도시하시오.\n(2) 회로의 상태 전이를 그림 (다)의 상태도로 작성하고, 000에서 시작하는 순환(사이클)에 **포함되지 않는(순환하지 않는) 상태값 2개**를 구하시오.`;
    const answer = `상태 순환: ${cycleText}. 순환하지 않는 상태값 2개: ${ncVals.join(", ")}.`;
    const solution = `[단계 1] 각 플립플롭의 여기 조건(Qₙ₊₁ = J·Q̄ + K̄·Q)을 적용해 초기 000부터 CP의 ${edgeKo(clockEdge)}마다 다음 상태를 구하면 ${cycleText} 로 6개 상태를 순환한다. 이를 (나)에 도시한다(전이는 모두 CP의 ${edgeKo(clockEdge)} 시점에 일어난다).\n[단계 2] 8개 상태 전체의 전이를 (다) 상태도로 그리면, 위 6-상태 사이클에 들어오지 못하고 사이클로 흘러 들어가기만 하는 상태가 ${gen.nonCyclic.map((n) => `${smBits(n.state)}(→${smBits(n.next)})`).join(", ")} 이다. 따라서 **순환하지 않는 상태값은 ${ncVals.join(", ")}** 이다.`;

    return {
      id: randomUUID(),
      content,
      conditions,
      question,
      answer,
      solution,
      topicKey: topicKey ?? "flipflop_counter",
      figureVariants: [...figureVariants, ...solutionFigures],
    } satisfies GeneratedProblem;
  });
}

/** exam_variant: 유사 회로(J0=Q̄1·J1=Q0) 그대로 + J2=K2=gate(Q0,Q1) 게이트 1개 추가. */
async function runVariantMode(count: number, topicKey: TopicKey | undefined, clockEdge: ClockEdge): Promise<GeneratedProblem[]> {
  return generateInParallel(count, async (i) => {
    const gen = generateJkStateMachineVariant({ index: i, clockEdge });
    const vc = gen.variantConfig!;
    const jkLabel = (s: string) => (s === "1" ? "1" : s.startsWith("n") ? `Q̄${sub(s)}` : `Q${sub(s)}`);
    const gateOp = typeof vc.J2 === "object" ? vc.J2.op : "OR";
    const cycleText = gen.cycle.map(smBits).join(" → ") + " → " + smBits(gen.cycle[0]);
    const ncVals = gen.nonCyclic.map((n) => smBits(n.state));
    log.info("jk_state_machine_variant_generated", { cycle: cycleText, nonCyclic: ncVals.join(","), gateOp });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_circuit_${i + 1}`,
        label: "(가) JK 카운터 회로 (게이트 포함)",
        role: "implementation_circuit",
        diagramType: "jk_state_machine_circuit",
        diagram: {
          j0: vc.J0 as string, k0: vc.K0 as string, j1: vc.J1 as string, k1: vc.K1 as string,
          j2: "", k2: "", gate: { op: gateOp, a: "Q0", b: "Q1" }, clockEdge,
        },
      },
      {
        id: `fig_waveform_${i + 1}`,
        label: "(나) 타이밍 도표 (Q₂Q₁Q₀ 빈칸 — 학생 도시)",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveformTemplate,
      },
      {
        id: `fig_state_${i + 1}`,
        label: "(다) 상태도 (점선 = 순환하지 않는 상태)",
        role: "state_diagram",
        diagramType: "jk_state_diagram",
        diagram: gen.stateDiagram,
      },
    ];
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_waveform_sol_${i + 1}`,
        label: "(나) 타이밍 도표 — 정답 (Q 채움)",
        role: "solution_waveform",
        diagramType: "waveform",
        diagram: gen.waveformSolution,
      },
    ];

    const markerAns = gen.markerStates.map((m) => `${m.label}: Q₂Q₁Q₀ = ${smBits(m.state)}`).join(", ");
    const opKo = gateOp === "OR" ? "OR(논리합)" : gateOp === "AND" ? "AND(논리곱)" : gateOp;

    const content = `그림 (가)는 JK 플립플롭 3개(Q₂·Q₁·Q₀)를 이용한 동기식 카운터 회로이다. 공통 클럭 펄스(CP)의 ${edgeKo(clockEdge)}에서 동시에 트리거되며, J₀=${jkLabel(vc.J0 as string)}·K₀=${jkLabel(vc.K0 as string)}, J₁=${jkLabel(vc.J1 as string)}·K₁=${jkLabel(vc.K1 as string)}이고, **최상위 플립플롭의 J₂=K₂는 2입력 ${opKo} 게이트의 출력(입력: Q₀, Q₁)**에 연결되어 있다. 초기 상태는 Q₂Q₁Q₀ = 000이다.`;
    const conditions = [
      `모든 플립플롭은 공통 클럭 CP의 **${edgeKo(clockEdge)}**에서 동시에 상태가 바뀐다(동기식).`,
      `J₂ = K₂ = ${gateOp}(Q₀, Q₁) 게이트 출력이다.`,
      "상태값은 Q₂Q₁Q₀ 순서로 표기하며, 초기값은 000이다.",
    ];
    const question = `(1) 클럭 펄스 CP에 따른 Q₂·Q₁·Q₀의 변화를 그림 (나)의 타이밍 도표에 도시하시오.\n(2) 회로의 상태 전이를 그림 (다)의 상태도로 작성하고, 000에서 시작하는 순환에 **포함되지 않는(순환하지 않는) 상태값 2개**를 구하시오.`;
    const answer = `상태 순환: ${cycleText}. 순환하지 않는 상태값 2개: ${ncVals.join(", ")}.`;
    const solution = `[단계 1] 여기 조건(Qₙ₊₁ = J·Q̄ + K̄·Q)과 J₂=K₂=${gateOp}(Q₀,Q₁)를 적용해 초기 000부터 CP의 ${edgeKo(clockEdge)}마다 다음 상태를 구하면 ${cycleText} 로 6개 상태를 순환한다. 이를 (나)에 도시한다(전이는 모두 CP의 ${edgeKo(clockEdge)} 시점에 일어난다).\n[단계 2] 8개 상태 전이를 (다) 상태도로 그리면, 사이클에 들어오지 못하고 흘러 들어가기만 하는 상태가 ${gen.nonCyclic.map((n) => `${smBits(n.state)}(→${smBits(n.next)})`).join(", ")} 이다. 따라서 **순환하지 않는 상태값은 ${ncVals.join(", ")}** 이다.`;

    return {
      id: randomUUID(),
      content,
      conditions,
      question,
      answer,
      solution,
      topicKey: topicKey ?? "flipflop_counter",
      figureVariants: [...figureVariants, ...solutionFigures],
    } satisfies GeneratedProblem;
  });
}

/** 신호 라벨 "Q1"/"nQ0"에서 첨자만 추출. */
function sub(s: string): string {
  const idx = s.replace(/^n/, "").replace("Q", "");
  return idx === "0" ? "₀" : idx === "1" ? "₁" : "₂";
}
