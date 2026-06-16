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
import { generateAcDcSuperpositionRc, generateAcDcSuperpositionRcDual } from "@/lib/generation/topologies/acDcSuperpositionRc";
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

  // ★ AC+DC 중첩 RC 회로 (임용 12번 회로이론) — 스위치 없는 고정 토폴로지 archetype.
  //   기존 acDcSuperposition(스위치+RL)과 다른 구조. 결정론 generator + 텍스트 (GPT 없음).
  if (analysis.circuitType?.params?.acDcSuperpositionRc) {
    log.info("ac_dc_superposition_rc_mode", { mode, count });
    // ★ 기출변형유형 — 쌍대(dual) 회로: 전류원 + 병렬 L + 직렬 R₃·R₄ + 병렬 R₅, 전압 측정.
    if (mode === "exam_variant") {
      return generateInParallel(count, async (i, seed) => {
        const gen = generateAcDcSuperpositionRcDual({ seed });
        const v = gen.values;
        const dvd = gen.derived;
        log.info("ac_dc_superposition_rc_dual_generated", {
          iac: gen.circuitDiagram.iacLabel, idc: v.idcMa, L: v.lH,
          R: [v.r3d, v.r4d, v.r5d], vDc: dvd.vDcV, vAbAc: dvd.vAbAcV, vR4Dc: dvd.vR4DcV,
        });
        const V = (x: number) => `${x} V`;
        const vAbAcStr = `${dvd.vAbAcCoeff}√2 V (≈${dvd.vAbAcV} V)`;
        const content = [
          `그림은 ${gen.circuitDiagram.iacLabel}인 교류 전류원과 ${v.idcMa}[mA] 직류 전류원이 포함된 RL 회로이다.`,
          `이는 원본 RC 회로(전압원·전류 측정)의 **쌍대 회로**(전류원·전압 측정)이다.`,
          `제시된 <해석 절차>에 따라 중첩의 원리로 각 단계별 결과를 구하시오. (단, i(t)의 페이저는 ${gen.circuitDiagram.iacPhasor}, ω=${v.omega} rad/s.)`,
        ].join(" ");
        const conditions = [
          `교류 전류원 + 직류 전류원 ${v.idcMa}mA`,
          `L=${v.lH}H (Z_L = j${dvd.xL}Ω at ω=${v.omega}), 점 a–b 사이 직렬 R₃+R₄ (${gen.circuitDiagram.r3Label}+${gen.circuitDiagram.r4Label}), R₅=${gen.circuitDiagram.r5Label} 병렬`,
          `측정: v_ab(t) (a·b 양단 전압), V_DC`,
          `정상상태 중첩 — 과도응답 아님 (waveform·상태천이 figure 면제)`,
        ];
        const question = [
          `[단계 1] 페이저를 이용하여 교류 전류원에 의한 v_ab의 최댓값[V]과 R₄ 양단 전압의 최댓값[V]을 각각 구한다.`,
          `[단계 2] 직류 전류원에 의한 V_DC[V]와, 전체 전원에 의해 R₄ 양단 전압의 최댓값[V]을 각각 구한다.`,
        ].join("\n");
        const answer = [
          `[단계 1] v_ab(AC) 최댓값 = ${vAbAcStr},  V_R₄(AC) 최댓값 = ${V(dvd.vR4AcV)}`,
          `[단계 2] V_DC = ${V(dvd.vDcV)},  전체 V_R₄ 최댓값 = ${V(dvd.vR4TotalMaxV)}`,
        ].join("\n");
        const solution = [
          `[단계 1] 교류 전류원만 (직류 전류원 개방 → 쌍대: 직류 전압원 단락의 대응). ★ 이상적 직류 전류원은 교류에서 개방 →`,
          `  R₃·R₄ 가지가 분리됨 → R₄ 양단 교류 전압 = 0: V_R₄(AC) = 0.`,
          `  모든 교류는 i(t)∥L에 인가: Z_L = jωL = j${dvd.xL}Ω → v_ab(AC) 최댓값 = i_peak·ωL = ${vAbAcStr}.`,
          `[단계 2] 직류 전류원만 (L 단락 → 쌍대: C 개방의 대응). 직렬 R₃+R₄ = ${dvd.rSeries}Ω, 병렬 R₅:`,
          `  V_DC = I_dc·(R₅∥(R₃+R₄)) = ${V(dvd.vDcV)}. V_R₄(DC) = [V_DC/(R₃+R₄)]·R₄ = ${V(dvd.vR4DcV)}.`,
          `  전체 R₄ 양단 최대 전압 = V_R₄(DC) + V_R₄(AC) = ${dvd.vR4DcV} + 0 = ${V(dvd.vR4TotalMaxV)}.`,
        ].join("\n");
        const figureVariants: FigureVariant[] = [
          {
            id: `fig_ac_dc_rc_dual_${i + 1}`,
            label: "(가) AC+DC 중첩 회로의 쌍대 (RL + 전류원)",
            role: "original_circuit",
            diagramType: "ac_dc_superposition_rc_dual_circuit",
            diagram: gen.circuitDiagram,
          },
        ];
        return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
      });
    }
    return generateInParallel(count, async (i, seed) => {
      const gen = generateAcDcSuperpositionRc({ seed, mode });
      const v = gen.values;
      const dvd = gen.derived;
      log.info("ac_dc_superposition_rc_generated", {
        vac: gen.circuitDiagram.vacLabel, vdc: v.vdc,
        R: [v.r3, v.r4, v.r5], xC: dvd.xC, rp: dvd.rp,
        iDc: dvd.iDcMa, iAbAc: dvd.iAbAcMa, iR4Ac: dvd.iR4AcMa, totR4: dvd.iR4TotalMaxMa,
      });

      const ma = (x: number) => `${x} mA`;
      const iAbAcStr = `${dvd.iAbAcCoeff}√2 mA (≈${dvd.iAbAcMa} mA)`;
      const content = [
        `그림은 ${gen.circuitDiagram.vacLabel}인 교류 전원과 ${v.vdc}[V] 직류 전원이 포함된 RC 회로이다.`,
        `제시된 <해석 절차>에 따라 중첩의 원리를 이용하여 각 단계별로 풀이과정과 함께 결과를 구하시오.`,
        `(단, v(t)를 페이저로 표현할 때 ${gen.circuitDiagram.vacPhasor}로 하고, 각주파수 ω=${v.omega} rad/s이다.)`,
      ].join(" ");

      const conditions = [
        `교류 전원 v(t)=${gen.circuitDiagram.vacLabel.replace("v(t) = ", "").replace(" [V]", "")} + 직류 전원 ${v.vdc}V`,
        `C=${v.cUf}µF (Z_C = −j${dvd.xC}Ω at ω=${v.omega}), 점 a–c 사이 R₃∥R₄ (${gen.circuitDiagram.r3Label}·${gen.circuitDiagram.r4Label} 병렬), R₅=${gen.circuitDiagram.r5Label}`,
        `단자 a·b, 측정: i_ab(t) (a→b), I_DC (b 지점)`,
        `정상상태 중첩 — 과도응답 아님 (waveform·상태천이 figure 면제)`,
      ];

      const question = [
        `[단계 1] 페이저를 이용하여 교류 전원에 의한 점 a에서의 전류 i_ab의 최댓값[A]과 R₄에 흐르는 전류의 최댓값[A]을 각각 구한다.`,
        `[단계 2] 직류 전원에 의한 점 b에서의 전류 I_DC[A]와, 전체 전원에 의해 R₄에 흐르는 전류의 최댓값[A]을 각각 구한다.`,
      ].join("\n");

      const answer = [
        `[단계 1] i_ab(AC) 최댓값 = ${iAbAcStr},  I_R₄(AC) 최댓값 = ${ma(dvd.iR4AcMa)}`,
        `[단계 2] I_DC = ${ma(dvd.iDcMa)},  전체 I_R₄ 최댓값 = ${ma(dvd.iR4TotalMaxMa)}`,
      ].join("\n");

      const solution = [
        `[단계 1] 교류 전원만 (직류 전원 단락). ★ 이상적 직류 전압원은 교류에서 단락 → 점 a가 접지에 클램프됨.`,
        `  따라서 R₃∥R₄ 양단 전압 = 0 → R₃·R₄에는 교류 전류가 흐르지 않음: I_R₄(AC) = 0.`,
        `  모든 교류 전류는 20V 가지(a→b)로 흐른다. Z_C = 1/(jωC) = −j${dvd.xC}Ω →`,
        `  i_ab(AC) 최댓값 = V_peak/|Z_C| = ${v.vacPeak}/${dvd.xC} = ${iAbAcStr}.`,
        `[단계 2] 직류 전원만 (C 개방 → 교류 가지 차단). a–c 병렬 Rp = R₃∥R₄ = ${dvd.rp}Ω, 직렬 루프 ${v.vdc}V·Rp·R₅:`,
        `  I_DC = ${v.vdc}/(Rp+R₅) = ${v.vdc}/${dvd.rp + v.r5}Ω = ${ma(dvd.iDcMa)} (= i_ab(DC)). I_R₄(DC) = I_DC·R₃/(R₃+R₄) = ${ma(dvd.iR4DcMa)}.`,
        `  전체 R₄ 최대 순시전류 = I_R₄(DC) + I_R₄(AC) = ${dvd.iR4DcMa} + 0 = ${ma(dvd.iR4TotalMaxMa)}.`,
      ].join("\n");

      const figureVariants: FigureVariant[] = [
        {
          id: `fig_ac_dc_rc_${i + 1}`,
          label: "(가) AC+DC 중첩 RC 회로",
          role: "original_circuit",
          diagramType: "ac_dc_superposition_rc_circuit",
          diagram: gen.circuitDiagram,
        },
      ];

      return {
        id: randomUUID(),
        content,
        conditions,
        question,
        answer,
        solution,
        topicKey,
        figureVariants,
      };
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
