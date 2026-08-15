import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { detectClockEdge } from "@/lib/analysis/clockEdge";
import {
  MODE_LABEL,
  clearBar,
  generateDffPresetClearRegions,
  matchesDffPresetClearSignature,
  presetBar,
  type DffPresetClearGeneration,
} from "@/lib/generation/topologies/dffPresetClearRegions";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDffPresetClearRegionsPipeline");

/**
 * route의 재검출 안전망 — 프론트가 analysis를 state에 캐시하므로 분류기 수정만으로는 부족하다
 * (CLAUDE.md 1번 규칙). 분류기와 **같은 매처**를 쓴다(복제 금지).
 */
export function detectDffPresetClearRegions(analysis?: Partial<AnalysisResult> | null): boolean {
  return matchesDffPresetClearSignature(analysis);
}

const AB = (a: number, b: number) => `A = ${a}, B = ${b}`;

/** 구간별 표 한 줄 — PR̄·CLR̄ 논릿값과 동작. */
function regionLine(g: DffPresetClearGeneration, k: number): string {
  const r = g.regions[k];
  const pr = presetBar(g.decode, r.a, r.b);
  const clr = clearBar(g.decode, r.a, r.b);
  return `${g.regionMarks[k]} (${AB(r.a, r.b)}) : PR‾ = ${pr}, CLR‾ = ${clr} → ${MODE_LABEL[g.sim.modes[k]]}`;
}

/** 구간별 Q 값 서술 — 토글이면 클럭 순서대로 나열한다. */
function qLine(g: DffPresetClearGeneration, k: number): string {
  const mark = g.regionMarks[k];
  const mode = g.sim.modes[k];
  const seq = g.sim.qPerRegion[k];
  if (mode === "toggle") {
    return `${mark} : 클럭 ${seq.length}개에 대해 Q = ${seq.join(" → ")} (구간 시작 직전 Q = ${k === 0 ? g.initialQ : g.sim.qAtEnd[k - 1]})`;
  }
  return `${mark} : 구간 전체에서 Q = ${seq[0]} (비동기 입력이 붙들고 있어 클럭과 무관)`;
}

