/**
 * 디지털 순서논리(D-FF) generic 파이프라인 (임용 12번).
 *  업로드 구조 추출(LogicNetworkDiagram) → seqSpec 도출 → 입력파형 시뮬레이션 →
 *  상태 시퀀스 + (가) 회로 + (나) 타이밍 도표(클록·A·B + ㉠㉡㉢ + Q 빈칸) + 3단계 풀이.
 *  예시 하드코딩 없음 — 구조·상태는 모두 추출/시뮬레이션에서.
 */

import { randomUUID } from "node:crypto";
import { getOpenAI, DEFAULT_MODEL, withRateLimitRetry } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { extractSequentialLogic } from "@/lib/generation/digital/extractSequentialLogic";
import { seqSpecFromLogicNetwork, simulateSequential } from "@/lib/digital/sequentialSim";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult, type FigureVariant, type GeneratedProblem,
  type GenerationMode, type TopicKey, type WaveformDiagram, type LogicNetworkDiagram,
} from "@/types";

const log = createLogger("lib/pipeline/runSequentialGenericPipeline");

const N = 6;                                  // 클록 사이클 수
const POINTS: Array<{ idx: number; sym: string }> = [{ idx: 1, sym: "㉠" }, { idx: 3, sym: "㉡" }, { idx: 5, sym: "㉢" }];

/** seed로 입력 패턴 생성 (step) — 결정론 해시 기반 다양한 비트열. */
function inputPatterns(inputs: string[], seed: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  inputs.forEach((inp, k) => {
    out[inp] = Array.from({ length: N }, (_, t) => {
      const h = (seed * 2654435761 + k * 40503 + t * 2246822519) >>> 0;
      return ((h ^ (h >>> 13)) & 1);
    });
  });
  return out;
}

function stepSamples(vals: number[]): Array<{ t: number; v: number }> {
  const s = vals.map((v, t) => ({ t, v }));
  s.push({ t: vals.length, v: vals[vals.length - 1] ?? 0 });
  return s;
}

type Txt = { content: string; conditions: string[]; question: string; answer: string; solution: string };

const TEXT_SYSTEM = `너는 디지털 순서논리(D 플립플롭) 임용 문제의 본문·문항·풀이를 쓰는 엔진이다.
회로와 시뮬레이션 결과(각 지점 ㉠㉡㉢의 상태 Q값)가 주어진다. 주어진 상태값을 절대 바꾸지 마라.
출력 JSON 한 개만(코드펜스 금지): {content, question, solution}
- content: "그림 (가)는 D 플립플롭 회로, (나)는 입력 파형. <해석 절차>에 따라 단계별로 구하시오."
- question: 3단계 (\\n): [단계1] (나) ㉠ 지점에서 (가)의 Q값, [단계2] ㉡·㉢에서 Q값,
  [단계3] (가)의 점선 부분을 최소 AND/OR 게이트 논리회로로 도시.
- solution: 클록 에지마다 D=조합논리(입력,현재Q) → 다음 Q 갱신으로 상태 추적. 결과는 주어진 상태값과 일치.`;

