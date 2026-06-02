import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { buildFromTopology } from "@/lib/generation/topologyDriven/buildFromTopology";
import { perturbTopology } from "@/lib/generation/topologyDriven/perturbTopology";
import {
  inferAcQueries,
  resolveAcQueryRefs,
} from "@/lib/generation/topologyDriven/inferAcQueries";
import { solveAcQueries, type AcQuery, type AcQueryResult } from "@/lib/solver/universalAc";
import { netlistToComplexStandalone } from "@/lib/solver/netlistToComplex";
import { validateAcResult } from "@/lib/solver/validateAcResult";
import { addLoadResistor } from "@/lib/generation/topologyDriven/addLoadResistor";
import { writeUniversalAcText } from "@/lib/generation/topologies/universalAcTextWriter";
import { applyRlExamVariant } from "@/lib/analysis/topologyRecovery";
import { GenerateError } from "@/lib/generation/_core";
import { buildContextHint, generateInParallel } from "./_common";
import {
  TOPIC_LABEL,
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runUniversalAcPipeline");

/**
 * Universal AC pipeline — archetype 없이 임의 AC 회로(R/L/C/V/I) + phasor·공진·최대전력 query 처리.
 *
 *   path:
 *     1) perturbTopology + buildFromTopology (DC와 동일, 단 L/C 포함)
 *     2) netlistToComplex로 DC SolverNetwork + L/C → ComplexSolverNetwork (with omega)
 *     3) inferAcQueries → resolveAcQueryRefs (label/component id 매핑)
 *     4) solveAcQueries로 phasor 해석 + sweep
 *     5) validate + rejection sampling
 *     6) writeUniversalAcText
 */
export async function runUniversalAcPipeline(args: {
  analysis: AnalysisResult;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { analysis, mode, count, topicKey } = args;
  const topicLabel = topicKey ? TOPIC_LABEL[topicKey] : undefined;
  const contextHint = buildContextHint(analysis);
  let baseTopology = analysis.topologySignature;
  if (!baseTopology) {
    throw new Error("runUniversalAcPipeline: analysis.topologySignature 누락");
  }

  // ★ 기출변형유형 변형 — pattern_rl_v2 → L→C swap + R 직렬 ladder (임용 8번 variant).
  //   exam_similar는 원본 V·L 직렬 + R 병렬 유지, exam_variant만 변형.
  if (mode === "exam_variant") {
    const variant = applyRlExamVariant(baseTopology);
    if (variant) {
      baseTopology = variant;
      log.info("variant_topology_applied", { transform: "rl_exam_variant" });
    }
  }

  // omega — analysis에서 추출. relatedConcepts·interpretation에서 "10^4 rad/s" 같은 패턴 검색.
  //   못 찾으면 기본 1e4.
  const omega = extractOmega(analysis) ?? 1e4;
  log.info("omega_selected", { omega });

  const rawQueries = inferAcQueries(analysis);
  // inverseC query는 targetOmega 자동 채움
  for (const q of rawQueries) {
    if (q.kind === "inverseC" && !q.targetOmega) q.targetOmega = omega;
  }

  return generateInParallel(count, async (i, seed) => {
    const MAX_ATTEMPTS = 24;
    type Attempt = {
      gen: ReturnType<typeof buildFromTopology>;
      queryResults: AcQueryResult[];
      niceness: number;
      reasons: string[];
    };
    let chosen: Attempt | null = null;
    let bestFallback: Attempt | null = null;

    const hasMaxPowerQuery = rawQueries.some((q) => q.kind === "maxAvgPower");

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const localSeed = seed + attempt * 104729;
      const perturbedTopology = perturbTopology(baseTopology, mode, localSeed);
      const gen = buildFromTopology({ topology: perturbedTopology, mode, seed: localSeed });

      // ★ 최대전력 문제 — 부하 R_L을 측정 단자에 별도 component로 추가.
      //   R_L은 그림의 placeholder(inventory 제외 대상)이므로 회로 기존 R(전원 내부저항 등)을
      //   가변으로 바꾸지 않고 부하 단자에 새로 추가해야 원본과 같은 회로가 된다.
      const loadInfo = hasMaxPowerQuery
        ? addLoadResistor(gen.netlistOpen, analysis)
        : null;

      // netlist 단독으로 ComplexSolverNetwork 구성 (DC solver 결과 의존 안 함)
      const complexNet = netlistToComplexStandalone(gen.netlistOpen, omega);
      // R_L은 비수치 값("R_L")이라 complexNet에서 빠짐 — placeholder 1Ω로 등록 (sweep이 교체)
      if (loadInfo && !complexNet.resistors.some((r) => r.id === loadInfo.id)) {
        complexNet.resistors.push({ id: loadInfo.id, a: loadInfo.nodeA, b: loadInfo.nodeB, R: 1 });
      }

      const resolved: AcQuery[] = resolveAcQueryRefs(
        rawQueries,
        gen.netlistOpen,
        analysis,
      );

      let queryResults: AcQueryResult[] = [];
      try {
        queryResults = solveAcQueries(complexNet, resolved);
      } catch (e) {
        log.warn("ac_solve_failed", { attempt, error: (e as Error).message });
        continue;
      }
      const verdict = validateAcResult(queryResults);
      const att: Attempt = { gen, queryResults, niceness: verdict.niceness, reasons: verdict.reasons };

      if (verdict.valid) {
        chosen = att;
        log.info("ac_attempt_accepted", { attempt, niceness: verdict.niceness });
        break;
      }
      if (!bestFallback || att.niceness > bestFallback.niceness) bestFallback = att;
      log.info("ac_attempt_rejected", { attempt, reasons: verdict.reasons.slice(0, 3) });
    }

    const final = chosen ?? bestFallback;
    if (!final) {
      throw new Error("Universal AC pipeline: 모든 attempt가 실패 (해석 불가)");
    }
    if (!chosen) {
      log.warn("ac_rejection_exhausted", { fallbackNiceness: final.niceness });
    }

    // ★ NaN 게이트 — fallback조차 NaN/Inf면 답이 깨진 문제를 출력하지 않고 생성 자체를 실패시킨다.
    //   원인은 대부분 inventory 추출 누락(R 없는 회로 등)으로 회로가 해석 불가능한 경우.
    const brokenResults = final.queryResults.filter((r) => !Number.isFinite(r.value));
    if (brokenResults.length > 0) {
      const labels = brokenResults.map((r) => r.query.label).join(", ");
      log.error("ac_result_not_finite", { labels, niceness: final.niceness });
      throw new GenerateError(
        `AC 회로 해석 결과가 유한하지 않습니다 (${labels}). ` +
        "회로 소자 추출이 불완전했을 가능성이 높습니다 — 이미지를 다시 분석해 주세요.",
      );
    }

    // R_L은 addLoadResistor가 이미 별도 component로 추가함 (value "R_L" 표시).
    //   기존 회로 R은 모두 고정값 유지 — findVariableResistor로 기존 R을 가변으로 바꾸던
    //   이전 동작은 전원 내부저항을 부하로 오선택하는 버그라 제거 (2026-06-03).
    // analysis loadPlaceholders 제거 (보라 dashed box 중복 방지)
    final.gen.netlistOpen.loadPlaceholders = [];

    const text = await writeUniversalAcText({
      generation: final.gen,
      queryResults: final.queryResults,
      omega,
      mode,
      topicLabel,
      contextHint,
    });

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_main_${i + 1}`,
        label: "주어진 AC 회로",
        role: "original_circuit",
        diagramType: "analog_netlist",
        diagram: final.gen.netlistOpen,
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
    };
  });
}

/**
 * analysis 텍스트에서 ω 값 추출. "ω = 10^4 rad/s", "10000 rad/sec" 등.
 */
function extractOmega(analysis: AnalysisResult): number | undefined {
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => b.sentence).join(" "),
  ].join(" ");
  // "10^4" 표기
  const expMatch = text.match(/(?:ω\d?|omega)\s*=?\s*10\s*\^?\s*(\d+)/i);
  if (expMatch) return Math.pow(10, parseInt(expMatch[1], 10));
  // 직접 숫자 표기 "ω = 1000 rad/s"
  const numMatch = text.match(/(?:ω\d?|omega)\s*=\s*(\d+(?:\.\d+)?)/i);
  if (numMatch) return parseFloat(numMatch[1]);
  // "10^4 rad/sec" 단독 표기
  const expSole = text.match(/10\s*\^\s*(\d+)\s*\[?\s*rad/i);
  if (expSole) return Math.pow(10, parseInt(expSole[1], 10));
  return undefined;
}
