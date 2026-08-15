import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  generateFfFeedbackZ, matchesFfFeedbackZ, type FbGeneration,
} from "@/lib/generation/topologies/ffFeedbackZWaveform";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem, type GenerationMode,
  type TopicKey, type WaveformDiagram,
} from "@/types";

const log = createLogger("lib/pipeline/runFfFeedbackZPipeline");

/** route 재검출 안전망 — 분류기와 **같은 매처**를 쓴다. */
export function detectFfFeedbackZ(a?: Partial<AnalysisResult> | null): boolean {
  return matchesFfFeedbackZ(a);
}

const GATE_KR: Record<string, string> = {
  AND: "AND", OR: "OR", NAND: "NAND", NOR: "NOR", XOR: "EX-OR", XNOR: "EX-NOR",
};

// 클럭 k = [2k, 2k+2), 상승 에지 t = 2k. shape="step"은 zero-order hold라
// **값이 바뀌는 샘플 시각 = 전이 에지**다. 같은 t에 두 번 찍으면 waveform_time_not_monotonic이 난다.
const PULSE = 2;

function clockSamples(n: number) {
  const out: Array<{ t: number; v: number }> = [];
  for (let k = 0; k <= n; k += 1) { out.push({ t: PULSE * k, v: 1 }); out.push({ t: PULSE * k + 1, v: 0 }); }
  out.push({ t: PULSE * (n + 1), v: 0 });
  return out;
}
function holdSamples(vals: number[], n: number) {
  const out: Array<{ t: number; v: number }> = [];
  for (let k = 0; k < vals.length; k += 1) out.push({ t: PULSE * k, v: vals[k] });
  out.push({ t: PULSE * (n + 1), v: vals[vals.length - 1] });
  return out;
}

/** (나) 타이밍 도표. `blankZ`이면 Z를 **빈 트랙**으로 낸다(학생이 그린다). */
function buildWaveform(g: FbGeneration, blankZ: boolean): WaveformDiagram {
  const v = g.values;
  const n = v.ab.length;
  const clrn = v.ab.map((_, k) => (k < v.clrLow ? 0 : 1));
  const zVals = g.steps.map((s) => s.z);
  return {
    signals: [
      { name: "CLR̄", samples: holdSamples(clrn, n), shape: "step" },
      { name: "CLK", samples: clockSamples(n), shape: "step" },
      { name: "A", samples: holdSamples(v.ab.map((x) => x[0]), n), shape: "step" },
      { name: "B", samples: holdSamples(v.ab.map((x) => x[1]), n), shape: "step" },
      blankZ
        ? { name: "Z", samples: [], shape: "step" as const, blank: true, vRange: { min: 0, max: 1 } }
        : { name: "Z", samples: holdSamples(zVals, n), shape: "step" as const },
    ],
    unit: { time: "clk" },
    xAxis: { symbol: "t" },
    markers: Array.from({ length: n }, (_, k) => ({ t: PULSE * k, label: `${k + 1}` })),
  };
}

/**
 * 발문은 **〈해석 절차〉 3단계 서술형** — 원본이 보기 ①~⑤ 객관식이므로 절대원칙을 따른다.
 * ★ 사용자 지정(2026-08-13): 결론은 **A·B에 따른 Z 파형을 그리는 것**이다.
 */
