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
 * 문제의 "값 세트"를 식별하는 서명.
 *
 * 본문·문항·정답(content·question·answer)은 모두 GPT가 생성하므로 같은 값이라도 표현이
 * 미세하게 달라질 수 있어 신뢰할 수 없다(같은 페어인데 서명이 어긋나 중복을 놓침).
 * 따라서 GPT가 손대지 않는 결정론 데이터인 figure diagram(netlist의 소자 값 등)만으로 식별한다.
 * figure id·label은 인덱스가 섞여 있으므로 제외하고 diagram 본문만 직렬화한다.
 *
 * figure가 없는 문제는 이 계층에서 결정론 지문이 없으므로 answer로 폴백(best-effort).
 */
function problemSignature(p: GeneratedProblem): string {
  const diagrams = (p.figureVariants ?? []).map((f) => f.diagram);
  if (diagrams.length > 0) return JSON.stringify(diagrams);
  return p.answer ?? "";
}

/**
 * count개 문제를 생성하되 서로 다른 값 세트가 되도록 보장(가능한 범위에서).
 *
 * 결정론 generator는 보통 작은 사전 페어 풀에서 복원추출(`pick`)로 값을 고르므로,
 * 같은 seed 계열이라도 중복이 흔하다(예: 풀 3개에서 count=3이면 중복 확률 매우 높음).
 * 따라서 1차 병렬 생성 후, 중복된 문제는 seed를 흔들어 재생성한다.
 *
 * 풀이 count보다 작으면 모든 문제를 다르게 만들 수 없다(풀 크기 한계) — 이 경우
 * MAX_ATTEMPTS 소진 후 중복을 그대로 둔다. (해결하려면 해당 archetype의 페어 풀을 늘려야 함.)
 *
 * @param count 생성할 문제 개수
 * @param taskFn (index, seed) => Promise<GeneratedProblem>
 */
export async function generateInParallel(
  count: number,
  taskFn: (index: number, seed: number) => Promise<GeneratedProblem>,
): Promise<GeneratedProblem[]> {
  const baseSeed = Date.now();
  const seedFor = (i: number, attempt: number) => baseSeed + i * 7919 + attempt * 104729;

  // 1차: 병렬 생성
  const problems = await Promise.all(
    Array.from({ length: count }, (_, i) => taskFn(i, seedFor(i, 0))),
  );

  // 2차: 중복 제거 — 이미 채택된 서명과 겹치면 seed를 바꿔 재생성
  const MAX_ATTEMPTS = 16;
  const seen = new Set<string>();
  const out: GeneratedProblem[] = [];
  for (let i = 0; i < problems.length; i++) {
    let p = problems[i];
    let attempt = 0;
    while (seen.has(problemSignature(p)) && attempt < MAX_ATTEMPTS) {
      attempt += 1;
      p = await taskFn(i, seedFor(i, attempt));
    }
    seen.add(problemSignature(p));
    out.push(p);
  }
  return out;
}
