import { randomUUID } from "node:crypto";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type TopicKey,
} from "@/types";

/**
 * 모든 회로-기반 파이프라인이 공유하는 헬퍼.
 *
 *  - buildContextHint: analysis에서 GPT prompt에 넣을 컨텍스트 문자열 추출
 *  - assembleProblem: text + netlist + figure 메타를 GeneratedProblem으로 묶음
 *  - generateInParallel: count개 문제를 병렬 생성 (각 문제마다 시드 다르게)
 */

export function buildContextHint(analysis: AnalysisResult | null | undefined): string | undefined {
  if (!analysis) return undefined;
  const parts: string[] = [];
  if (analysis.topic) parts.push(`주제: ${analysis.topic}`);
  if (analysis.interpretation) parts.push(`해석: ${analysis.interpretation}`);
  if (analysis.relatedConcepts?.length) {
    parts.push(`관련개념: ${analysis.relatedConcepts.join(", ")}`);
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

export function assembleProblem(args: {
  text: {
    content: string;
    conditions: string[];
    question: string;
    answer: string;
    solution: string;
  };
  netlist: unknown;
  figureLabel: string;
  figureRole: string;
  figureIdSuffix: string | number;
  topicKey?: TopicKey;
  /** 추가 figure (waveform 등) — 주 회로 figure 뒤에 append됨 */
  extraFigures?: FigureVariant[];
}): GeneratedProblem {
  const figureVariants: FigureVariant[] = [
    {
      id: `fig_main_${args.figureIdSuffix}`,
      label: args.figureLabel,
      role: args.figureRole,
      diagramType: "analog_netlist",
      diagram: args.netlist,
    },
    ...(args.extraFigures ?? []),
  ];
  return {
    id: randomUUID(),
    content: args.text.content,
    conditions: args.text.conditions,
    question: args.text.question,
    answer: args.text.answer,
    solution: args.text.solution,
    topicKey: args.topicKey,
    figureVariants,
  };
}

/**
 * count개 문제를 병렬 생성. 각 task는 자신만의 seed로 다른 결과 보장.
 *
 * @param count 생성할 문제 개수
 * @param taskFn (index, seed) => Promise<GeneratedProblem>
 */
export async function generateInParallel(
  count: number,
  taskFn: (index: number, seed: number) => Promise<GeneratedProblem>,
): Promise<GeneratedProblem[]> {
  const baseSeed = Date.now();
  const tasks = Array.from({ length: count }, (_, i) => taskFn(i, baseSeed + i * 7919));
  return Promise.all(tasks);
}
