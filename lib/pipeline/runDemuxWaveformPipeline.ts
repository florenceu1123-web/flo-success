import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateDemuxWaveform } from "@/lib/generation/topologies/demuxWaveform";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDemuxWaveformPipeline");

/**
 * 1→4 디멀티플렉서(디코더형) + 출력 파형 도시 (임용 8번) 감지 — 라우팅용.
 *
 * ★ 실측 신고(2026-07-30): `waveform_analysis`(F=SOP + 중간신호 + K-map)로 갔다.
 *   이 원본의 정의적 특징은 **선택선 S₁·S₀로 출력 F₀~F₃가 하나씩 활성화되는 디먹스 동작**이다.
 *
 * 시그니처: 조합논리 + (선택선 S₁·S₀ 또는 디멀티플렉서/디코더) + 다중 출력 F₀~F₃ + 파형 도시.
 *   ★ 양보: MUX 등가 구현(mux_implementation)·플립플롭/순차는 각자 archetype.
 */
export function detectDemuxWaveform(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  // 순차·MUX 유형은 양보
  if (/플립플롭|카운터|상태도|상태표|여기표/.test(text)) return false;
  if (/멀티플렉서|mux/.test(text) && !/디멀티|demux|디코더/.test(text)) return false;

  const demuxCtx = /디멀티플렉서|demux|디코더|decoder/.test(text);
  const selectCtx = /선택\s*선|선택신호|s1|s_1|s₁|s0|s_0|s₀/.test(text);
  const multiOut = /f0|f_0|f₀|f0~f3|f_0\s*~\s*f_3|출력\s*파형|4개의?\s*출력/.test(text);
  const waveform = /파형|타이밍|도시/.test(text);

  return waveform && multiOut && (demuxCtx || selectCtx);
}

/**
 * 1→4 디먹스 + 출력 파형 (임용 8번) — 결정론 파이프라인. GPT 없음.
 *  (가) 회로 + (나) 파형(F₀~F₃ 빈 트랙) → 구간별 출력 파형이 정답.
 */
export async function runDemuxWaveformPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDemuxWaveform({ seed, mode });
    const v = gen.values, a = gen.answer;
    const gate = v.activeLow ? "NAND" : "AND";
    log.info("demux_waveform_generated", {
      mode, gate, segments: v.segments.map((g) => `${g.x}${g.s1}${g.s0}`).join(","),
    });

    const content =
      `그림 (가)와 같은 조합논리회로에서 입력신호와 S₁, S₀가 그림 (나)와 같이 인가될 때, ` +
      `F₀~F₃의 출력 파형을 그림 (나)의 형식에 맞추어 각각 도시하시오. (단, 모든 소자는 이상적으로 동작한다.)`;

    const conditions = [
      `(가): ${gate} 게이트 4개와 인버터 2개로 구성된 1→4 디멀티플렉서. 선택선은 S₁·S₀이다.`,
      v.activeLow
        ? "출력은 active-low이다 — 선택된 출력만 입력신호의 반전이 나타나고, 나머지 출력은 1을 유지한다."
        : "출력은 active-high이다 — 선택된 출력만 입력신호가 그대로 나타나고, 나머지 출력은 0을 유지한다.",
      "(나): 입력신호·S₁·S₀ 파형이 주어지고, F₀~F₃ 트랙은 비어 있다.",
    ];

    const question = "F₀, F₁, F₂, F₃의 출력 파형을 그림 (나)의 형식에 맞추어 각각 도시하시오.";

    const header = "구간 | S₁S₀ | 입력 | F₀ F₁ F₂ F₃";
    const rows = v.segments.map((g, k) => `${k + 1} | ${g.s1}${g.s0} | ${g.x} | ${a.outputs[k].join(" ")}`);
    const answer = [header, ...rows].join("\n");

    const solution = [
      v.activeLow
        ? `각 ${gate} 게이트는 (입력신호, S₁ 또는 S̅₁, S₀ 또는 S̅₀)를 받는다. 선택선이 가리키는 게이트만 세 입력이 모두 1이 될 수 있어 ` +
          `그 출력이 입력신호의 반전으로 나타나고, 나머지 게이트는 입력 중 0이 있어 출력이 1로 고정된다.`
        : `각 ${gate} 게이트는 (입력신호, S₁ 또는 S̅₁, S₀ 또는 S̅₀)를 받는다. 선택선이 가리키는 게이트만 세 입력이 모두 1이 될 수 있어 ` +
          `그 출력이 입력신호와 같아지고, 나머지 게이트는 출력이 0으로 고정된다.`,
      ...a.perSegment,
      `따라서 F₀~F₃ 파형은 위 표의 구간별 값을 계단 파형으로 도시하면 된다.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_demux_ga_${i + 1}`,
        label: `(가) ${gate} 게이트 1→4 디멀티플렉서`,
        role: "implementation_circuit",
        diagramType: "demux_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_demux_na_${i + 1}`,
        label: "(나) 입력 파형과 F₀~F₃ (빈 트랙)",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveformDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}
