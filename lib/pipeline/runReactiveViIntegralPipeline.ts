import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateReactiveViIntegral } from "@/lib/generation/topologies/reactiveViIntegral";
import { generateInParallel } from "./_common";
import type { AnalysisResult, FigureVariant, GeneratedProblem, GenerationMode, TopicKey } from "@/types";

const log = createLogger("lib/pipeline/runReactiveViIntegralPipeline");

/**
 * 이상 인덕터/커패시터 v-i 적분 파이프라인 (결정론, GPT 없음).
 *  exam_similar: 인덕터 v(t)→i(t)=(1/L)∫v dt. exam_variant: 커패시터 i(t)→v(t)=(1/C)∫i dt (쌍대).
 *  (가) 회로 + (나) 입력 파형 → 특정 구간의 출력 식 도출.
 */
export async function runReactiveViIntegralPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i) => {
    const gen = generateReactiveViIntegral({ index: i, mode });
    const { ts, vs, segIdx, element, elemValue, inputName, outputName, inputUnit, outputUnit } = gen;
    const t2 = ts[segIdx], t3 = ts[segIdx + 1];
    const relKo = element === "L" ? "i(t) = (1/L)∫₀ᵗ v(t) dt" : "v(t) = (1/C)∫₀ᵗ i(t) dt";
    const elemKo = element === "L" ? "인덕터" : "커패시터";
    log.info("reactive_vi_integral_generated", { element, elemValue, seg: segIdx, expr: gen.exprLatex });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_circuit_${i + 1}`,
        label: `(가) 이상 ${elemKo} 회로`,
        role: "main_circuit",
        diagramType: "reactive_vi_integral_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_wave_${i + 1}`,
        label: `(나) 입력 ${inputName} 파형`,
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.inputWaveform,
      },
    ];

    const wf = ts.map((t, k) => `(${t}s, ${vs[k]}${inputUnit})`).join(" → ");
    const content = `그림 (가)는 이상 ${elemKo} ${elemValue}${element === "L" ? "H" : "F"} 하나로 구성된 회로를 나타낸 것이다. 입력 ${inputName} [${inputUnit}]가 그림 (나)와 같이 사다리꼴로 주어질 때(꼭짓점 ${wf}), 구간 ${t2}[s] ≤ t < ${t3}[s]에서 ${elemKo}의 ${outputName} [${outputUnit}]의 값을 나타내는 식을 쓰시오. (단, t=0에서 ${outputName}는 0이라 가정한다.)`;

    const conditions = [
      `이상 ${elemKo}이며 저항은 없다. ${relKo}.`,
      `t=0에서 ${outputName} = 0.`,
    ];
    const question = `구간 ${t2} ≤ t < ${t3} 에서 ${outputName}의 값을 나타내는 식을 쓰시오.`;
    const answer = `${outputName} = ${gen.exprLatex} [${outputUnit}]  (${t2} ≤ t < ${t3}). 구간 양끝: ${outputName}(${t2})=${gen.outStart}, ${outputName}(${t3})=${gen.outEnd}.`;

    // 풀이: 구간별 적분 설명.
    const segLines: string[] = [];
    let acc = 0;
    for (let kk = 0; kk <= segIdx; kk++) {
      const area = ((vs[kk] + vs[kk + 1]) / 2) * (ts[kk + 1] - ts[kk]);
      const before = acc;
      acc = Math.round((acc + area / elemValue) * 1000) / 1000;
      const shape = vs[kk] === vs[kk + 1] ? "일정" : (vs[kk + 1] > vs[kk] ? "선형 증가" : "선형 감소");
      segLines.push(`구간 [${ts[kk]},${ts[kk + 1]}] (${inputName} ${shape}): 면적 ${Math.round(area * 1000) / 1000} → ${outputName} ${before} → ${acc}.`);
    }
    const solution = `${outputName}는 ${inputName}의 적분(${relKo})이다. t=0부터 각 구간의 면적을 누적한다(÷${elemValue}).
${segLines.join("\n")}
정답 구간 ${t2}≤t<${t3}에서 ${inputName}가 선형이므로 ${outputName}는 t의 2차식이 되고, ${outputName}(${t2})=${gen.outStart}에서 시작해 적분하면 **${outputName} = ${gen.exprLatex}** 이다. (검산: t=${t3}에서 ${gen.outEnd}.)`;

    return {
      id: randomUUID(),
      content, conditions, question, answer, solution,
      topicKey,
      figureVariants,
    } satisfies GeneratedProblem;
  });
}