async function writeText(args: { states: Record<string, string>; outputs: string[] }): Promise<Txt> {
  const openai = getOpenAI();
  const { states, outputs } = args;
  const qLabel = outputs.join("");
  const answer = POINTS.map((p) => `${p.sym}: ${qLabel}=${states[p.sym]}`).join(", ");
  const userPrompt = [
    `[출력 비트] ${qLabel} (MSB 먼저)`,
    `[각 지점 상태 — 변경 금지] ${answer}`,
    `[확정 정답] ${answer}`,
    ``,
    `위 D-FF 순서논리 문제(content/question/solution) 작성. answer는 [확정 정답] 그대로.`,
  ].join("\n");
  let parsed: Partial<Txt> = {};
  try {
    const c = await withRateLimitRetry(() =>
      openai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "system", content: TEXT_SYSTEM }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" }, max_tokens: 1400,
      }),
    );
    parsed = JSON.parse(c.choices[0]?.message?.content ?? "{}") as Partial<Txt>;
  } catch (e) { log.warn("text_failed", { reason: String(e) }); }
  return {
    content: parsed.content ?? "그림 (가)는 D 플립플롭을 이용한 회로, (나)는 입력 파형이다. <해석 절차>에 따라 구하시오.",
    conditions: ["모든 소자는 이상적으로 동작", "클록 상승에지에서 상태 갱신", "(나)의 ㉠㉡㉢ 지점에서 상태 관찰"],
    question: parsed.question ?? `[단계 1] (나) ㉠ 지점에서 (가)의 ${qLabel} 값을 구한다.\n[단계 2] ㉡·㉢ 지점에서 ${qLabel} 값을 각각 구한다.\n[단계 3] (가)의 점선 부분을 최소한의 AND·OR 게이트 논리회로로 도시한다.`,
    answer,
    solution: parsed.solution ?? "(풀이 미생성)",
  };
}

export async function runSequentialGenericPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const ex = await extractSequentialLogic({ analysis, mode, seed });
    const spec = seqSpecFromLogicNetwork(ex.diagram);
    const order = ex.ffOutputs;
    // 여러 입력 패턴을 시도해 ㉠㉡㉢ 상태가 가장 다양한 것 선택 (모두 같은 고정점 회피).
    let inputWaves = inputPatterns(spec.inputs, seed % N);
    let sim = simulateSequential({ spec, inputWaves, cycles: N });
    let best = -1;
    for (let cand = 0; cand < 8; cand++) {
      const iw = inputPatterns(spec.inputs, (seed + cand * 2) % (N * 4));
      const s = simulateSequential({ spec, inputWaves: iw, cycles: N });
      const distinct = new Set(POINTS.map((p) => order.map((q) => s.trace[q]?.[p.idx] ?? 0).join(""))).size;
      if (distinct > best) { best = distinct; inputWaves = iw; sim = s; if (distinct === POINTS.length) break; }
    }
    const states: Record<string, string> = {};
    for (const p of POINTS) states[p.sym] = order.map((q) => sim.trace[q]?.[p.idx] ?? 0).join("");
    log.info("seq_generic_generated", { states, inputs: spec.inputs, ffOutputs: order });

    const text = await writeText({ states, outputs: order });

    // (나) 타이밍: 클록(step square) + 외부입력(step) + Q(빈칸 트랙, 학생 도출)
    const clockVals = Array.from({ length: N }, (_, t) => (t % 2 === 0 ? 1 : 0));
    const timing: WaveformDiagram = {
      signals: [
        { name: "클록", shape: "step", samples: stepSamples(clockVals) },
        ...spec.inputs.map((inp) => ({ name: inp, shape: "step" as const, samples: stepSamples(inputWaves[inp]) })),
        ...order.map((q) => ({ name: q, shape: "step" as const, samples: [], blank: true, vRange: { min: 0, max: 1 } })),
      ],
      xAxis: { symbol: "t", unit: "" },
      markers: POINTS.map((p) => ({ t: p.idx, label: p.sym })),
    };

    const figureVariants: FigureVariant[] = [
      { id: `fig_main_${i + 1}`, label: "(가) D 플립플롭 회로", role: "implementation_circuit", diagramType: "logic_network", diagram: ex.diagram as unknown as Record<string, unknown> },
      { id: `fig_wave_${i + 1}`, label: "(나) 입력 파형", role: "input_waveform", diagramType: "waveform", diagram: timing as unknown as Record<string, unknown> },
    ];
    return {
      id: randomUUID(),
      content: text.content, conditions: text.conditions, question: text.question,
      answer: text.answer, solution: text.solution,
      topicKey, figureVariants,
    };
  });
}

// (참조: LogicNetworkDiagram 타입 사용 보장)
export type _SeqDiagram = LogicNetworkDiagram;