function buildText(g: DffPresetClearGeneration, mode: GenerationMode) {
  const edgeWord = g.clockEdge === "rising" ? "상승" : "하강";
  const marks = g.regionMarks.join("·");

  const content = [
    "그림 (가)는 비동기 입력 PR(PRESET)과 CLR(CLEAR)을 갖는 D 플립플롭과 논리 게이트로 구성한 회로이다.",
    `플립플롭의 D 입력은 자신의 ${"Q̄"} 출력에 연결되어 있고, 외부 입력 A와 B가 두 NAND 게이트를 거쳐 PR과 CLR을 구동한다.`,
    `그림 (나)는 이 회로에 인가되는 클럭 CLK와 입력 A, B의 파형이며, 시간축은 구간 ${marks}으로 나뉘어 있다.`,
  ].join(" ");

  const conditions = [
    "모든 소자는 이상적인 조건으로 동작한다.",
    `PR과 CLR은 **비동기** 입력이며 그림의 버블이 나타내듯 **0일 때 활성**이다 (PR‾ = 0이면 Q = 1, CLR‾ = 0이면 Q = 0).`,
    `플립플롭은 클럭의 **${edgeWord} 에지**에서 동작하고, 초기 상태는 Q = ${g.initialQ}이다.`,
    "PR과 CLR이 동시에 활성이 되는 입력 조합은 주어지지 않는다.",
  ];

  const question = [
    "〈해석 절차〉에 따라 다음을 구하시오.",
    "",
    `[단계 1] 그림 (가)에서 PR‾과 CLR‾을 입력 A, B에 대한 논리식으로 나타내고, 구간 ${marks} 각각에서 두 신호의 논릿값을 구하시오.`,
    `[단계 2] [단계 1]의 결과로부터 각 구간에서 플립플롭이 하는 동작(세트 / 리셋 / 토글)을 판정하고, 그 근거를 서술하시오.`,
    `[단계 3] [단계 2]를 이용하여 구간 ${marks}에서의 출력 Q의 파형을 시간에 따라 도시하시오.`,
  ].join("\n");

  const answer = [
    `[단계 1] PR‾ = ${g.presetExpr}, CLR‾ = ${g.clearExpr}`,
    ...g.regions.map((_, k) => `  · ${regionLine(g, k)}`),
    "",
    `[단계 2] ${g.regionMarks.map((m, k) => `${m} ${MODE_LABEL[g.sim.modes[k]]}`).join(" / ")}`,
    "",
    "[단계 3] Q 파형",
    ...g.regions.map((_, k) => `  · ${qLine(g, k)}`),
    `  · 최종 Q = ${g.sim.qAtEnd[g.sim.qAtEnd.length - 1]}`,
  ].join("\n");

  const solution = [
    `[단계 1] PR과 CLR은 NAND 출력이 구동하므로 각각 PR‾ = ${g.presetExpr}, CLR‾ = ${g.clearExpr}이다.`,
    `NAND는 두 입력이 모두 1일 때만 출력이 0이므로, 괄호 안의 곱항이 1이 되는 (A, B)에서만 해당 비동기 입력이 활성(0)이 된다.`,
    ...g.regions.map((_, k) => `  ${regionLine(g, k)}`),
    "",
    `[단계 2] PR‾ = 0이면 클럭과 무관하게 Q = 1로 세트되고, CLR‾ = 0이면 Q = 0으로 리셋된다.`,
    `둘 다 1(비활성)이면 플립플롭은 정상 동작하는데, D = Q̄이므로 클럭 ${edgeWord} 에지마다 Q가 반전(토글)된다.`,
    `따라서 ${g.regionMarks.map((m, k) => `${m}는 ${MODE_LABEL[g.sim.modes[k]]}`).join(", ")}이다.`,
    "",
    `[단계 3] 비동기 입력이 활성인 구간에서는 Q가 구간 내내 고정되고, 토글 구간에서만 클럭마다 반전된다.`,
    ...g.regions.map((_, k) => `  ${qLine(g, k)}`),
    `초기 Q = ${g.initialQ}에서 출발해 위 순서로 진행하면 최종 Q = ${g.sim.qAtEnd[g.sim.qAtEnd.length - 1]}이다.`,
    mode === "exam_variant"
      ? "※ 이 회로는 A = 1일 때만 PR·CLR이 동작하고 A = 0에서 토글한다 — 인에이블 극성에 주의한다."
      : "※ 이 회로는 A = 0일 때만 PR·CLR이 동작하고 A = 1에서 토글한다 — 인에이블 극성에 주의한다.",
  ].join("\n");

  return { content, conditions, question, answer, solution };
}

export async function runDffPresetClearRegionsPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  // 원본 (가)의 CLK 핀에는 버블이 없다 → 기본은 상승 에지. 분석에 근거가 있으면 그쪽을 따른다.
  const clockEdge = detectClockEdge(analysis) ?? "rising";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDffPresetClearRegions({ seed, index: i, mode, clockEdge });
    log.info("dff_preset_clear_generated", {
      mode,
      clockEdge,
      regions: gen.regions.map((r) => `${r.a}${r.b}x${r.pulses}`).join(","),
      modes: gen.sim.modes.join(","),
    });

    const text = buildText(gen, mode);

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_circuit_${i + 1}`,
        label: "(가) D 플립플롭 + 비동기 PR·CLR 응용 회로",
        role: "main_circuit",
        diagramType: "dff_preset_clear_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_waveform_${i + 1}`,
        label: "(나) 클럭 CLK와 입력 A, B의 파형 (Q는 학생이 도시)",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveformTemplate,
      },
    ];

    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_waveform_solution_${i + 1}`,
        label: "(나) 정답 — 출력 Q 파형",
        role: "solution_waveform",
        diagramType: "waveform",
        diagram: gen.waveformSolution,
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
      solutionFigures,
    };
  });
}