function buildText(g: FbGeneration) {
  const v = g.values;
  const gt = GATE_KR[v.gTop], gb = GATE_KR[v.gBot], gj = GATE_KR[v.gJoin];
  const k1 = v.tffAt === "front" ? "T" : "D";
  const k2 = v.tffAt === "back" ? "T" : "D";
  const in1 = `${k1}_1`, in2 = `${k2}_2`;

  const content = [
    `그림 (가)는 ${k1} 플립플롭과 ${k2} 플립플롭을 활용한 동기식 순서논리회로이고,`,
    "(나)는 이 회로에 인가되는 CLR̄, CLK, A, B의 입력 파형이다.",
    "〈해석 절차〉에 따라 출력 Z의 파형을 구하시오.",
  ].join(" ");

  const conditions = [
    "CLR̄은 비동기식 리셋을 의미하며, '0'이 입력될 때 플립플롭 출력을 '0'으로 만든다.",
    "소자의 지연 시간은 무시하고, 두 플립플롭은 같은 클럭의 상승 에지에서 동작한다.",
    "T 플립플롭의 여기 관계는 \\( Q(t+1) = Q \\oplus T \\)이다.",
    "출력 \\( Z \\)는 뒷단 플립플롭의 출력 \\( Q_2 \\)이다.",
  ];

  const question = [
    `[단계 1] 앞단 플립플롭의 입력 \\( ${in1} \\)을 A, B, Z로 나타내고, ` +
      `뒷단 입력 \\( ${in2} \\)와 함께 다음 상태 \\( Q_1(t+1) \\), \\( Q_2(t+1) \\)의 식을 세우시오.`,
    "[단계 2] A와 B의 조합에 따라 앞단 입력이 어떻게 달라지는지 세 경우로 나누어 설명하시오. " +
      "특히 출력 Z가 되먹임되는 경로의 역할을 밝히시오.",
    "[단계 3] (나)의 입력 파형에 대해 클럭마다 상태를 추적하고, 출력 Z의 파형을 빈 트랙에 도시하시오.",
  ].join("\n");

  // ★ 다음 상태 식은 **발문에서 쓴 입력 기호**(T_1·D_2 …)로 쓴다.
  //   내부 신호 이름 `S`를 그대로 쓰면 발문의 \( T_1 \)과 어긋난다(실측 — 같은 값을 두 이름으로 불렀다).
  const next1 = k1 === "D" ? in1 : `Q_1 \\oplus ${in1}`;
  const next2 = k2 === "D" ? in2 : `Q_2 \\oplus ${in2}`;
  const sExpr = `(\\overline{A} \\;\\text{${gt}}\\; Z) \\;\\text{${gj}}\\; (A \\;\\text{${gb}}\\; B)`;

  const zSeq = g.steps.map((s) => s.z).join(" → ");
  const q1Seq = g.steps.map((s) => s.q1).join(" → ");

  const answer = [
    `[단계 1] \\( ${in1} = ${sExpr} \\), \\( ${in2} = Q_1 \\) → ` +
      `\\( Q_1(t+1) = ${next1} \\), \\( Q_2(t+1) = ${next2} \\), \\( Z = Q_2 \\).`,
    `[단계 2] A=0이면 앞단 입력이 \\( \\overline{A} \\;\\text{${gt}}\\; Z \\) 쪽으로 결정되어 ` +
      `**Z의 현재 값이 되먹임으로 되돌아온다**. A=1이면 되먹임 경로가 끊기고 B가 값을 정한다.`,
    `[단계 3] \\( Q_1 \\): ${q1Seq} / \\( Z \\): ${zSeq} (초기값부터 클럭 순). 이 값열대로 파형을 그린다.`,
  ].join("\n");

  const rows = g.steps.slice(1).map((s, k) => (
    s.clrn === 0
      ? `  클럭 ${k + 1}: CLR̄=0 → 비동기 리셋, (Q₁,Q₂)=(0,0), Z=0`
      : `  클럭 ${k + 1}: A=${s.a}, B=${s.b} → ${in1}=${s.in1}, ${in2}=${s.in2} → (Q₁,Q₂)=(${s.q1},${s.q2}), Z=${s.z}`
  )).join("\n");

  const solution = [
    `[단계 1] 위쪽 게이트는 \\( \\overline{A} \\)와 되먹임된 Z를 ${gt}하여 P를, ` +
      `아래쪽 게이트는 A와 B를 ${gb}하여 R을 만든다. 두 결과를 ${gj}한 것이 앞단 입력이다.\n` +
      `  \\( ${in1} = ${sExpr} \\), 뒷단은 앞단 출력을 그대로 받으므로 \\( ${in2} = Q_1 \\)이다.\n` +
      `  ${k1} 플립플롭이므로 \\( Q_1(t+1) = ${next1} \\), ${k2} 플립플롭이므로 \\( Q_2(t+1) = ${next2} \\).`,
    `[단계 2] ★ 이 회로의 핵심은 **되먹임과 2단 지연**이다.\n` +
      `  · A=0 : 아래쪽 게이트가 B와 무관하게 고정되고, 위쪽 게이트가 Z를 받아 ` +
      `**현재 출력이 다시 입력으로 돌아온다**(값을 붙잡는다).\n` +
      `  · A=1 : \\( \\overline{A}=0 \\)이라 되먹임이 끊기고 B가 앞단 입력을 정한다.\n` +
      `  · 어느 경우든 앞단에서 정해진 값은 **뒷단을 한 번 더 거쳐야** Z에 나타나므로 ` +
      `A·B의 변화는 **두 클럭 뒤**에 관찰된다.`,
    `[단계 3] CLR̄=0인 동안은 클럭과 무관하게 (Q₁,Q₂)=(0,0)이다. 그 뒤 클럭마다 추적한다.\n${rows}\n` +
      `  따라서 Z는 ${zSeq} 로 변한다 — 각 클럭의 상승 에지에서 값이 갱신되므로 그 시점마다 높이를 바꿔 그린다.`,
  ].join("\n\n");

  return { content, conditions, question, answer, solution };
}

export async function runFfFeedbackZPipeline(args: {
  analysis?: AnalysisResult | null; mode: GenerationMode; count: number; topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  return generateInParallel(count, async (i, seed) => {
    const gen = generateFfFeedbackZ({ seed, index: i, mode });
    const v = gen.values;
    log.info("ff_feedback_z_generated", {
      mode, gates: `${v.gTop}/${v.gBot}/${v.gJoin}`, tffAt: v.tffAt,
      z: gen.steps.map((s) => s.z).join(""),
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
        label: "(나) 입력 파형 — Z는 직접 그린다",
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
          label: "정답 파형 (Z)",
          role: "solution_waveform",
          diagramType: "waveform",
          diagram: buildWaveform(gen, false),
        },
      ],
    } as GeneratedProblem;
  });
}
