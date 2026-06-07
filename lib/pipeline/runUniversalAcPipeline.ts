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
import { applyRlExamVariant, applySourceReactiveSwapVariant } from "@/lib/analysis/topologyRecovery";
import { generateAcDcSuperposition } from "@/lib/generation/topologies/acDcSuperposition";
import { writeAcDcSuperpositionText } from "@/lib/generation/topologies/acDcSuperpositionTextWriter";
import { generateAcDcSuperpositionDual } from "@/lib/generation/topologies/acDcSuperpositionDual";
import { writeAcDcSuperpositionDualText } from "@/lib/generation/topologies/acDcSuperpositionDualTextWriter";
import { generateAcTheveninMaxPower } from "@/lib/generation/topologies/acTheveninMaxPower";
import { writeAcTheveninMaxPowerText } from "@/lib/generation/topologies/acTheveninMaxPowerTextWriter";
import { GenerateError } from "@/lib/generation/_core";
import { assembleProblem, buildContextHint, generateInParallel } from "./_common";
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

  // ★ DC+AC 중첩 모드 (params.acDcSuperposition) — 임용 2022 B-6 형식.
  //   직류·교류 전원이 스위치(단자 선택)로 연결된 정상상태 중첩 문제.
  //   phasor 단일 해석 대신 결정론 generator의 닫힌형 해:
  //     [단계 1] DC 패스(L 단락) → I_DC, [단계 2] AC 패스(페이저·전류 분배) → i_ac(t),
  //     [단계 3] 중첩 i(t) = I_DC + i_ac(t).
  //   텍스트도 결정론 (GPT 호출 없음 — 그림·수식·풀이 불일치 원천 차단).
  // ★ 2전원 테브난 최대전력 (임용 10번) — 고정 토폴로지 archetype.
  if (analysis.circuitType?.params?.theveninMaxPower) {
    log.info("thevenin_max_power_mode", { mode, count });
    return generateInParallel(count, async (i, seed) => {
      const gen = generateAcTheveninMaxPower({ seed });
      log.info("thevenin_max_power_generated", {
        Vs: gen.values.VsLabel, Is: gen.values.IsLabel,
        Zth: gen.solution.ZthLabel, Vth: gen.solution.VthLabel,
        RL: gen.solution.RL, Pmax: gen.solution.PmaxLabel,
      });
      const text = writeAcTheveninMaxPowerText({ generation: gen });
      return assembleProblem({
        text,
        netlist: gen.netlist,
        figureLabel: "주어진 회로 (2 교류전원 + RLC + 부하 R_L)",
        figureRole: "original_circuit",
        figureIdSuffix: i + 1,
        topicKey,
      });
    });
  }

  if (analysis.circuitType?.params?.acDcSuperposition) {
    log.info("ac_dc_superposition_mode", { mode, count });
    // ★ 기출변형유형 — 쌍대(dual) 회로: 전류원·병렬 R·직렬 C·v 측정 (V↔I, L↔C, 직렬↔병렬, i↔v).
    if (mode === "exam_variant") {
      return generateInParallel(count, async (i, seed) => {
        const gen = generateAcDcSuperpositionDual({ seed });
        log.info("ac_dc_superposition_dual_generated", {
          Idc: gen.values.IdcMilli,
          Iac: gen.values.IacLabel,
          R: gen.values.R,
          caps: gen.values.caps.map((c) => c.label),
          vDcVolts: gen.solution.vDcVolts,
          vAcPeakVolts: gen.solution.vAcPeakVolts,
        });
        const text = writeAcDcSuperpositionDualText({ generation: gen });
        return assembleProblem({
          text,
          netlist: gen.netlist,
          figureLabel: "주어진 회로 (직류·교류 전류원 + 스위치, 쌍대)",
          figureRole: "original_circuit",
          figureIdSuffix: i + 1,
          topicKey,
        });
      });
    }
    return generateInParallel(count, async (i, seed) => {
      const gen = generateAcDcSuperposition({
        params: analysis.circuitType?.params,
        mode,
        seed,
      });
      log.info("ac_dc_superposition_generated", {
        Vdc: gen.values.Vdc,
        Vac: gen.values.VacLabel,
        rTotal: gen.values.rTotal,
        reactives: gen.values.reactives.map((r) => r.label),
        iDcMilli: gen.solution.iDcMilli,
        iAcPeakMilli: gen.solution.iAcPeakMilli,
      });
      const text = writeAcDcSuperpositionText({ generation: gen, mode });
      return assembleProblem({
        text,
        netlist: gen.netlist,
        figureLabel: "주어진 회로 (직류·교류 전원 + 스위치)",
        figureRole: "original_circuit",
        figureIdSuffix: i + 1,
        topicKey,
      });
    });
  }

  let baseTopology = analysis.topologySignature;
  if (!baseTopology) {
    throw new Error("runUniversalAcPipeline: analysis.topologySignature 누락");
  }

  // ★ 기출변형유형 변형 — exam_similar는 원본 topology 유지, exam_variant만 구조 변형.
  //   ① V↔I·L↔C 위치 교환 (다중 전원 + L·C 회로 — 임용 11번류) 우선 시도
  //   ② pattern_rl_v2 → L→C swap + R 직렬 ladder (임용 8번 variant) fallback
  if (mode === "exam_variant") {
    const swapped = applySourceReactiveSwapVariant(baseTopology);
    if (swapped) {
      baseTopology = swapped;
      log.info("variant_topology_applied", { transform: "source_reactive_swap" });
    } else {
      const variant = applyRlExamVariant(baseTopology);
      if (variant) {
        baseTopology = variant;
        log.info("variant_topology_applied", { transform: "rl_exam_variant" });
      }
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
