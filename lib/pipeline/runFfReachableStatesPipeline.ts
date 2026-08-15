import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateFfReachableStates, matchesFfReachableStates, type FfReachGeneration,
} from "@/lib/generation/topologies/ffReachableStates";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem, type GenerationMode,
  type TopicKey, type WaveformDiagram,
} from "@/types";

const log = createLogger("lib/pipeline/runFfReachableStatesPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다. */
export function detectFfReachableStates(a?: Partial<AnalysisResult> | null): boolean {
  return matchesFfReachableStates(a);
}

const GATE_KR: Record<string, string> = {
  AND: "AND", OR: "OR", NAND: "NAND", NOR: "NOR", XOR: "EX-OR", XNOR: "EX-NOR",
};

// ── 파형 시간축 규약 ────────────────────────────────────
//   클럭 k는 구간 [2k, 2k+2), **상승 에지는 t = 2k**.
//   X는 구간 k 동안 xSeq[k]를 유지하고, 그 값은 **다음 상승 에지**에서 샘플링된다.
//   따라서 Q는 t = 2(k+1)에서 steps[k+1] 값으로 바뀐다(에지 트리거).
//   ★ shape="step"은 zero-order hold라 "값이 바뀌는 샘플 시각 = 전이 에지"다.
//     같은 t에 샘플을 두 번 찍으면 waveform_time_not_monotonic이 나므로 시각은 항상 증가시킨다.
const PULSE = 2;

function clockSamples(n: number): Array<{ t: number; v: number }> {
  const out: Array<{ t: number; v: number }> = [];
  for (let k = 0; k <= n; k += 1) {
    out.push({ t: PULSE * k, v: 1 });
    out.push({ t: PULSE * k + 1, v: 0 });
  }
  out.push({ t: PULSE * (n + 1), v: 0 });
  return out;
}

function holdSamples(values: number[], n: number): Array<{ t: number; v: number }> {
  const out: Array<{ t: number; v: number }> = [];
  for (let k = 0; k < values.length; k += 1) out.push({ t: PULSE * k, v: values[k] });
  out.push({ t: PULSE * (n + 1), v: values[values.length - 1] });
  return out;
}

/**
 * (나) 타이밍 도표. `blankQ`이면 Q_A·Q_B를 **빈 트랙**으로 낸다(학생이 그린다).
 * 정답 파형은 `solutionFigures`로 따로 보낸다 — 본문에 두면 [단계 3]의 답이 노출된다.
 */
function buildWaveform(g: FfReachGeneration, blankQ: boolean): WaveformDiagram {
  const n = g.values.xSeq.length;
  const qaVals = g.steps.map((s) => s.qa);
  const qbVals = g.steps.map((s) => s.qb);
  const qTrack = (name: string, vals: number[]) =>
    blankQ
      ? { name, samples: [], shape: "step" as const, blank: true, vRange: { min: 0, max: 1 } }
      : { name, samples: holdSamples(vals, n), shape: "step" as const };

  return {
    signals: [
      { name: "CLK", samples: clockSamples(n), shape: "step" },
      { name: "X", samples: holdSamples(g.values.xSeq, n), shape: "step" },
      qTrack("Q_A", qaVals),
      qTrack("Q_B", qbVals),
    ],
    unit: { time: "clk" },
    xAxis: { symbol: "t" },
    markers: Array.from({ length: n }, (_, k) => ({ t: PULSE * k, label: `${k + 1}` })),
  };
}

/**
 * 발문은 **〈해석 절차〉 3단계 서술형**이다 — 원본이 보기 ①~⑤ 객관식이므로
 * 프로젝트 절대원칙(객관식 → 3단계 주관식)을 따른다. 구조·원리는 그대로 두고 형식만 바꾼다.
 * ★ 사용자 지정(2026-08-13): 결론은 **Q_A·Q_B 파형을 그리는 것**이다.
 */
function buildText(g: FfReachGeneration) {
  const v = g.values;
  const gateName = GATE_KR[v.gate];
  const gIn1 = v.invertX ? "\\overline{X}" : "X";
  const kindA = v.tffAt === "A" ? "T" : "D";
  const kindB = v.tffAt === "B" ? "T" : "D";
  const inA = kindA === "D" ? "D_A" : "T_A";
  const inB = kindB === "D" ? "D_B" : "T_B";
  const initTex = `\\( (Q_A, Q_B) = (${v.init[0]}, ${v.init[1]}) \\)`;

  const content = [
    `그림 (가)는 ${kindA} 플립플롭과 ${kindB} 플립플롭으로 구성된 동기식 순서논리회로이고,`,
    "(나)는 이 회로에 인가되는 클럭 CLK와 입력 X의 타이밍 도표이다.",
    "〈해석 절차〉에 따라 출력 \\( Q_A \\), \\( Q_B \\)의 파형을 구하시오.",
  ].join(" ");

  const conditions = [
    `플립플롭의 초기 상태는 ${initTex}이다.`,
    "두 플립플롭은 같은 클럭으로 동작하는 **상승 에지** 트리거이며, 모든 소자는 이상적이라고 가정한다.",
    "T 플립플롭의 여기 관계는 \\( Q(t+1) = Q \\oplus T \\)이다.",
    "(나)의 X는 각 클럭 구간 동안 그 값을 유지한다.",
  ];

  const question = [
    `[단계 1] 각 플립플롭의 입력 \\( ${inA} \\)와 \\( ${inB} \\)를 X와 \\( Q_A \\)로 나타내고, ` +
      `그로부터 다음 상태 \\( Q_A(t+1) \\), \\( Q_B(t+1) \\)의 식을 세우시오.`,
    `[단계 2] 초기 상태 ${initTex}에서 시작하여 (나)의 X 입력을 클럭 순서대로 적용하며, ` +
      "각 클럭에서 두 플립플롭의 입력값과 다음 상태를 순서대로 구하시오.",
    "[단계 3] [단계 2]의 결과를 이용하여 (나)의 빈 트랙에 \\( Q_A \\)와 \\( Q_B \\)의 파형을 도시하시오.",
  ].join("\n");

  const nextA = kindA === "D" ? "X" : "Q_A \\oplus X";
  const gateExpr = `${gIn1} \\;\\text{${gateName}}\\; Q_A`;
  const nextB = kindB === "D" ? gateExpr : `Q_B \\oplus (${gateExpr})`;

  const qaSeq = g.steps.map((s) => s.qa).join(" → ");
  const qbSeq = g.steps.map((s) => s.qb).join(" → ");

  const answer = [
    `[단계 1] \\( ${inA} = X \\), \\( ${inB} = ${gateExpr} \\) → ` +
      `\\( Q_A(t+1) = ${nextA} \\), \\( Q_B(t+1) = ${nextB} \\).`,
    `[단계 2] X = ${v.xSeq.join(", ")} 를 차례로 인가하면 ` +
      `\\( Q_A \\): ${qaSeq} / \\( Q_B \\): ${qbSeq} (초기값부터 클럭 순).`,
    `[단계 3] 위 값열대로 \\( Q_A \\)·\\( Q_B \\) 파형을 그린다. ` +
      `클럭 상승 에지마다 값이 갱신되며, 나타나는 상태는 ` +
      `${g.reachable.map((s) => `(${s[0]},${s[1]})`).join(", ")} 이다` +
      (g.unreachable.length > 0
        ? ` (\\( ${g.unreachable.map((s) => `(${s[0]},${s[1]})`).join(", ")} \\)는 나타나지 않는다).`
        : "."),
  ].join("\n");

  const rows = g.steps.slice(1)
    .map((s, k) => {
      const prev = g.steps[k];
      return `  클럭 ${k + 1}: X=${v.xSeq[k]}, (Q_A,Q_B)=(${prev.qa},${prev.qb}) → ` +
        `${inA}=${s.inA}, ${inB}=${s.inB} → (${s.qa},${s.qb})`;
    })
    .join("\n");

  const solution = [
    `[단계 1] FF_A의 입력은 X에 직결되므로 \\( ${inA} = X \\)이고, ` +
      (kindA === "D"
        ? "D 플립플롭이므로 \\( Q_A(t+1) = X \\)이다."
        : "T 플립플롭이므로 \\( Q_A(t+1) = Q_A \\oplus X \\)이다.") + "\n" +
      `  게이트는 ${v.invertX ? "인버터를 거친 \\( \\overline{X} \\)" : "\\( X \\)"}와 \\( Q_A \\)를 ` +
      `${gateName}하므로 \\( ${inB} = ${gateExpr} \\)이고, ` +
      (kindB === "D"
        ? `\\( Q_B(t+1) = ${gateExpr} \\)이다.`
        : `T 플립플롭이므로 \\( Q_B(t+1) = Q_B \\oplus (${gateExpr}) \\)이다.`),
    `[단계 2] 초기 상태 ${initTex}에서 클럭마다 추적한다.\n${rows}`,
    `[단계 3] \\( Q_A \\)는 ${qaSeq}, \\( Q_B \\)는 ${qbSeq} 로 변한다.\n` +
      `  각 클럭의 상승 에지에서 값이 갱신되므로, 그 시점마다 파형의 높이를 바꿔 그린다.\n` +
      `  ★ 두 출력이 동시에 취하는 상태는 ${g.reachable.map((s) => `(${s[0]},${s[1]})`).join(", ")} 뿐이다` +
      (g.unreachable.length > 0
        ? ` — ${g.unreachable.map((s) => `(${s[0]},${s[1]})`).join(", ")}는 이 회로에서 나타날 수 없다.`
        : "."),
  ].join("\n\n");

  return { content, conditions, question, answer, solution };
}

export async function runFfReachableStatesPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateFfReachableStates({ seed, index: i, mode });
    const v = gen.values;
    log.info("ff_reachable_states_generated", {
      mode, tffAt: v.tffAt, gate: v.gate, invertX: v.invertX,
      init: v.init.join(""), xSeq: v.xSeq.join(""),
      qa: gen.steps.map((s) => s.qa).join(""), qb: gen.steps.map((s) => s.qb).join(""),
    });
    const text = buildText(gen);

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_logic_${i + 1}`,
        label: "(가) 동기식 순서논리회로",
        role: "main_circuit",
        diagramType: "logic_network",
        diagram: gen.diagram,
      },
      {
        id: `fig_wave_${i + 1}`,
        label: "(나) 타이밍 도표 — Q_A·Q_B는 직접 그린다",
        role: "waveform",
        diagramType: "waveform",
        diagram: buildWaveform(gen, true),
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
      solutionFigures: [
        {
          id: `fig_wave_ans_${i + 1}`,
          label: "정답 파형",
          role: "solution_waveform",
          diagramType: "waveform",
          diagram: buildWaveform(gen, false),
        },
      ],
    } as GeneratedProblem;
  });
}
