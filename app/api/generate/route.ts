import { NextRequest, NextResponse } from "next/server";
import { GenerateError } from "@/lib/generation/_core";
import { generateVariant } from "@/lib/generation";
import { generateSimilar } from "@/lib/mutation";
import { resolveRules } from "@/lib/rules";
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import { isConceptNamingAnalysis } from "@/lib/analysis/deviceIdentity";
import { detectMultipleChoiceOriginal } from "@/lib/analysis/multipleChoice";
import { validateProblem, validateFigures, type ValidationResult } from "@/lib/validators";
import { autoCloseAnalogDangling } from "@/lib/generation/autoCloseAnalogDangling";
import { validateAnswerSolution } from "@/lib/validators/validateAnswerSolution";
import { createLogger } from "@/lib/logger";
import { runTheveninPipeline } from "@/lib/pipeline/runTheveninPipeline";
import { runDcTheveninTwoSourcePipeline } from "@/lib/pipeline/runDcTheveninTwoSourcePipeline";
import { runAcPowerFactorPipeline } from "@/lib/pipeline/runAcPowerFactorPipeline";
import { runAcAdmittanceResonancePipeline } from "@/lib/pipeline/runAcAdmittanceResonancePipeline";
import { runAcVccsPhasorPipeline } from "@/lib/pipeline/runAcVccsPhasorPipeline";
import { runNortonPipeline } from "@/lib/pipeline/runNortonPipeline";
import { runDcMeshPipeline } from "@/lib/pipeline/runDcMeshPipeline";
import { runRcStepPipeline } from "@/lib/pipeline/runRcStepPipeline";
import { runRlStepPipeline } from "@/lib/pipeline/runRlStepPipeline";
import { runRlcStepPipeline } from "@/lib/pipeline/runRlcStepPipeline";
import { runRlcResonancePipeline } from "@/lib/pipeline/runRlcResonancePipeline";
import { runRlcResonanceMaxPowerPipeline } from "@/lib/pipeline/runRlcResonanceMaxPowerPipeline";
import { runSwitchedRlcStepPipeline } from "@/lib/pipeline/runSwitchedRlcStepPipeline";
import { runSwitchedRlc5legPipeline } from "@/lib/pipeline/runSwitchedRlc5legPipeline";
import { runDcSupermeshPipeline } from "@/lib/pipeline/runDcSupermeshPipeline";
import { runDcSupernodePipeline } from "@/lib/pipeline/runDcSupernodePipeline";
import { runParamMaxPowerPipeline, detectParamMaxPower, isParamMaxPowerForm, isSymbolicParamCircuitForm, paramMaxPowerFailureReason } from "@/lib/pipeline/runParamMaxPowerPipeline";
import { runSupernodeDepMaxPowerPipeline, detectSupernodeDepMaxPower } from "@/lib/pipeline/runSupernodeDepMaxPowerPipeline";
import { runNortonParamInversePipeline, detectNortonParamInverse } from "@/lib/pipeline/runNortonParamInversePipeline";
import { runZenerClipperIntegratorPipeline, detectZenerClipperIntegrator } from "@/lib/pipeline/runZenerClipperIntegratorPipeline";
import { runDcDependentSourcePipeline } from "@/lib/pipeline/runDcDependentSourcePipeline";
import { runInductorRampSlopePipeline, detectInductorRampSlope } from "@/lib/pipeline/runInductorRampSlopePipeline";
import { runAcSuperpositionPipeline, detectAcSuperposition } from "@/lib/pipeline/runAcSuperpositionPipeline";
import { runAcParallelBranchesPipeline } from "@/lib/pipeline/runAcParallelBranchesPipeline";
import { runMaxPowerTransferPipeline } from "@/lib/pipeline/runMaxPowerTransferPipeline";
import { runTheveninMaxPowerGenericPipeline } from "@/lib/pipeline/runTheveninMaxPowerGenericPipeline";
import { runSwitchingCircuitPipeline } from "@/lib/pipeline/runSwitchingCircuitPipeline";
import { runSwitchedRlDependentPipeline } from "@/lib/pipeline/runSwitchedRlDependentPipeline";
import { runSwitchedRlDepIPipeline, detectSwitchedRlDepI } from "@/lib/pipeline/runSwitchedRlDepIPipeline";
import { runSwitchedRlSourceSwitchPipeline, detectSwitchedRlDualSource } from "@/lib/pipeline/runSwitchedRlSourceSwitchPipeline";
import { runSupermeshSwitchedDependentPipeline } from "@/lib/pipeline/runSupermeshSwitchedDependentPipeline";
import { runSourceTransformRatioPipeline, detectSourceTransformRatio } from "@/lib/pipeline/runSourceTransformRatioPipeline";
import { runOpampDifferenceAmpPipeline, detectOpampDifferenceAmp } from "@/lib/pipeline/runOpampDifferenceAmpPipeline";
import { runOpampPipeline } from "@/lib/pipeline/runOpampPipeline";
import { runOpampTimeDomainPipeline } from "@/lib/pipeline/runOpampTimeDomainPipeline";
import { runBjtSmallSignalPipeline } from "@/lib/pipeline/runBjtSmallSignalPipeline";
import { runBjtBiasPipeline } from "@/lib/pipeline/runBjtBiasPipeline";
import { runBjtTwoStageSwitchedPipeline, detectBjtTwoStageSwitched } from "@/lib/pipeline/runBjtTwoStageSwitchedPipeline";
import { runOpampTwoInputDiffDesignPipeline, detectOpampTwoInputDesign } from "@/lib/pipeline/runOpampTwoInputDiffDesignPipeline";
import { runBjtCharacteristicCurvePipeline } from "@/lib/pipeline/runBjtCharacteristicCurvePipeline";
import { runMosfetBiasPipeline } from "@/lib/pipeline/runMosfetBiasPipeline";
import { runMosfetCascodeMirrorPipeline } from "@/lib/pipeline/runMosfetCascodeMirrorPipeline";
import { runCounterDacComparatorPipeline } from "@/lib/pipeline/runCounterDacComparatorPipeline";
import { runFlashAdc2bitPipeline } from "@/lib/pipeline/runFlashAdc2bitPipeline";
import { runZenerBjtRegulatorPipeline } from "@/lib/pipeline/runZenerBjtRegulatorPipeline";
import { runOpampSeriesRegulatorPipeline, detectOpampSeriesRegulator } from "@/lib/pipeline/runOpampSeriesRegulatorPipeline";
import { runActiveLowpassFilterPipeline, detectActiveLowpassFilter } from "@/lib/pipeline/runActiveLowpassFilterPipeline";
import { runOpampAnalogSummerPipeline, detectOpampAnalogSummer } from "@/lib/pipeline/runOpampAnalogSummerPipeline";
import { runScrTurnOnPipeline } from "@/lib/pipeline/runScrTurnOnPipeline";
import { runReactiveViIntegralPipeline } from "@/lib/pipeline/runReactiveViIntegralPipeline";
import { runKmapSopPipeline } from "@/lib/pipeline/runKmapSopPipeline";
import { runKmapPosPipeline } from "@/lib/pipeline/runKmapPosPipeline";
import { runFlipflopCounterPipeline } from "@/lib/pipeline/runFlipflopCounterPipeline";
import { runJkSyncCounterPipeline, detectJkSyncCounter } from "@/lib/pipeline/runJkSyncCounterPipeline";
import { runLogicConditionSopPipeline, detectLogicConditionSop } from "@/lib/pipeline/runLogicConditionSopPipeline";
import { runFfWithWaveformPipeline } from "@/lib/pipeline/runFfWithWaveformPipeline";
import { runFlipflopMixedPipeline, detectFfMixedApp } from "@/lib/pipeline/runFlipflopMixedPipeline";
import { runTffStateTableBlankPipeline } from "@/lib/pipeline/runTffStateTableBlankPipeline";
import { runTff3AutonomousCounterPipeline } from "@/lib/pipeline/runTff3AutonomousCounterPipeline";
import { runJfetVoltageBiasPipeline } from "@/lib/pipeline/runJfetVoltageBiasPipeline";
import { runOpampRcTOscillatorPipeline } from "@/lib/pipeline/runOpampRcTOscillatorPipeline";
import { runAcRlAveragePowerPipeline } from "@/lib/pipeline/runAcRlAveragePowerPipeline";
import { runCombinationalGatePipeline } from "@/lib/pipeline/runCombinationalGatePipeline";
import { runFsmPipeline } from "@/lib/pipeline/runFsmPipeline";
import { runDffMuxSequentialPipeline, detectDffMuxSequential } from "@/lib/pipeline/runDffMuxSequentialPipeline";
import { runSrFfMuxSequentialPipeline } from "@/lib/pipeline/runSrFfMuxSequentialPipeline";
import { runAsyncPresetCounterPipeline } from "@/lib/pipeline/runAsyncPresetCounterPipeline";
import { runRlcResonanceBandwidthPipeline } from "@/lib/pipeline/runRlcResonanceBandwidthPipeline";
import { runOpampTwoStagePipeline } from "@/lib/pipeline/runOpampTwoStagePipeline";
import { runFunctionGeneratorPipeline } from "@/lib/pipeline/runFunctionGeneratorPipeline";
import { runOpampFiniteGainBlockPipeline, detectOpampFiniteGainBlock } from "@/lib/pipeline/runOpampFiniteGainBlockPipeline";
import { runOpampFiniteGainOffsetPipeline, detectOpampFiniteGainOffset } from "@/lib/pipeline/runOpampFiniteGainOffsetPipeline";
import { runOpampLoopGainStabilityPipeline, detectOpampLoopGainStability } from "@/lib/pipeline/runOpampLoopGainStabilityPipeline";
import { runOpampThreeStageSumPipeline } from "@/lib/pipeline/runOpampThreeStageSumPipeline";
import { runAcBridgeMaxPowerPipeline } from "@/lib/pipeline/runAcBridgeMaxPowerPipeline";
import { runAcTheveninLadderPipeline } from "@/lib/pipeline/runAcTheveninLadderPipeline";
import { runAcTheveninDependentPipeline, detectAcTheveninDependent } from "@/lib/pipeline/runAcTheveninDependentPipeline";
import { runAcTheveninDesignAbPipeline, detectAcTheveninDesignAb } from "@/lib/pipeline/runAcTheveninDesignAbPipeline";
import { runAcDeltaWyeBridgePipeline, detectAcDeltaWyeBridge } from "@/lib/pipeline/runAcDeltaWyeBridgePipeline";
import { runOscilloscopePhaseLPipeline, detectOscilloscopePhaseL } from "@/lib/pipeline/runOscilloscopePhaseLPipeline";
import { runAcTwoSourceMeshPowerPipeline, detectAcTwoSourceMeshPower } from "@/lib/pipeline/runAcTwoSourceMeshPowerPipeline";
import { runAcSuperpositionNullSourcePipeline, detectAcSuperpositionNullSource } from "@/lib/pipeline/runAcSuperpositionNullSourcePipeline";
import { runTheveninDepGraphMaxPowerPipeline, detectTheveninDepGraph } from "@/lib/pipeline/runTheveninDepGraphMaxPowerPipeline";
import { runOpampAvgSuperpositionPipeline, detectOpampAvgSuperposition } from "@/lib/pipeline/runOpampAvgSuperpositionPipeline";
import { runDffNandMuxPairPipeline, detectDffNandMuxPair } from "@/lib/pipeline/runDffNandMuxPairPipeline";
import { runZenerShuntRegulatorPipeline, detectZenerShuntRegulator } from "@/lib/pipeline/runZenerShuntRegulatorPipeline";
import { runSwitchedRlcSourceFreePipeline, detectSwitchedRlcSourceFree } from "@/lib/pipeline/runSwitchedRlcSourceFreePipeline";
import { runRlcStateEquationPipeline, detectRlcStateEquation } from "@/lib/pipeline/runRlcStateEquationPipeline";
import { runSwitchedRlcDualSwitchPipeline, detectSwitchedRlcDualSwitch } from "@/lib/pipeline/runSwitchedRlcDualSwitchPipeline";
import { runSwitchedCapShortRlPipeline, detectSwitchedCapShortRl } from "@/lib/pipeline/runSwitchedCapShortRlPipeline";
import { runOpampTwoStageRxPipeline, detectOpampTwoStageRx } from "@/lib/pipeline/runOpampTwoStageRxPipeline";
import { runDcTwoSourceLadderPipeline, detectDcTwoSourceLadder } from "@/lib/pipeline/runDcTwoSourceLadderPipeline";
import { runDiodeClamperPipeline, detectDiodeClamper } from "@/lib/pipeline/runDiodeClamperPipeline";
import { runJkMealyStateDesignPipeline, detectJkMealyStateDesign } from "@/lib/pipeline/runJkMealyStateDesignPipeline";
import { runBjtTheveninBiasPipeline, detectBjtTheveninBias } from "@/lib/pipeline/runBjtTheveninBiasPipeline";
import { runBjtSwitchLogicGatePipeline, detectBjtSwitchLogicGate } from "@/lib/pipeline/runBjtSwitchLogicGatePipeline";
import { runComparatorDiodeOrPipeline, detectComparatorDiodeOr } from "@/lib/pipeline/runComparatorDiodeOrPipeline";
import { runOpampSummerTFeedbackPipeline, detectOpampSummerTFeedback } from "@/lib/pipeline/runOpampSummerTFeedbackPipeline";
import { runAcTheveninTwoBoxPipeline, detectAcTheveninTwoBox } from "@/lib/pipeline/runAcTheveninTwoBoxPipeline";
import { runTffStateDesignInputPipeline, detectTffStateDesignInput } from "@/lib/pipeline/runTffStateDesignInputPipeline";
import { runSwitchedRcDcTransientPipeline, detectSwitchedRcDcTransient } from "@/lib/pipeline/runSwitchedRcDcTransientPipeline";
import { runDcWheatstoneBalancePipeline, detectDcWheatstoneBalance } from "@/lib/pipeline/runDcWheatstoneBalancePipeline";
import { runAcSuperpositionSourceDesignPipeline, detectAcSuperpositionSourceDesign } from "@/lib/pipeline/runAcSuperpositionSourceDesignPipeline";
import { runJkExcitationSopPosPipeline, detectJkExcitationSopPos } from "@/lib/pipeline/runJkExcitationSopPosPipeline";
import { runDffPresetClearRegionsPipeline, detectDffPresetClearRegions } from "@/lib/pipeline/runDffPresetClearRegionsPipeline";
import { runSwitchedRlDualShortPipeline, detectSwitchedRlDualShort } from "@/lib/pipeline/runSwitchedRlDualShortPipeline";
import { runTwoSourceRlSuperpositionPipeline, detectTwoSourceRlSuperposition } from "@/lib/pipeline/runTwoSourceRlSuperpositionPipeline";
import { runAcDcSourceSuperpositionVcPipeline, detectAcDcSourceSuperpositionVc } from "@/lib/pipeline/runAcDcSourceSuperpositionVcPipeline";
import { runRlcAntiresonanceLadderPipeline, detectRlcAntiresonanceLadder } from "@/lib/pipeline/runRlcAntiresonanceLadderPipeline";
import { runJkTwoPhaseClockPipeline, detectJkTwoPhaseClock } from "@/lib/pipeline/runJkTwoPhaseClockPipeline";
import { runMaxPowerTwoSourceRatioPipeline, detectMaxPowerTwoSourceRatio } from "@/lib/pipeline/runMaxPowerTwoSourceRatioPipeline";
import { runNumberReprFillBlankPipeline, detectNumberReprFillBlank } from "@/lib/pipeline/runNumberReprFillBlankPipeline";
import { runBjtEarlyEffectFillBlankPipeline, detectBjtEarlyEffectFillBlank } from "@/lib/pipeline/runBjtEarlyEffectFillBlankPipeline";
import { runMaxwellConceptFillBlankPipeline, detectMaxwellConceptFillBlank } from "@/lib/pipeline/runMaxwellConceptFillBlankPipeline";
import { runModNCounterResetPipeline, detectModNCounterReset } from "@/lib/pipeline/runModNCounterResetPipeline";
import { runNumberRepresentationPipeline, detectNumberRepresentation } from "@/lib/pipeline/runNumberRepresentationPipeline";
import { runDemuxWaveformPipeline, detectDemuxWaveform } from "@/lib/pipeline/runDemuxWaveformPipeline";
import { fractionizeText } from "@/lib/format/fraction";
import { stripEulerGiven, stripEulerGivenList } from "@/lib/format/stripEulerGiven";
import { runTheveninDepVoltagePipeline, detectTheveninDepVoltageProblem } from "@/lib/pipeline/runTheveninDepVoltagePipeline";
import { runElectromagneticsPipeline } from "@/lib/pipeline/runElectromagneticsPipeline";
import { runCLanguagePipeline } from "@/lib/pipeline/runCLanguagePipeline";
import { runCSwitchFallThroughPipeline, detectCSwitchFallThrough } from "@/lib/pipeline/runCSwitchFallThroughPipeline";
import { runWienBridgeDesignPipeline, detectWienBridgeDesign } from "@/lib/pipeline/runWienBridgeDesignPipeline";
import { runFfReachableStatesPipeline, detectFfReachableStates } from "@/lib/pipeline/runFfReachableStatesPipeline";
import { runFfFeedbackZPipeline, detectFfFeedbackZ } from "@/lib/pipeline/runFfFeedbackZPipeline";
import { runR2rLadderDacPipeline, detectR2rLadderDac } from "@/lib/pipeline/runR2rLadderDacPipeline";
import { runJfetDepletionFillBlankPipeline, detectJfetDepletionFillBlank } from "@/lib/pipeline/runJfetDepletionFillBlankPipeline";
import { runCommunicationsPipeline } from "@/lib/pipeline/runCommunicationsPipeline";
import { runConceptNamingPipeline } from "@/lib/pipeline/runConceptNamingPipeline";
import { runPeriodicSignalDcRmsPipeline, detectPeriodicSignalDcRms } from "@/lib/pipeline/runPeriodicSignalDcRmsPipeline";
import { runPedagogyPipeline } from "@/lib/pipeline/runPedagogyPipeline";
import { runGptFreePipeline } from "@/lib/pipeline/runGptFreePipeline";
import { runDffStateDesignPipeline, detectDffStateDesign } from "@/lib/pipeline/runDffStateDesignPipeline";
import { runSequenceDetectorPipeline } from "@/lib/pipeline/runSequenceDetectorPipeline";
import { runTheveninSwitchedRcPipeline } from "@/lib/pipeline/runTheveninSwitchedRcPipeline";
import { runOpampCascadePipeline } from "@/lib/pipeline/runOpampCascadePipeline";
import { runOpampGenericPipeline } from "@/lib/pipeline/runOpampGenericPipeline";
import { runWaveformAnalysisPipeline } from "@/lib/pipeline/runWaveformAnalysisPipeline";
import { runSequentialGenericPipeline } from "@/lib/pipeline/runSequentialGenericPipeline";
import { runMuxImplementationPipeline } from "@/lib/pipeline/runMuxImplementationPipeline";
import { runTopologyDrivenPipeline } from "@/lib/pipeline/runTopologyDrivenPipeline";
import { runUniversalDcPipeline } from "@/lib/pipeline/runUniversalDcPipeline";
import { detectImyong10Archetype, countInventoryByType } from "@/lib/analysis/detectImyong10Archetype";
import { generateImyong10DcNodal } from "@/lib/generation/dc/generateImyong10DcNodal";
import { runUniversalAcPipeline } from "@/lib/pipeline/runUniversalAcPipeline";
import { runUniversalAcPwlPipeline } from "@/lib/pipeline/runUniversalAcPwlPipeline";
import { runUniversalDigitalPipeline } from "@/lib/pipeline/runUniversalDigitalPipeline";
import { detectOpampArchetype } from "@/lib/analysis/detectOpampArchetype";
import { routePipeline } from "@/lib/analysis/routePipeline";
import { generateCircuit } from "@/lib/generation/analog/generateCircuit";
import { validateWienNetwork } from "@/lib/validators/validateWienNetwork";
import { randomUUID } from "node:crypto";
import type { CircuitNetlist } from "@/types";
import {
  GENERATION_POLICIES,
  SUBJECT_KEYS,
  TOPIC_TO_SUBJECT,
  type AnalysisResult,
  type GenerationMode,
  type GeneratedProblem,
  type SemanticStructure,
  type SubjectKey,
  type TopicKey,
} from "@/types";

const log = createLogger("api/generate");

const DEFAULT_SEMANTIC: SemanticStructure = {
  hasStateTransition: false,
  hasEquivalentTransformation: false,
  hasWaveformEvolution: false,
  requiresMultiFigure: false,
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      image?: string;
      subject?: string;
      mode?: string;
      count?: number;
      analysis?: AnalysisResult | null;
      topicKey?: TopicKey;
      semantic?: SemanticStructure;
    };
    const { image, subject, mode, count, analysis } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "image(base64)가 필요합니다." }, { status: 400 });
    }
    if (!subject || !SUBJECT_KEYS.includes(subject as SubjectKey)) {
      return NextResponse.json({ error: `subject는 ${SUBJECT_KEYS.join("/")} 중 하나여야 합니다.` }, { status: 400 });
    }
    if (!mode || !(mode in GENERATION_POLICIES)) {
      return NextResponse.json({ error: "mode는 exam_similar / exam_variant / gpt_generated 중 하나여야 합니다." }, { status: 400 });
    }
    const n = typeof count === "number" && count > 0 ? Math.min(Math.floor(count), 10) : 1;

    let subjectKey = subject as SubjectKey;

    // analysis에서 topicKey/semantic을 우선 활용 (body의 명시 값이 있으면 그것 우선)
    let expectedTopicKey: TopicKey | undefined = body.topicKey ?? analysis?.topicKey;
    // ★ subject↔topicKey family 일관성 (CLAUDE.md 규칙 #9) — analyzeImage가 디지털 문제에
    //   회로이론 topicKey(예: dc_resistive)를 잘못 부여하는 등 cross-subject 라벨이 들어오면
    //   그대로 family check에 쓰면 validator가 항상 family_mismatch를 낸다. 선택된 subject의
    //   family에 속하지 않는 topicKey는 신뢰 불가로 보고 폐기(undefined)해서, 생성·라우팅을
    //   subject 기준으로 진행시키고 잘못된 기준에 대한 mismatch를 차단한다.
    if (expectedTopicKey && TOPIC_TO_SUBJECT[expectedTopicKey] !== subjectKey) {
      log.warn("topicKey_subject_mismatch_dropped", {
        topicKey: expectedTopicKey,
        topicSubject: TOPIC_TO_SUBJECT[expectedTopicKey],
        selectedSubject: subjectKey,
      });
      expectedTopicKey = undefined;
    }

    // ★ analog subject + 디지털 circuitType 교정 (subject-first) — GPT가 RLC AC 회로에
    //   waveform_analysis 같은 디지털 circuitType/topicKey를 잘못 부여하면 circuit_theory 분기와
    //   안 맞아 topology_driven으로 빠지고, hasWaveformEvolution=true가 유지돼 missing_waveform.
    //   reactive(L/C) 있으면 universal_ac, 없으면 universal_dc로 분석 객체를 직접 보정 →
    //   semantic 정규화(아래 isUniversalAc)·dispatch가 일관되게 흐른다. (Vision 비결정성 흡수)
    // ★ 라우팅 추적 — 마지막에 routing_summary 한 줄로 남긴다(원인 특정용).
    const routingTrace: { cachedType?: string; reclassifiedTo?: string; coercions: string[]; coercionSkipped: boolean } = {
      cachedType: analysis?.circuitType?.type,
      coercions: [],
      coercionSkipped: false,
    };

    const DIGITAL_ONLY_TYPES = new Set([
      "universal_digital", "sequential_dff_generic", "kmap_sop", "kmap_pos",
      "flipflop_mixed_app", "tff_state_table_blank", "tff3_autonomous_counter", "ff_with_waveform",
      "flipflop_counter", "jk_sync_counter", "combinational_gate", "sequence_detector", "fsm",
      "dff_mux_sequential", "waveform_analysis", "mux_implementation", "counter_dac_comparator", "logic_condition_sop",
      "tff_state_design_input",
      "jk_excitation_sop_pos", "mod_n_counter_reset", "number_representation", "demux_waveform",
    ]);
    if (
      subjectKey === "circuit_theory" &&
      analysis?.circuitType?.type &&
      DIGITAL_ONLY_TYPES.has(analysis.circuitType.type)
    ) {
      const hasReactive = (analysis.componentInventory ?? []).some(
        (c) => c.type === "L" || c.type === "C",
      );
      const coerced = hasReactive ? "universal_ac" : "universal_dc";
      routingTrace.coercions.push("analog_subject_digital_circuittype"), log.warn("analog_subject_digital_circuittype_coerced", {
        from: analysis.circuitType.type,
        to: coerced,
        subject: subjectKey,
      });
      analysis.circuitType.type = coerced as typeof analysis.circuitType.type;
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // ★★ stale analysis 일반 방어 (2026-07-26) — archetype마다 안전망을 하나씩 붙이던 것을 대체.
    //
    //   문제: 프론트(app/page.tsx)가 analyze 결과를 React state에 담아 "생성"마다 재사용한다.
    //   그래서 분류기를 고쳐도 **이전에 만들어진 circuitType**이 그대로 넘어와 generic 경로로
    //   빠지고, 전용 archetype이 있는데도 전혀 다른 문제가 생성된다.
    //   이 세션에서만 jk_sync_counter·active_lowpass_filter·switched_rc·dff_state_design·
    //   ac_superposition·opamp_finite_gain_block에서 같은 증상이 반복됐다.
    //
    //   조치: **분류기를 단일 진실 공급원으로 삼아 여기서 한 번 재분류**한다.
    //   analysis 텍스트는 그대로이므로 재분류는 "지금 코드 기준의 정답"이고, 캐시된 circuitType은
    //   그 시점의 낡은 사본일 뿐이다. 결과가 다르면 최신 분류로 교체한다.
    //   ※ 개별 안전망들은 남겨 둔다 — 과목 오선택 보정(subjectKey) 등 재분류가 못 하는 일을 한다.
    if (analysis?.circuitType?.type) {
      const analysisText = [
        analysis.topic ?? "",
        analysis.interpretation ?? "",
        (analysis.relatedConcepts ?? []).join(" "),
      ].join(" ").trim();
      if (analysisText.length > 0) {
        try {
          const fresh = classifyCircuitType(analysis, subjectKey);
          if (fresh?.type && fresh.type !== analysis.circuitType.type && fresh.type !== "unsupported") {
            routingTrace.reclassifiedTo = fresh.type;
            log.warn("stale_circuit_type_reclassified", {
              from: analysis.circuitType.type,
              to: fresh.type,
              reason: String(fresh.reasoning ?? "").slice(0, 120),
            });
            analysis.circuitType = { ...analysis.circuitType, ...fresh };
          }
        } catch (e) {
          log.warn("reclassify_failed", { message: (e as Error).message });
        }
      }
    }
    // ══════════════════════════════════════════════════════════════════════════════

    // ══════════════════════════════════════════════════════════════════════════════
    // ★★ 안전망 공통 가드 (2026-07-27) — "안전망이 올바른 분류를 덮어쓰는" 사고 방지.
    //
    //   안전망(detectXxx)은 원래 **generic 경로로 떨어진 경우를 구제**하려고 만든 것이다.
    //   그런데 조건이 넓으면 분류기가 이미 **정확한 전용 archetype**을 골랐는데도 덮어쓴다.
    //   실측 사고 2건(같은 날):
    //     · counter_dac_comparator(임용 8번) → jk_sync_counter 안전망이 덮어씀
    //       (JK 카운터는 맞지만 DAC·비교기가 있는 복합형인데 순수 카운터 문제로 변질)
    //     · opamp_positive_feedback(임용 6번) → opamp_finite_gain_block 안전망이 덮어씀
    //
    //   ⇒ 규칙: **현재 타입이 generic(또는 미지정)일 때만 안전망이 개입한다.**
    //     전용 archetype으로 분류돼 있으면 그 판단을 존중한다(분류기가 단일 진실 공급원).
    //     stale 전용 타입은 위의 재분류 블록이 이미 최신화한다.
    const GENERIC_CIRCUIT_TYPES = new Set<string>([
      "unsupported", "topology_driven",
      "universal_dc", "universal_ac", "universal_digital",
      "dc_mesh", "dc_nodal", "dc_resistive",
      "transient_rc", "transient_rl", "switched_rc", "switched_rl", "rl_step", "rc_step", "rlc_step",
      "thevenin", "norton",
      "opamp", "opamp_generic", "opamp_cascade_voltage_divider",
      "fsm", "sequential_dff_generic", "combinational_gate", "flipflop_counter",
      "bjt_bias", "bjt_small_signal", "mosfet_bias",
    ]);
    const currentType = analysis?.circuitType?.type;
    const canCoerce = !currentType || GENERIC_CIRCUIT_TYPES.has(currentType);
    if (!canCoerce) {
      routingTrace.coercionSkipped = true;
      log.info("coercion_skipped_specific_type", { type: currentType });
    }
    // ══════════════════════════════════════════════════════════════════════════════

    // ★ JK 동기식 카운터 안전망 (stale circuitType·과목 오선택 방어) — analyze의 JK 분기는
    //   classifyCircuitType의 `subject==="digital_logic"` 안에서만 동작한다. 사용자가 다른 과목으로
    //   분석했거나(→ JK 분기 미실행) 이전 분류기 버전의 stale circuitType(sequential_dff_generic 등)이
    //   오면 D-FF 회로로 변질된다. analysis 텍스트가 "JK 플립플롭 + 카운터"면 여기서 circuitType 자체를
    //   보정 → 이후 semantic normalize·ruleSet·dispatch가 모두 일관되게 jk_sync_counter로 흐른다.
    if (canCoerce && detectJkSyncCounter(analysis) && analysis?.circuitType?.type !== "jk_sync_counter") {
      routingTrace.coercions.push("jk_sync_counter"), log.warn("jk_sync_counter_coerced", {
        from: analysis?.circuitType?.type,
        fromSubject: subjectKey,
      });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "jk_sync_counter" };
      }
      subjectKey = "digital_logic";
    }

    // ★ logic_condition_sop 안전망 (stale analysis 방어) — combinational_gate 등으로 와도 텍스트가
    //   "조합논리+간소화+동작조건(말)"이면 circuitType 강제 보정 (K-map 2출력 회로로 변질 차단).
    if (canCoerce && detectLogicConditionSop(analysis) && analysis?.circuitType?.type !== "logic_condition_sop") {
      routingTrace.coercions.push("logic_condition_sop"), log.warn("logic_condition_sop_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "logic_condition_sop" };
      }
      subjectKey = "digital_logic";
    }

    // ★ active_lowpass_filter 안전망 (stale analysis 방어) — 프론트가 수정 이전 분석(circuitType=
    //   generic opamp)을 state에 담아 재사용하면 반전증폭기로 변질. 텍스트가 "OPAMP+C+저역필터/대역폭"
    //   이면 여기서 circuitType 강제 보정 → 이후 semantic·dispatch가 일관되게 active_lowpass_filter로.
    if (canCoerce && detectActiveLowpassFilter(analysis) && analysis?.circuitType?.type !== "active_lowpass_filter") {
      routingTrace.coercions.push("active_lowpass_filter"), log.warn("active_lowpass_filter_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "active_lowpass_filter" };
      }
      subjectKey = "electronics";
    }
    // ★ jk_excitation_sop_pos 안전망 (stale analysis·과목 오선택 방어) — JK 여기표 + 불함수(SOP→POS)
    //   원본이 D-FF+MUX 회로로 생성되던 실측 신고. 텍스트 시그니처면 전용 archetype으로 교정.
    if (canCoerce && detectJkExcitationSopPos(analysis) && analysis?.circuitType?.type !== "jk_excitation_sop_pos") {
      routingTrace.coercions.push("jk_excitation_sop_pos"), log.warn("jk_excitation_sop_pos_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "jk_excitation_sop_pos" };
      }
      subjectKey = "digital_logic";
    }
    // ★ maxwell_concept_fill_blank 안전망 (임용 24번) — 개념 명칭형·EM 레지스트리로 새기 쉽다.
    if (canCoerce && detectMaxwellConceptFillBlank(analysis) && analysis?.circuitType?.type !== "maxwell_concept_fill_blank") {
      routingTrace.coercions.push("maxwell_concept_fill_blank"), log.warn("maxwell_concept_fill_blank_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "maxwell_concept_fill_blank" };
      }
    }

    // ★ number_repr_fill_blank 안전망 (임용 27번) — 그림 없는 텍스트 유형이라 generic·개념 명칭형으로
    //   새기 쉽다. 분류기와 같은 매처로 교정하고 과목도 digital_logic으로 고정한다.
    if (canCoerce && detectNumberReprFillBlank(analysis) && analysis?.circuitType?.type !== "number_repr_fill_blank") {
      routingTrace.coercions.push("number_repr_fill_blank"), log.warn("number_repr_fill_blank_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "number_repr_fill_blank" };
      }
      subjectKey = "digital_logic";
    }
    if (analysis?.circuitType?.type === "number_repr_fill_blank" && subjectKey !== "digital_logic") {
      subjectKey = "digital_logic";
    }

    // ★ bjt_early_effect_fill_blank 안전망 (임용 27번 전자회로) — 개념 문항이라 개념 명칭형·generic으로
    //   새기 쉽고, 형제 **bjt_characteristic_curve**(특성곡선 영역 식별)가 그래프 낱말만 보고 가져간다.
    //   그 형제들은 GENERIC이 아니라 canCoerce만으로는 건너뛰므로 coercible을 넓힌다(CLAUDE.md 1-2).
    const bjtEarlyCoercible = canCoerce
      || analysis?.circuitType?.type === "bjt_characteristic_curve"
      || analysis?.circuitType?.type === "bjt_bias"
      || analysis?.circuitType?.type === "bjt_small_signal";
    if (bjtEarlyCoercible && detectBjtEarlyEffectFillBlank(analysis) && analysis?.circuitType?.type !== "bjt_early_effect_fill_blank") {
      routingTrace.coercions.push("bjt_early_effect_fill_blank"), log.warn("bjt_early_effect_fill_blank_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "bjt_early_effect_fill_blank" };
      }
    }
    // 과목 오선택(circuit_theory·mixed_signal 등) 대비 — 전자회로 전용 유형이다.
    if (analysis?.circuitType?.type === "bjt_early_effect_fill_blank" && subjectKey !== "electronics") {
      subjectKey = "electronics";
    }

    // ★ jfet_depletion_fill_blank 안전망 (임용 28번) — 개념 문항이라 generic으로 새기 쉽다.
    if (detectJfetDepletionFillBlank(analysis) && analysis?.circuitType?.type !== "jfet_depletion_fill_blank") {
      routingTrace.coercions.push("jfet_depletion_fill_blank"), log.warn("jfet_depletion_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "jfet_depletion_fill_blank" };
      }
      subjectKey = "electronics";
    }

    // ★ r2r_ladder_dac 안전망 (임용 28번) — 과목이 electronics·mixed_signal로 흔들려도 유지.
    if (detectR2rLadderDac(analysis) && analysis?.circuitType?.type !== "r2r_ladder_dac") {
      routingTrace.coercions.push("r2r_ladder_dac"), log.warn("r2r_ladder_dac_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "r2r_ladder_dac" };
      }
    }

    // ★ ff_feedback_z_waveform 안전망 (임용 26번) — ruleSet 계산 전에 확정해야 figure role 요구가 좁혀진다.
    if (detectFfFeedbackZ(analysis) && analysis?.circuitType?.type !== "ff_feedback_z_waveform") {
      routingTrace.coercions.push("ff_feedback_z_waveform"), log.warn("ff_feedback_z_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "ff_feedback_z_waveform" };
      }
      subjectKey = "digital_logic";
    }

    // ★ ff_reachable_states 안전망 (임용 24번) — ruleSet이 이 circuitType을 보고 figure role 요구를
    //   (가)회로 + (나)파형으로 좁힌다. 안 하면 digital 기본 요구(kmap·implementation_circuit)에 걸려
    //   missing_figure_variant가 뜬다(실측, jk_mealy_state_design과 같은 패턴).
    if (detectFfReachableStates(analysis) && analysis?.circuitType?.type !== "ff_reachable_states") {
      routingTrace.coercions.push("ff_reachable_states"), log.warn("ff_reachable_states_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "ff_reachable_states" };
      }
      subjectKey = "digital_logic";
    }

    // ★ max_power_two_source_ratio 안전망 (임용 17번) — 단일 회로 최대전력 형제에서 교정.
    const maxP2Coercible = canCoerce
      || analysis?.circuitType?.type === "max_power_transfer"
      || analysis?.circuitType?.type === "ac_thevenin_ladder"
      || analysis?.circuitType?.type === "ac_bridge_max_power";
    if (maxP2Coercible && detectMaxPowerTwoSourceRatio(analysis) && analysis?.circuitType?.type !== "max_power_two_source_ratio") {
      routingTrace.coercions.push("max_power_two_source_ratio"), log.warn("max_power_two_source_ratio_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "max_power_two_source_ratio" };
      }
      subjectKey = "circuit_theory";
    }

    // ★ jk_two_phase_clock 안전망 (임용 30번) — stale/generic(universal_digital·jk_sync_counter·
    //   ff_with_waveform)에서 교정한다. 그 형제들은 GENERIC이 아닌 것도 있어 coercible을 넓힌다.
    const jkTwoPhaseCoercible = canCoerce
      || analysis?.circuitType?.type === "jk_sync_counter"
      || analysis?.circuitType?.type === "ff_with_waveform";
    if (jkTwoPhaseCoercible && detectJkTwoPhaseClock(analysis) && analysis?.circuitType?.type !== "jk_two_phase_clock") {
      routingTrace.coercions.push("jk_two_phase_clock"), log.warn("jk_two_phase_clock_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "jk_two_phase_clock" };
      }
      subjectKey = "digital_logic";
    }
    if (analysis?.circuitType?.type === "jk_two_phase_clock" && subjectKey !== "digital_logic") {
      log.info("jk_two_phase_clock_subject_coerced", { fromSubject: subjectKey });
      subjectKey = "digital_logic";
    }

    // ★ rlc_antiresonance_ladder 안전망 (임용 16번) — generic universal_ac·rlc_resonance·
    //   ac_parallel_branches(캐시)에서 교정한다.
    const rlcAntiCoercible = canCoerce || analysis?.circuitType?.type === "ac_parallel_branches"
      || analysis?.circuitType?.type === "rlc_resonance";
    if (rlcAntiCoercible && detectRlcAntiresonanceLadder(analysis) && analysis?.circuitType?.type !== "rlc_antiresonance_ladder") {
      routingTrace.coercions.push("rlc_antiresonance_ladder"), log.warn("rlc_antiresonance_ladder_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "rlc_antiresonance_ladder" };
      }
      subjectKey = "circuit_theory";
    }

    // ★ ac_dc_source_superposition_vc 안전망 (임용 15번) — generic universal_ac/ac_superposition에서 교정.
    //   ★★ `ac_parallel_branches`는 GENERIC_CIRCUIT_TYPES가 아니라 canCoerce가 false다 —
    //   그래서 프론트에 그 분석이 남아 있으면 안전망이 통째로 건너뛰고 임용 5번 회로가 계속 나온다
    //   (사용자 신고 2026-08-12, 임용 27번의 `ff_with_waveform`과 같은 구멍).
    //   이 형제는 **직류 전류원이 없고** 단자 a·b도 없어 구조가 겹치지 않으므로 덮어써도 안전하다
    //   (매처가 페이저·전원 크기 역산이면 이미 양보한다).
    const acDcVcCoercible = canCoerce || analysis?.circuitType?.type === "ac_parallel_branches";
    if (acDcVcCoercible && detectAcDcSourceSuperpositionVc(analysis) && analysis?.circuitType?.type !== "ac_dc_source_superposition_vc") {
      routingTrace.coercions.push("ac_dc_source_superposition_vc"), log.warn("ac_dc_source_superposition_vc_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "ac_dc_source_superposition_vc" };
      }
      subjectKey = "circuit_theory";
    }

    // ★ two_source_rl_superposition 안전망 (임용 4번) — stale/generic(ac_superposition·switched_rl 등)에서 교정.
    if (canCoerce && detectTwoSourceRlSuperposition(analysis) && analysis?.circuitType?.type !== "two_source_rl_superposition") {
      routingTrace.coercions.push("two_source_rl_superposition"), log.warn("two_source_rl_superposition_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "two_source_rl_superposition" };
      }
      subjectKey = "circuit_theory";
    }

    // ★ switched_rl_dual_short 안전망 (임용 17번) — stale `switched_rl`(generic)로 남으면
    //   단일 전압원 직렬 RL로 변질된다. 분류기와 **같은 매처**로 교정한다.
    if (canCoerce && detectSwitchedRlDualShort(analysis) && analysis?.circuitType?.type !== "switched_rl_dual_short") {
      routingTrace.coercions.push("switched_rl_dual_short"), log.warn("switched_rl_dual_short_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "switched_rl_dual_short" };
      }
      subjectKey = "circuit_theory";
    }

    // ★ dff_preset_clear_regions 안전망 (stale analysis·과목 오선택 방어) — 임용 27번.
    //   전용 항목이 생기기 전 분석이 프론트 state에 남아 있으면 `unsupported`(→ universal_digital)나
    //   `ff_with_waveform`으로 흘러 원본과 무관한 문제가 나온다. 분류기와 **같은 매처**로 교정한다.
    //   회로가 아날로그처럼 보여 과목이 흔들리므로 subjectKey도 digital_logic으로 고정한다.
    //   ★★ 여기만 `canCoerce`를 넓힌다: 실측 신고(2026-08-12)에서 프론트에 남은 이전 분석이
    //   `ff_with_waveform`(임용 8번)이었는데 그 값은 GENERIC_CIRCUIT_TYPES가 아니라 안전망이
    //   통째로 건너뛰었고, 입력이 A·B·C 3개인 다른 회로가 생성됐다. 이 형제는 **입력이 3개**라
    //   A·B 2입력 시그니처와 구조가 겹치지 않으므로 덮어써도 안전하다(매처가 이미 양보 가드를 갖는다).
    const dffPcCoercible = canCoerce || analysis?.circuitType?.type === "ff_with_waveform";
    if (dffPcCoercible && detectDffPresetClearRegions(analysis) && analysis?.circuitType?.type !== "dff_preset_clear_regions") {
      routingTrace.coercions.push("dff_preset_clear_regions"), log.warn("dff_preset_clear_regions_coerced", {
        from: analysis?.circuitType?.type,
        fromSubject: subjectKey,
      });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "dff_preset_clear_regions" };
      }
      subjectKey = "digital_logic";
    }
    // ★ 과목 오선택 보정 — 분류기가 이미 전용 유형을 골랐어도(안전망 미발화) 사용자가 전자회로·복합형을
    //   고르면 digital/mixed coercion이 덮어쓴다. ruleSet·semantic 계산 **전에** 과목을 고정한다.
    if (analysis?.circuitType?.type === "dff_preset_clear_regions" && subjectKey !== "digital_logic") {
      log.info("dff_preset_clear_subject_coerced", { fromSubject: subjectKey });
      subjectKey = "digital_logic";
    }

    // ★ ac_superposition_source_design 안전망 (stale analysis 방어) — Vision이 "중첩"·"개방/단락"을
    //   흘린 실행에서는 universal_ac로 떨어져 발문이 placeholder가 된다(실측 신고). 텍스트가
    //   "교류 2전원 + 목표 페이저 전압 + 전원 크기 역산"이면 전용 archetype으로 교정.
    if (canCoerce && detectAcSuperpositionSourceDesign(analysis) && analysis?.circuitType?.type !== "ac_superposition_source_design") {
      routingTrace.coercions.push("ac_superposition_source_design"), log.warn("ac_superposition_source_design_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "ac_superposition_source_design" };
      }
      subjectKey = "circuit_theory";
    }
    // ★ dc_wheatstone_balance 안전망 (stale analysis·과목 오선택 방어) — 이 원본은 dc_resistive로
    //   분석돼 dc_nodal(low)로 떨어지면 inventoryCount≥7 게이트에 걸려 topology_driven으로 새고,
    //   브리지 다이아몬드·미지 R_x·개방 V_o가 모두 사라진 저항망이 조용히 생성된다(실측 로그).
    //   텍스트가 "브리지 + 평형 + 순수 DC 저항망"이면 여기서 circuitType·subject를 교정.
    if (canCoerce && detectDcWheatstoneBalance(analysis) && analysis?.circuitType?.type !== "dc_wheatstone_balance") {
      routingTrace.coercions.push("dc_wheatstone_balance"), log.warn("dc_wheatstone_balance_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "dc_wheatstone_balance" };
      }
      subjectKey = "circuit_theory";
    }
    // ★ jk_mealy_state_design 안전망 (임용 9번 디지털) — JK-FF 2개 Mealy 상태도 + 상태표 빈칸.
    if (canCoerce && detectJkMealyStateDesign(analysis) && analysis?.circuitType?.type !== "jk_mealy_state_design") {
      routingTrace.coercions.push("jk_mealy_state_design"), log.warn("jk_mealy_state_design_coerced", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "jk_mealy_state_design" };
    }
    // ★ bjt_thevenin_bias 안전망 (임용 10번 전자회로) — BJT 바이어스 + 베이스망 테브난 등가.
    //   실측: generic bjt_bias(임용 7번 저항률 유형)가 잡아 전혀 다른 문제가 생성됐다.
    if (canCoerce && detectBjtTheveninBias(analysis) && analysis?.circuitType?.type !== "bjt_thevenin_bias") {
      routingTrace.coercions.push("bjt_thevenin_bias"), log.warn("bjt_thevenin_bias_coerced", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "bjt_thevenin_bias" };
      subjectKey = "electronics";
    }
    // ★ bjt_switch_logic_gate 안전망 (임용 2번) — BJT 이상적 스위치 → 진리표 + 등가 논리게이트.
    //   과목이 digital_logic으로 잡혀도 같은 유형이라 subject 보정 없이 dispatch만 맞춘다.
    if (canCoerce && detectBjtSwitchLogicGate(analysis) && analysis?.circuitType?.type !== "bjt_switch_logic_gate") {
      routingTrace.coercions.push("bjt_switch_logic_gate"), log.warn("bjt_switch_logic_gate_coerced", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "bjt_switch_logic_gate" };
    }
    // ★ comparator_diode_or 안전망 (임용 3번 전자회로) — 비교기 2개 + 다이오드 결합.
    //   실측: 분류기가 ㉠㉡ 마커 + ON/OFF만 보고 bjt_characteristic_curve로 가로채 변질됐다.
    if (canCoerce && detectComparatorDiodeOr(analysis) && analysis?.circuitType?.type !== "comparator_diode_or") {
      routingTrace.coercions.push("comparator_diode_or"), log.warn("comparator_diode_or_coerced", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "comparator_diode_or" };
      subjectKey = "electronics";
    }
    // ★ opamp_summer_tfeedback 안전망 (임용 7번 전자회로) — 반전 가산기 + T형 궤환 + 부하 전류 I_L.
    //   실측: generic opamp_cascade_voltage_divider가 잡아 전역 되먹임 전달함수 문제로 변질됐다.
    if (canCoerce && detectOpampSummerTFeedback(analysis) && analysis?.circuitType?.type !== "opamp_summer_tfeedback") {
      routingTrace.coercions.push("opamp_summer_tfeedback"), log.warn("opamp_summer_tfeedback_coerced", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "opamp_summer_tfeedback" };
      subjectKey = "electronics";
    }
    // ★ opamp_two_stage_rx 안전망 (임용 2번 전자회로) — 2단 OPAMP + 미지 저항 R_X 설계.
    //   실측(2026-08-02): Vision이 inventory에 OPAMP를 하나도 안 넣어 분류가 generic `opamp`로 떨어지고,
    //   바로 아래 opamp_finite_gain_block 안전망이 가로채 "블록도 + 개방루프 이득" 문제로 변질됐다.
    //   → 형제 안전망들보다 **앞**에 두고, 아래 형제에는 양보 가드를 건다(CLAUDE.md 1-2).
    if (canCoerce && detectOpampTwoStageRx(analysis) && analysis?.circuitType?.type !== "opamp_two_stage_rx") {
      routingTrace.coercions.push("opamp_two_stage_rx"), log.warn("opamp_two_stage_rx_coerced", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "opamp_two_stage_rx" };
      subjectKey = "electronics";
    }
    // ★ opamp_finite_gain_block 안전망 (stale analysis 방어) — 캐시된 이전 분석이 넘어오면
    //   다른 경로로 빠져 빈 concept_diagram("nodes 비어있음") 에러가 화면에 뜬다(실측 신고).
    //   ※ 2단 R_X 설계형(위)이면 양보 — 두 유형 모두 "이상 OPAMP + 저항"을 공유한다.
    if (canCoerce && !detectOpampTwoStageRx(analysis) && detectOpampFiniteGainBlock(analysis) && analysis?.circuitType?.type !== "opamp_finite_gain_block") {
      routingTrace.coercions.push("opamp_finite_gain_block"), log.warn("opamp_finite_gain_block_coerced", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "opamp_finite_gain_block" };
      subjectKey = "electronics";
    }
    // ★ opamp_loop_gain_stability 안전망 (임용 12번 전자회로) — 형제들이 "개방루프 이득 A(s)"를 공유해
    //   가로챈다. 고유 신호(루프이득·루프 절단·특성방정식·좌반평면)가 보이면 전용 archetype으로 교정.
    if (canCoerce && detectOpampLoopGainStability(analysis) && analysis?.circuitType?.type !== "opamp_loop_gain_stability") {
      routingTrace.coercions.push("opamp_loop_gain_stability"), log.warn("opamp_loop_gain_stability_coerced", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "opamp_loop_gain_stability" };
      subjectKey = "electronics";
    }
    // ★ opamp_finite_gain_offset 안전망 (임용 9번 전자회로) — 형제 opamp_finite_gain_block(임용 11번)이
    //   "개방루프 이득 A₀"를 공유해 가로챈다(실측 dispatch=opamp_finite_gain_block). 판별자는 **출력단
    //   직렬 전압원 V_B**(V_out=V_D−V_B). 위 block 안전망 **뒤**에 둬서 마지막에 교정되게 한다.
    if (canCoerce && detectOpampFiniteGainOffset(analysis) && analysis?.circuitType?.type !== "opamp_finite_gain_offset") {
      routingTrace.coercions.push("opamp_finite_gain_offset"), log.warn("opamp_finite_gain_offset_coerced", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "opamp_finite_gain_offset" };
      subjectKey = "electronics";
    }
    // ★ inductor_ramp_slope 안전망 — stale/오분류 시 2전원 SPDT archetype이 가로채 전혀 다른 회로가 된다.
    if (canCoerce && detectInductorRampSlope(analysis) && analysis?.circuitType?.type !== "inductor_ramp_slope") {
      routingTrace.coercions.push("inductor_ramp_slope"), log.warn("inductor_ramp_slope_coerced", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "inductor_ramp_slope" };
      subjectKey = "circuit_theory";
    }
    // ★ ac_superposition 안전망 (stale analysis 방어) — 프론트가 캐시한 이전 분석의 circuitType
    //   (universal_ac 등)이 넘어오면 generic 경로로 빠져 "공진·최대전력" 같은 전혀 다른 문제가 된다.
    //   텍스트가 "교류 + 전압원·전류원 + 중첩(단어 또는 개방/단락 절차)"이면 전용 archetype으로 교정.
    if (canCoerce && detectAcSuperposition(analysis) && analysis?.circuitType?.type !== "ac_superposition") {
      routingTrace.coercions.push("ac_superposition"), log.warn("ac_superposition_coerced", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "ac_superposition" };
      subjectKey = "circuit_theory";
    }
    // ★ switched_rc_dc_transient 안전망 (stale analysis 방어) — 프론트가 캐시한 이전 분석의
    //   circuitType(transient_rc·switched_rc 등)이 넘어오면 generic 경로로 빠져 C가 직렬로 그려지고
    //   v_c(0⁻) 소문항이 사라진다(실측 신고). 텍스트·inventory가 "SW + 순수 RC + 전류원 + DC정상상태"면
    //   여기서 circuitType을 교정 → 이후 semantic·ruleSet·dispatch가 전용 archetype으로 일관되게 흐른다.
    if (canCoerce && detectSwitchedRcDcTransient(analysis) && analysis?.circuitType?.type !== "switched_rc_dc_transient") {
      routingTrace.coercions.push("switched_rc_dc_transient"), log.warn("switched_rc_dc_transient_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "switched_rc_dc_transient" };
      }
      subjectKey = "circuit_theory";
    }
    // ★ opamp_analog_summer 안전망 (stale analysis 방어) — generic opamp로 와도 텍스트가
    //   "OPAMP + 삼각/구형 파형 + 아날로그 설계(저항 동일)"면 circuitType 강제 보정.
    if (canCoerce && detectOpampAnalogSummer(analysis) && analysis?.circuitType?.type !== "opamp_analog_summer") {
      routingTrace.coercions.push("opamp_analog_summer"), log.warn("opamp_analog_summer_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "opamp_analog_summer" };
      }
      subjectKey = "electronics";
    }
    // ★ D-FF/T-FF + 2×1 MUX 자율 순차회로(임용 8번) 안전망 (stale analysis 방어)
    //   — 프론트가 analysis를 React state로 캐시 → 분류기 수정 전의 circuitType(fsm·sequential_dff_generic·
    //   universal_digital·switched_dc·mux_implementation 등)이 남아 generate로 전달되면 generic 가로 배치로 변질.
    //   circuitType과 무관하게 텍스트·inventory가 "D-FF + 2×1 MUX + 상태도/순차(자율, SR·JK 아님)"이면
    //   전용 세로 스택 archetype으로 교정. (SR→sr_ff_mux_sequential·JK→fsm은 detector가 양보.)
    if (canCoerce && analysis?.circuitType?.type !== "dff_mux_sequential" && detectDffMuxSequential(analysis)) {
      routingTrace.coercions.push("dff_mux_sequential"), log.warn("dff_mux_sequential_coerced_from_stale", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "dff_mux_sequential" };
      subjectKey = "digital_logic";
    }
    // ★ dff_state_design 안전망 (stale analysis 방어) — 프론트가 캐시한 이전 분석의 circuitType(fsm 등)이
    //   넘어오면 generic FSM으로 빠져 있지도 않은 입력 X·출력 Z가 있는 Mealy 문제로 변질된다(실측 신고).
    //   텍스트가 "상태도/상태표 + 플립플롭·게이트 설계 + 자율 순환"이면 교정. (JK·T·SR·MUX·외부 I/O는 양보.)
    //   ※ dff_mux_sequential 보정 뒤에 둬서 MUX 유형을 뺏지 않는다.
    if (canCoerce && detectDffStateDesign(analysis) && analysis?.circuitType?.type !== "dff_state_design"
        && analysis?.circuitType?.type !== "dff_mux_sequential") {
      routingTrace.coercions.push("dff_state_design"), log.warn("dff_state_design_coerced_from_stale", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "dff_state_design" };
      subjectKey = "digital_logic";
    }
    // ★ T 플립플롭 + JK 플립플롭 혼합 응용회로(임용 9번) 안전망 (stale/오분류 방어)
    //   — 캐시된 fsm/sequential_dff_generic/ff_with_waveform로 가면 단일 FF·상태표 없음으로 변질.
    //   T·JK 두 종류가 모두 있으면(MUX 없음) flipflop_mixed_app로 교정(회로 2 FF + 상태표 + 파형).
    else if (canCoerce && analysis?.circuitType?.type !== "flipflop_mixed_app" && detectFfMixedApp(analysis)) {
      routingTrace.coercions.push("flipflop_mixed_app"), log.warn("flipflop_mixed_app_coerced_from_stale", { from: analysis?.circuitType?.type });
      if (analysis) analysis.circuitType = { ...(analysis.circuitType ?? { params: { ffTypes: ["T", "JK"], hasStateTable: true, hasWaveform: true }, confidence: "high", reasoning: "" }), type: "flipflop_mixed_app", params: { ffTypes: ["T", "JK"], hasStateTable: true, hasWaveform: true } };
      subjectKey = "digital_logic";
    }
    // ★ opamp_two_input_diff_design 안전망 (stale analysis 방어) — 프론트가 opamp_cascade/generic으로
    //   분류된 캐시를 재사용하면 전달함수 문제로 변질. 텍스트가 "2-OPAMP + v₁·v₂ + 관계식"(임용 5번)이면 교정.
    if (canCoerce && detectOpampTwoInputDesign(analysis) && analysis?.circuitType?.type !== "opamp_two_input_diff_design") {
      routingTrace.coercions.push("opamp_two_input_design"), log.warn("opamp_two_input_design_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "opamp_two_input_diff_design" };
      }
      subjectKey = "electronics";
    }
    // ★ opamp_series_regulator 안전망 (stale analysis 방어) — 동일 사유.
    if (canCoerce && detectOpampSeriesRegulator(analysis) && analysis?.circuitType?.type !== "opamp_series_regulator") {
      routingTrace.coercions.push("opamp_series_regulator"), log.warn("opamp_series_regulator_coerced", { from: analysis?.circuitType?.type });
      if (analysis) {
        analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: "opamp_series_regulator" };
      }
      subjectKey = "electronics";
    }

    // ★ bjt_bias 재검출 안전망 (stale analysis 방어) — 프론트가 수정 이전 분석(circuitType=
    //   bjt_characteristic_curve, "활성/포화 영역" 오탈취 or switched_dc)을 캐시하면 재분석 없이
    //   특성곡선/스위칭 문제가 생성됨. ★판별자: 진짜 특성곡선은 단일 소자 그래프지만, SW+BJT 또는
    //   BJT 2개는 실제 바이어스 회로(커브 트레이서 아님) → circuitType을 bjt_bias로 교정.
    {
      const ct = analysis?.circuitType?.type;
      if (ct === "bjt_characteristic_curve" || ct === "switched_dc") {
        const inv = analysis?.componentInventory ?? [];
        const up = (t: unknown) => String(t ?? "").toUpperCase();
        const bjtN = inv.filter((c) => ["BJT", "NPN", "PNP", "TRANSISTOR", "트랜지스터"].includes(up(c.type))).length;
        const rN = inv.filter((c) => up(c.type) === "R").length;
        const swN = inv.filter((c) => up(c.type) === "SW").length;
        const btxt = [
          analysis?.topic ?? "", analysis?.interpretation ?? "",
          (analysis?.relatedConcepts ?? []).join(" "),
          (analysis?.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
        ].join(" ").toLowerCase();
        const hasBjt = bjtN >= 1 || /트랜지스터|bjt|쌍극성/.test(btxt);
        // 실제 바이어스 회로(단일 소자 커브 트레이서 아님) — SW+BJT 또는 BJT 2개면 특성곡선일 수 없음.
        const unambiguousBiasCircuit = (swN >= 1 && bjtN >= 1) || bjtN >= 2;
        const biasCompute = /v_be\s*=?\s*0\.7|v_eb\s*=?\s*0\.7|i_c\s*=\s*i_e|i_e\s*=\s*i_c|베이스[- ]?이미터 전압/.test(btxt);
        const strongCurve = /출력특성곡선|특성\s*곡선|드레인 특성|여러\s*개?의?\s*i_b|다중 i_b|i_c-v_ce|characteristic curve|output characteristics/.test(btxt);
        if (hasBjt && (unambiguousBiasCircuit || (biasCompute && !strongCurve))) {
          // BJT 2개 + 스위치면 상보형 2단 전용 archetype, 아니면 단일 bjt_bias.
          const twoStage = detectBjtTwoStageSwitched(analysis) || (bjtN >= 2 && swN >= 1);
          const target = twoStage ? "bjt_two_stage_switched" : "bjt_bias";
          routingTrace.coercions.push("bjt"), log.warn("bjt_coerced_from_stale", { from: ct, to: target, bjtN, rN, swN, unambiguousBiasCircuit, biasCompute, strongCurve });
          if (analysis) {
            analysis.circuitType = { ...(analysis.circuitType ?? { params: {}, confidence: "high", reasoning: "" }), type: target };
          }
          subjectKey = "electronics";
        }
      }
    }

    // ★ electronics 전용 archetype subject 보정 (ruleSet·semantic 계산 전에 무조건) — 0-PRE(subject 무관)로
    //   분류된 opamp_analog_summer 등은 subject가 digital_logic·mixed_signal이어도 electronics여야
    //   ruleSet(subject·required figure)·validator(subject_mismatch)가 일관된다. 안전망(위)은 circuitType이
    //   이미 목표면 발화 안 하므로 여기서 무조건 보정.
    if (analysis?.circuitType?.type === "opamp_analog_summer" ||
        analysis?.circuitType?.type === "opamp_series_regulator" ||
        analysis?.circuitType?.type === "active_lowpass_filter" ||
        // ★ bjt_bias는 항상 electronics — subject=circuit_theory로 분석된 BJT+SW 회로가
        //   classifier에서 bjt_bias로 교정된 경우(switched_dc 오탈취 차단) dispatch 되도록 보정.
        analysis?.circuitType?.type === "bjt_bias" ||
        analysis?.circuitType?.type === "bjt_two_stage_switched" ||
        analysis?.circuitType?.type === "opamp_two_input_diff_design") {
      subjectKey = "electronics";
    }

    // ★ circuit_theory 전용 archetype subject 보정 (ruleSet·semantic 계산 전에 무조건) — 0-PRE(subject
    //   무관)로 분류된 dc_wheatstone_balance는 과목을 전자회로·복합형으로 잘못 골라도 circuit_theory여야
    //   ruleSet·dispatch(회로이론 분기)·validator(subject_mismatch)가 일관된다.
    if (analysis?.circuitType?.type === "dc_wheatstone_balance" ||
        analysis?.circuitType?.type === "ac_superposition_source_design") {
      subjectKey = "circuit_theory";
    }

    const rawSemantic: SemanticStructure = body.semantic ?? analysis?.semantic ?? DEFAULT_SEMANTIC;
    // ── semantic normalize: SW만 있고 C/L이 없는 두 정상상태 비교 케이스는
    //    waveform 응답이 아니므로 hasWaveformEvolution을 false로 (analyze가 SW
    //    swiching을 timing 변화로 잘못 marking할 때가 잦아 ruleSet의 waveform required
    //    조건이 false-positive로 figure 누락 issue를 일으킴).
    const inventory = analysis?.componentInventory ?? [];
    const hasCapOrIndInCircuit = inventory.some((c) => c.type === "C" || c.type === "L");
    const isAcSuperposition = analysis?.circuitType?.type === "ac_superposition" ||
      analysis?.circuitType?.type === "ac_parallel_branches";
    // rlc_resonance_max_power: phasor 정상상태 — waveform figure 불필요.
    const isRlcResonanceMaxPower = analysis?.circuitType?.type === "rlc_resonance_max_power";
    // universal_ac: phasor 정상상태 query (componentAvgPower·maxAvgPower·resonanceFreq 등). 시간영역 waveform 불필요.
    const isUniversalAc = analysis?.circuitType?.type === "universal_ac";
    // universal_ac DC+AC 중첩 모드: 스위치는 전원 선택용(단자 연결) — 상태 전이(t<0/t>0) 문제가 아님.
    //  → waveform 뿐 아니라 state_before/state_after figure 요구도 면제.
    const isAcDcSuperposition =
      isUniversalAc && Boolean(
        analysis?.circuitType?.params?.acDcSuperposition ||
        analysis?.circuitType?.params?.acDcSuperpositionRc, // 임용 12번 RC 중첩 — 정상상태(상태전이 아님)
      );
    // switched_rlc_*는 v_C(t) 응답이 학생 도출 정답이라 waveform figure를 안 만듦 (학습 의도).
    //  → state_before/state_after figure로 시간 변화 표현 → hasWaveformEvolution=false 강제로 waveform required 면제.
    const isSwitchedRlc =
      analysis?.circuitType?.type === "switched_rlc_5leg" ||
      analysis?.circuitType?.type === "switched_rlc_step";
    // diode_clamper (임용 2번 전자회로): (가)회로 + (나)파형 2 figure — 파형 유지, 상태·등가 면제.
    //   ★ 비회로 과목(전자기학·C언어·통신·교육학)은 dispatch가 앞에서 가로채므로 semantic도 켜지 않는다
    //     — 켜두면 파형 figure 없는 결과에 missing_waveform이 뜬다(사용자 신고).
    const isDiodeClamper =
      !(["electromagnetics", "c_language", "communications", "pedagogy"] as string[]).includes(String(subjectKey)) &&
      (analysis?.circuitType?.type === "diode_clamper" || detectDiodeClamper(analysis));
    // ac_thevenin_two_box (임용 10번 회로이론): 점선 박스 2개 직렬 + R_L — 단일 회로 figure.
    //   페이저 정상상태라 파형·상태쌍 면제(등가 유도는 발문 안에서 하고 figure는 추가하지 않는다).
    //   ★ Vision이 단자 라벨(a-b·c-d)을 요약에서 통째로 흘리는 회차가 잦다(실측 2/2) — 그때는
    //     기존 0-PRE가 `universal_ac + params.theveninMaxPower`로 분류한다. 그 시그니처는
    //     **같은 임용 10번 원본 전용**이므로 여기로 흡수한다(옛 archetype은 단자쌍을 하나로
    //     합쳐 그리고 풀이의 Z_th 계산도 틀렸다).
    const isAcTheveninTwoBox =
      analysis?.circuitType?.type === "ac_thevenin_two_box" ||
      analysis?.circuitType?.params?.theveninMaxPower === true ||
      detectAcTheveninTwoBox(analysis);
    // dc_two_source_ladder (임용 3번 회로이론): 단일 회로 figure, DC 정상상태 — 파형·상태·등가·multi 면제.
    const isDcTwoSourceLadder =
      analysis?.circuitType?.type === "dc_two_source_ladder" ||
      (subjectKey === "circuit_theory" && detectDcTwoSourceLadder(analysis));
    // jk_mealy_state_design (임용 9번 디지털): (가) 상태도 + (나) 상태표 2 figure — 파형 없음.
    const isJkMealyStateDesign =
      analysis?.circuitType?.type === "jk_mealy_state_design" || detectJkMealyStateDesign(analysis);
    // bjt_thevenin_bias (임용 10번 전자회로): (가) 원본 + (나) 테브난 등가 2 figure — 등가·multi 필요.
    const isBjtTheveninBias =
      analysis?.circuitType?.type === "bjt_thevenin_bias" || detectBjtTheveninBias(analysis);
    // bjt_switch_logic_gate (임용 2번): (가) 회로 + (나) 진리표 2 figure — 파형·상태·등가 면제, multi 유지.
    const isBjtSwitchLogic =
      analysis?.circuitType?.type === "bjt_switch_logic_gate" || detectBjtSwitchLogicGate(analysis);
    // comparator_diode_or (임용 3번): (가) 회로 + (나) 입력 파형 2 figure — 파형 유지, 상태·등가 면제.
    const isComparatorDiodeOr =
      analysis?.circuitType?.type === "comparator_diode_or" || detectComparatorDiodeOr(analysis);
    // opamp_summer_tfeedback (임용 7번 전자회로): 단일 회로 figure, DC — 파형·상태·등가·multi 면제.
    const isOpampSummerTFeedback =
      analysis?.circuitType?.type === "opamp_summer_tfeedback" || detectOpampSummerTFeedback(analysis);
    // opamp_two_stage_rx (임용 2번 전자회로): 단일 회로 figure, DC 정상상태 — 파형·상태·등가·multi 면제.
    const isOpampTwoStageRx =
      analysis?.circuitType?.type === "opamp_two_stage_rx" || detectOpampTwoStageRx(analysis);
    // ac_thevenin_design_ab (임용 7번): 단일 회로 figure — 파형·상태·등가·multi 모두 면제.
    const isAcThevDesignAb =
      analysis?.circuitType?.type === "ac_thevenin_design_ab" ||
      (subjectKey === "circuit_theory" && detectAcTheveninDesignAb(analysis));
    // ac_delta_wye_bridge (임용 2번 회로이론): (가) 브리지 + (나) Δ-Y 등가 2 figure.
    //   페이저 정상상태 → 파형·상태쌍 면제, **등가 변환이 문제의 핵심이라 등가·multi는 켠다**.
    //   ★ stale analysis 대비로 감지 안전망 결과도 인정.
    const isAcDeltaWyeBridge =
      analysis?.circuitType?.type === "ac_delta_wye_bridge" || detectAcDeltaWyeBridge(analysis);
    // oscilloscope_phase_l (임용 11번 회로이론): (가) 스코프 화면 + (나) 회로 2 figure.
    //   ★ 파형 figure는 **주어지는 자료**(학생이 그리는 게 아니다) → hasWaveformEvolution은 켜지 않는다
    //     (켜면 IO-waveform split 요구가 붙는다 — opamp_analog_summer 선례). multi만 켠다.
    const isOscPhaseL =
      analysis?.circuitType?.type === "oscilloscope_phase_l" || detectOscilloscopePhaseL(analysis);
    // ac_two_source_mesh_power (임용 5번 회로이론): 단일 회로 figure — 페이저 정상상태라 파형·상태·등가·multi 면제.
    // dff_nand_mux_pair (임용 12번 디지털): (가) 논리회로 + (나) 파형 2 figure — 파형은 주어지는 자료.
    const isDffNandMux =
      analysis?.circuitType?.type === "dff_nand_mux_pair" || detectDffNandMuxPair(analysis);
    const isAcTwoSrcMesh =
      analysis?.circuitType?.type === "ac_two_source_mesh_power" || detectAcTwoSourceMeshPower(analysis);
    // ac_superposition_null_source (임용 3번 회로이론): 단일 회로 figure — 페이저 정상상태(중첩)라
    //   파형·상태·등가·multi 모두 면제. 전류원 I_s는 학생이 도출한다.
    const isAcNullSource =
      analysis?.circuitType?.type === "ac_superposition_null_source" || detectAcSuperpositionNullSource(analysis);
    // thevenin_dep_graph_max_power (임용 9번 회로이론): (가) 회로 + (나) V-I 그래프 2 figure.
    //   ★ 그래프는 **주어지는 자료**라 hasWaveformEvolution은 켜지 않는다(oscilloscope_phase_l 선례).
    //   등가변환(테브난)이 절차의 핵심이므로 hasEquivalentTransformation은 켠다.
    const isTdgMaxPower =
      analysis?.circuitType?.type === "thevenin_dep_graph_max_power" || detectTheveninDepGraph(analysis);
    // opamp_avg_superposition_r (임용 8번 전자회로): 단일 회로 figure — 파형·상태·등가·multi 모두 면제.
    const isOpampAvgSup =
      analysis?.circuitType?.type === "opamp_avg_superposition_r" || detectOpampAvgSuperposition(analysis);
    // zener_shunt_regulator (임용 2번 전자): 단일 회로 figure — 파형·상태·등가·multi 모두 면제.
    const isZenerShunt =
      analysis?.circuitType?.type === "zener_shunt_regulator" || detectZenerShuntRegulator(analysis);
    // switched_rlc_source_free (임용 5번): 단일 회로 figure — i(t)·v(t)는 학생 도출.
    const isSwitchedRlcSourceFree =
      analysis?.circuitType?.type === "switched_rlc_source_free" ||
      (subjectKey === "circuit_theory" && detectSwitchedRlcSourceFree(analysis));
    // rlc_state_equation (임용 6번): 단일 회로 figure — 상태방정식은 학생이 세우는 것이라
    //   파형·상태쌍·등가·multi 전부 면제. stale analysis 대비로 감지 안전망 결과도 인정.
    const isRlcStateEquation =
      analysis?.circuitType?.type === "rlc_state_equation" ||
      (subjectKey === "circuit_theory" && detectRlcStateEquation(analysis));
    // switched_rlc_dual_switch (2022 전기 B-5): 단일 회로 figure — v_c(t)·i₁(t)는 학생 도출.
    //   파형·상태쌍·등가·multi 모두 면제. ★ stale analysis 대비로 감지 안전망 결과도 인정.
    const isSwitchedRlcDualSwitch =
      analysis?.circuitType?.type === "switched_rlc_dual_switch" ||
      (subjectKey === "circuit_theory" && detectSwitchedRlcDualSwitch(analysis));
    // switched_cap_short_rl (임용 7번 회로이론): 단일 회로 figure — i_L(t)는 학생이 구하는 답이므로
    //   파형 figure를 요구하면 답이 그림에 노출된다. 상태쌍·등가·multi도 면제.
    const isSwitchedCapShortRl =
      analysis?.circuitType?.type === "switched_cap_short_rl" || detectSwitchedCapShortRl(analysis);
    // 스위치 RL + 종속전원(2i_A) 과도응답 (임용 7번) — v_o(t)는 학생 도출 정답 → waveform figure 불필요.
    const isSwitchedRlDep =
      (analysis?.circuitType?.type === "switched_rl" || analysis?.circuitType?.type === "rl_step") &&
      (analysis?.componentInventory ?? []).some((c) => ["CCVS", "CCCS", "VCVS", "VCCS"].includes(String(c.type)));
    // 스위치 RL + 종속 전류원(k·iₙ) 과도응답 (임용 2024 전기 B-5) — i_R(t)는 학생 도출 정답 → waveform figure 불필요.
    const isSwitchedRlDepICase = subjectKey === "circuit_theory" && detectSwitchedRlDepI(analysis);
    // 2전원 SPDT 스위치 RL 과도 (임용 3번) — 단일 회로 figure. i(t)·i(∞)는 학생 도출 → 파형·상태전이 figure 면제.
    const isSwitchedRlDualSource =
      subjectKey === "circuit_theory" &&
      (analysis?.circuitType?.type === "switched_rl" || analysis?.circuitType?.type === "rl_step") &&
      detectSwitchedRlDualSource(analysis);
    // bjt_characteristic_curve는 개념·도식 해석형 — 시간영역 파형 없음, 회로 netlist 없음.
    //  단일 characteristic_curve figure 1장으로 충분.
    const isCharacteristicCurve = analysis?.circuitType?.type === "bjt_characteristic_curve";
    // zener_bjt_regulator는 단일 회로 해석형 (V_o·전류·저항 도출) — 파형·상태전이·multi-figure 불필요.
    const isZenerBjtRegulator = analysis?.circuitType?.type === "zener_bjt_regulator";
    // opamp_series_regulator: OPAMP 직렬형 정전압 안정화 (임용 30번) 단일 회로 해석형 — 파형·상태·등가·multi 면제.
    const isOpampSeriesRegulator = analysis?.circuitType?.type === "opamp_series_regulator";
    // active_lowpass_filter: 1차 능동 저역통과 필터 대역폭 분석 (임용 31번) 단일 회로 — 파형·상태·등가·multi 면제.
    const isActiveLowpassFilter = analysis?.circuitType?.type === "active_lowpass_filter";
    // opamp_analog_summer: 아날로그 시스템 설계 (2-OPAMP 가산기). (다)블록도(main_circuit)+(라)파형은 given,
    //   정답 회로는 solutionFigure. 파형은 학생 도출물 아님(given) → hasWaveformEvolution=false로 IO-waveform
    //   split·waveform 필수화 방지. main_circuit(블록도)만 요구 → 파형은 추가 figure로 허용.
    const isOpampAnalogSummer = analysis?.circuitType?.type === "opamp_analog_summer";
    // SCR 턴온: (가)회로 + (나)V_G 파형(주어짐) 2-figure. I_A는 텍스트 정답 → 파형·상태·등가 면제, multi 유지.
    const isScrTurnOn = analysis?.circuitType?.type === "scr_turn_on";
    // 인덕터/커패시터 v-i 적분: (가)회로 + (나)입력 파형(주어짐). 출력은 텍스트 식 → 파형·상태·등가 면제.
    const isReactiveViIntegral = analysis?.circuitType?.type === "inductor_vi_integral";
    // async_preset_ripple_counter는 (가)회로+(나)파형 2-figure 형식. 파형은 제공하므로 유지,
    //  스위치 t<0/t>0 상태쌍은 없음(F=NOR 자동재적재) → hasStateTransition=false로 state_before/after 면제.
    const isAsyncPresetCounter = analysis?.circuitType?.type === "async_preset_ripple_counter";
    // jk_sync_counter는 (가)회로 + (나)타이밍 도표 2-figure. 파형은 제공하므로 유지(multi 유지),
    //  스위치 t<0/t>0 상태쌍은 없음(카운터 계수) → hasStateTransition=false로 state_before/after 면제.
    const isJkSyncCounter = analysis?.circuitType?.type === "jk_sync_counter";
    // dff_preset_clear_regions는 (가)회로 + (나)파형 2-figure. 파형은 제공하므로 유지(multi 유지),
    //  PR·CLR은 비동기 입력이지 스위치 t<0/t>0 상태쌍이 아니다 → hasStateTransition=false로
    //  state_before/after 요구 면제 (CLAUDE.md 1-6 — 생성기가 만들 수 없는 role은 요구하지 않는다).
    const isDffPresetClear = analysis?.circuitType?.type === "dff_preset_clear_regions";
    // switched_rl_dual_short: 단일 회로 figure. i(t)·v(t)는 학생이 식으로 도출하므로 파형 figure 불필요,
    //   스위치가 있지만 t<0/t>0 **상태쌍 figure를 만들지 않는다** → state_before/after 요구 면제(1-6 규칙).
    const isSwRlDualShort = analysis?.circuitType?.type === "switched_rl_dual_short";
    // two_source_rl_superposition: (가)(나)(다) 3-figure. i(t)·v_C(t)는 식으로 도출하므로 파형 figure 불필요,
    //   테브난 등가 변환이 절차의 핵심이라 등가·multi는 켜 둔다.
    const isTwoSrcSuper = analysis?.circuitType?.type === "two_source_rl_superposition";
    // ac_dc_source_superposition_vc: 단일 회로 figure, 정상상태 — 파형·상태·등가·multi 모두 면제.
    const isAcDcVc = analysis?.circuitType?.type === "ac_dc_source_superposition_vc";
    // rlc_antiresonance_ladder: 단일 회로 figure, 정상상태 — 파형·상태·등가·multi 모두 면제.
    const isRlcAnti = analysis?.circuitType?.type === "rlc_antiresonance_ladder";
    // jk_two_phase_clock: (가)회로 + (나)파형 2-figure. 파형은 제공하되 Y는 학생이 도시 → 파형 유지·multi 유지,
    //   스위치 상태쌍은 없으므로 state_before/after 면제.
    const isJkTwoPhase = analysis?.circuitType?.type === "jk_two_phase_clock";
    // max_power_two_source_ratio: (가)(나) 2-figure, 페이저 정상상태 — 파형·상태 면제, 등가·multi 유지.
    const isMaxP2 = analysis?.circuitType?.type === "max_power_two_source_ratio";
    // number_repr_fill_blank: ★그림 없음★ — 파형·상태·등가·multi 모두 면제.
    // ff_reachable_states: (가)회로 + (나)파형 2-figure. 파형은 학생이 도시 → 파형·multi 유지, 상태쌍·등가 면제.
    const isFfReach = analysis?.circuitType?.type === "ff_reachable_states";
    // ff_feedback_z_waveform: (가)회로 + (나)파형. 파형 유지·multi 유지, 상태쌍·등가 면제.
    const isFfFbZ = analysis?.circuitType?.type === "ff_feedback_z_waveform";
    // r2r_ladder_dac: 단일 회로 figure — 파형·상태·등가·multi 모두 면제.
    const isR2r = analysis?.circuitType?.type === "r2r_ladder_dac";
    // jfet_depletion_fill_blank: 단일 개념 도식 figure — 파형·상태·등가·multi 모두 면제.
    const isJfetFb = analysis?.circuitType?.type === "jfet_depletion_fill_blank";
    const isNumRepr = analysis?.circuitType?.type === "number_repr_fill_blank";
    // maxwell_concept_fill_blank: ★그림 없음★ — 파형·상태·등가·multi 모두 면제.
    const isMaxwellFb = analysis?.circuitType?.type === "maxwell_concept_fill_blank";
    // bjt_early_effect_fill_blank: (가)단면도 + (나)특성곡선 2-figure. 파형·상태·등가는 없고 multi만 유지.
    const isBjtEarlyFb = analysis?.circuitType?.type === "bjt_early_effect_fill_blank";
    // logic_condition_sop: 동작 조건→최소 SOP (임용 25번). ★그림 없음★ — 파형·상태·등가·multi 모두 면제.
    const isLogicConditionSop = analysis?.circuitType?.type === "logic_condition_sop";
    // jk_excitation_sop_pos: (가) 여기표 + (나) JK-FF 2개 회로 2-figure. 상태 전이는 있으나 스위치
    //   상태쌍(state_before/after) figure는 없고 파형도 없다 → 그 둘만 off, multi 유지.
    const isJkExcitation = analysis?.circuitType?.type === "jk_excitation_sop_pos";
    // rlc_resonance_bandwidth: 페이저 정상상태 단일 회로 figure — 파형·등가·상태·multi 모두 면제.
    const isRlcResonanceBandwidth = analysis?.circuitType?.type === "rlc_resonance_bandwidth";
    // opamp_two_stage: 단일 회로 figure DC 해석 — 파형·상태·multi 면제.
    const isOpampTwoStage = analysis?.circuitType?.type === "opamp_two_stage";
    // function_generator: 단일 회로 figure(비교기+적분기) 수치 유도 — 파형·상태·등가·multi 면제
    //   (구형파·삼각파 진폭·주파수는 학생이 수치로 도출, 파형 figure 불필요).
    const isFunctionGenerator = analysis?.circuitType?.type === "function_generator";
    // opamp_three_stage_sum: 단일 회로 figure DC 해석 (3-OPAMP) — 파형·상태·multi 면제.
    const isOpampThreeStageSum = analysis?.circuitType?.type === "opamp_three_stage_sum";
    // opamp_finite_gain_block: (가)회로 + (나)블록도 2-figure, 정상상태(DC) — 파형·상태·등가 면제, multi 유지.
    const isOpampFiniteGain = analysis?.circuitType?.type === "opamp_finite_gain_block";
    // opamp_finite_gain_offset: 단일 회로 figure, DC/정상상태 (유한 이득 + 출력 오프셋 V_B) — 파형·상태·등가·multi 면제.
    const isOpampFiniteGainOffset = analysis?.circuitType?.type === "opamp_finite_gain_offset";
    // opamp_loop_gain_stability: (가)원회로 + (나)루프절단 2-figure — 파형·상태 면제, 등가/multi 유지.
    const isOpampLoopGain = analysis?.circuitType?.type === "opamp_loop_gain_stability";
    // opamp_positive_feedback: (가)회로 단일 figure (정귀환+SW step, 임용 6번) — 파형·상태·등가·multi 면제.
    const isOpampPositiveFb = analysis?.circuitType?.type === "opamp_positive_feedback";
    // ac_bridge_max_power: (가)브리지+(나)테브난등가 2-figure, 페이저 정상상태 — 파형·상태 면제(등가/multi 유지).
    const isAcBridge = analysis?.circuitType?.type === "ac_bridge_max_power";
    // ac_thevenin_ladder: (가)사다리+(나)테브난등가 2-figure, 페이저 정상상태 — 파형·상태 면제(등가/multi 유지).
    const isAcTheveninLadder = analysis?.circuitType?.type === "ac_thevenin_ladder";
    // ac_thevenin_dependent: (가)종속전원 회로+(나)테브난등가 2-figure, 페이저 정상상태 (임용 6번 회로이론).
    //   ★ stale analysis(캐시된 circuitType) 대비 — 감지 안전망 결과도 함께 인정한다.
    const isAcTheveninDependent =
      analysis?.circuitType?.type === "ac_thevenin_dependent" ||
      (subjectKey === "circuit_theory" && detectAcTheveninDependent(analysis));
    // dc_thevenin_2src: (가)2전압원 병렬 + (나)테브난등가 2-figure, 정상상태 DC — 파형·상태 면제(등가/multi 유지).
    const isDcThevenin2src = analysis?.circuitType?.type === "dc_thevenin_2src";
    // dc_wheatstone_balance: 단일 회로 figure, DC 정상상태(평형 조건 R_x·개방 V_o) — 파형·상태·등가·multi 면제.
    const isDcWheatstone = analysis?.circuitType?.type === "dc_wheatstone_balance";
    // ac_superposition_source_design: 단일 회로 figure, 페이저 정상상태(중첩 3단계) — 파형·상태·등가·multi 면제.
    const isAcSupSourceDesign = analysis?.circuitType?.type === "ac_superposition_source_design";
    // ac_power_factor: 단일 회로 figure, 페이저 정상상태 — 파형·상태·등가·multi 면제.
    const isAcPowerFactor = analysis?.circuitType?.type === "ac_power_factor";
    // ac_admittance_resonance: 단일 회로 figure, 페이저 정상상태(Y_eq/Z_eq·공진·I_M) — 파형·상태·등가·multi 면제.
    const isAcAdmittanceResonance = analysis?.circuitType?.type === "ac_admittance_resonance";
    // ac_vccs_phasor: 단일 회로 figure, 페이저 정상상태(V_c→I_R→i_R(t)) — i_R(t)는 학생이 도출하므로
    //   waveform figure 불필요. 파형·상태·등가·multi 모두 면제.
    const isAcVccsPhasor = analysis?.circuitType?.type === "ac_vccs_phasor";
    // switched_rc_dc_transient: 단일 회로 figure. v_o(t)는 학생 도출 → 파형·상태·multi 면제.
    const isSwitchedRcDc = analysis?.circuitType?.type === "switched_rc_dc_transient";
    // dff_state_design: (가)상태도+(나)상태표+(다)구현회로 3-figure. 자율 순환(상태 천이는
    //  있으나 스위치 t<0/t>0 상태쌍 figure는 아님)·파형 없음 → hasStateTransition·waveform off, multi 유지.
    const isDffStateDesign = analysis?.circuitType?.type === "dff_state_design";
    // tff_state_design_input(임용 12번): 상태도·상태표·카르노맵·회로 4종 figure — 파형·상태쌍·등가 면제, multi 유지.
    const isTffStateDesignInput =
      analysis?.circuitType?.type === "tff_state_design_input" || detectTffStateDesignInput(analysis);
    // dff_mux_sequential: (가)상태도+(나)FF+MUX 구현회로+(다)MUX 진리표 3-figure. 자율 순환 —
    //  상태 천이는 있으나 스위치 상태쌍 아님·파형 없음(Q_A 주파수는 계산) → state·waveform off, multi 유지.
    const isDffMuxSequential = analysis?.circuitType?.type === "dff_mux_sequential";
    // jfet_voltage_bias: 단일 회로 figure의 순수 DC 바이어스 — 파형·상태·등가·multi 모두 면제.
    //   (안 해두면 Vision이 hasWaveformEvolution=true를 주는 회차에 waveform이 required로 붙어
    //    missing_figure_variant가 뜬다 — 다른 전자 archetype과 동일 처리.)
    const isJfetBias = analysis?.circuitType?.type === "jfet_voltage_bias";
    // opamp_rc_t_oscillator: (가)+(나) 2-figure. 파형·상태·등가 없음 → 그 셋만 off, multi 유지.
    const isOpampRcTOsc = analysis?.circuitType?.type === "opamp_rc_t_oscillator";
    // ac_rl_average_power: 페이저 정상상태 단일 회로 figure — 파형·상태·등가·multi 모두 면제.
    const isAcRlAvgPower = analysis?.circuitType?.type === "ac_rl_average_power";
    // tff3_autonomous_counter: (가)상태도+(나)상태표+(다)T-FF 3개 회로 3-figure (임용 11번).
    //  자율 카운터라 상태 천이는 있으나 스위치 t<0/t>0 상태쌍 figure가 아니고 파형도 없다
    //  → state·waveform off, multi 유지. (안 해두면 Vision이 hasWaveformEvolution=true로 주는 회차에
    //    roleTriggers가 waveform을 required로 붙여 missing_figure_variant가 뜬다.)
    const isTff3AutonomousCounter = analysis?.circuitType?.type === "tff3_autonomous_counter";
    const isSwStatePair =
      rawSemantic.hasWaveformEvolution &&
      !hasCapOrIndInCircuit &&
      Boolean(analysis?.topologySignature?.features?.hasSwitch);
    // ac_superposition은 phasor 정상상태 해석이라 waveform figure 불필요 → hasWaveformEvolution=false 강제
    // bjt_characteristic_curve는 회로/파형 없는 graph 해석 — 모든 multi-figure 의무 면제
    // rlc_resonance_max_power는 phasor 정상상태 — waveform 면제
    const expectedSemantic: SemanticStructure = isCharacteristicCurve
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, requiresMultiFigure: false }
      : isZenerBjtRegulator
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, requiresMultiFigure: false }
      : isOpampSeriesRegulator
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isActiveLowpassFilter
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isOpampAnalogSummer
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isLogicConditionSop
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isScrTurnOn
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isReactiveViIntegral
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isAsyncPresetCounter
      ? { ...rawSemantic, hasStateTransition: false, hasWaveformEvolution: true, requiresMultiFigure: true }
      : isR2r || isJfetFb
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isFfReach || isFfFbZ
      ? { ...rawSemantic, hasStateTransition: false, hasEquivalentTransformation: false, hasWaveformEvolution: true, requiresMultiFigure: true }
      : isMaxwellFb || isNumRepr
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isBjtEarlyFb
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isMaxP2
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: true, requiresMultiFigure: true }
      : isJkTwoPhase
      ? { ...rawSemantic, hasStateTransition: false, hasWaveformEvolution: true, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isRlcAnti
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isAcDcVc
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isTwoSrcSuper
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: true, requiresMultiFigure: true }
      : isSwRlDualShort
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isJkSyncCounter || isDffPresetClear
      ? { ...rawSemantic, hasStateTransition: false, hasWaveformEvolution: true, requiresMultiFigure: true }
      : isRlcResonanceBandwidth
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isOpampTwoStage || isFunctionGenerator
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isOpampThreeStageSum
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isOpampFiniteGain
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isOpampLoopGain
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: true, requiresMultiFigure: true }
      : isOpampFiniteGainOffset || isOpampPositiveFb || isJfetBias
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isDffNandMux
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isAcTwoSrcMesh || isAcNullSource
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isTdgMaxPower
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: true, requiresMultiFigure: true }
      : isOpampAvgSup
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isOscPhaseL
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isAcDeltaWyeBridge
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: true, requiresMultiFigure: true }
      : isAcBridge
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: true, requiresMultiFigure: true }
      : isAcTheveninLadder || isAcTheveninDependent
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: true, requiresMultiFigure: true }
      : isDiodeClamper
      ? { ...rawSemantic, hasWaveformEvolution: true, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isJkMealyStateDesign
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: true, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isBjtTheveninBias
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: true, requiresMultiFigure: true }
      : isBjtSwitchLogic
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isComparatorDiodeOr
      ? { ...rawSemantic, hasWaveformEvolution: true, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isAcThevDesignAb || isZenerShunt || isSwitchedRlcSourceFree || isRlcStateEquation || isSwitchedRlcDualSwitch || isSwitchedCapShortRl || isOpampTwoStageRx || isDcTwoSourceLadder || isAcTheveninTwoBox || isOpampSummerTFeedback
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isDcThevenin2src
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: true, requiresMultiFigure: true }
      : isJkExcitation
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isDcWheatstone || isAcSupSourceDesign
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isAcPowerFactor || isAcAdmittanceResonance || isAcVccsPhasor
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isSwitchedRcDc
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isAcRlAvgPower
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: false }
      : isOpampRcTOsc
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isTffStateDesignInput
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isDffStateDesign || isDffMuxSequential || isTff3AutonomousCounter
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, hasEquivalentTransformation: false, requiresMultiFigure: true }
      : isAcDcSuperposition
        ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false }
        : isRlcResonanceMaxPower
          ? { ...rawSemantic, hasWaveformEvolution: false }
          : isUniversalAc
            ? { ...rawSemantic, hasWaveformEvolution: false }
            : isSwitchedRlDualSource
              ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, requiresMultiFigure: false }
            : isSwitchedRlDep || isSwitchedRlDepICase
              ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false }
              // ★ ac_superposition·ac_parallel_branches는 페이저 정상상태 단일 회로 figure다 —
              //   스위치 상태쌍(state_before/after)이 존재하지 않는다. Vision이 topicKey를
              //   switching_circuit으로 오판하면 roleTriggers가 상태쌍을 요구해
              //   missing_figure_variant 2건이 뜬다(실측 신고) → hasStateTransition도 false로.
              : isAcSuperposition
                ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false }
              : isSwStatePair || (rawSemantic.hasWaveformEvolution && isSwitchedRlc)
                ? { ...rawSemantic, hasWaveformEvolution: false }
                : rawSemantic;
    if (expectedSemantic !== rawSemantic) {
      log.info("semantic_normalized", {
        reason: isCharacteristicCurve
          ? "bjt_characteristic_curve (개념·도식 해석형) → all multi-figure flags off"
          : isAcDcSuperposition
            ? "universal_ac DC+AC 중첩 (스위치는 전원 선택용) → waveform·state transition 모두 false"
            : isUniversalAc
              ? "universal_ac (phasor 정상상태 query) → hasWaveformEvolution=false"
              : isAcSuperposition
                ? "ac_superposition (phasor 정상상태) → hasWaveformEvolution=false"
                : isSwitchedRlc
                  ? "switched_rlc_* (v_C(t)는 학생 도출 정답) → hasWaveformEvolution=false"
                  : "SW state pair without C/L → hasWaveformEvolution=false",
      });
    }

    // ★ DC+AC 중첩 모드는 topicKey가 switching_circuit이어도 state pair figure를 요구하지 않는다.
    //   (roleTriggers는 switching_circuit topic을 무조건 state 문제로 보므로, ruleSet 결정에서만
    //    topicKey를 비움 — 생성 pipeline·validator family check에는 expectedTopicKey 그대로 사용.)
    //   switched_rl + 종속전원(임용7)도 스위치는 전원 선택용 — state_before/after figure 요구 면제.
    const ruleTopicKey =
      (isAcDcSuperposition || isSwitchedRlDep) && expectedTopicKey === "switching_circuit"
        ? undefined
        : expectedTopicKey;
    // ★ text는 넘기지 않는다 — 넘기면 roleTriggers의 **모든** 텍스트 트리거(스위치→state figure 등)가
    //   새로 켜져 기존 archetype들이 무더기로 missing_figure_variant를 맞는다(실측 회귀).
    //   소자 개념형 면제만 필요하므로 아래에서 좁게 덮어쓴다.
    const baseRuleSet = resolveRules({
      subject: subjectKey,
      topicKey: ruleTopicKey,
      semantic: expectedSemantic,
      circuitType: analysis?.circuitType?.type,
      circuitTypeParams: analysis?.circuitType?.params,
    });
    // 소자 종류 식별 개념형(설명→명칭)은 회로 문제가 아니다 — 회로 figure role 요구 해제.
    //   (생성기도 figureVariants:[]로 만들므로, 안 풀면 검증만 회로 figure를 요구해 어긋난다.)
    // ★ 그림이 없는 유형은 회로 figure role 요구를 해제한다(생성기도 figureVariants:[]로 만든다).
    //   · 소자 종류 식별 개념형(설명→명칭)
    //   · 주기 신호 직류값·실효값(임용 36번) — 원본이 수식 하나뿐이라 회로가 없다.
    const figurelessText = isConceptNamingAnalysis(analysis) || detectPeriodicSignalDcRms(analysis);
    const ruleSet = figurelessText
      ? { ...baseRuleSet, requiredFigureRoles: [] }
      : baseRuleSet;

    // ★ Circuit-type 기반 dispatch — 결정론 파이프라인을 가진 type은 그쪽으로.
    // 현 phase: thevenin, norton. 나머지는 기존 free/strict 경로.
    let circuitType = analysis?.circuitType?.type;
    // ★ Step 5 — Objective/tags Pipeline Router (2026-06-01).
    //   ① opamp 발진기·전달함수 override(기존 동작) + ② 분류기 미확정 시 objective·motif tags로
    //   pipeline 추론(universal_ac/dc는 topologySignature 필수 가드). 확정된 circuitType은 신뢰·유지.
    const analysisTags = (analysis as { tags?: string[] } | null | undefined)?.tags ?? [];
    const analysisObjective = (analysis as { learningObjective?: Record<string, boolean> } | null | undefined)?.learningObjective;
    const routed = routePipeline({
      circuitType,
      tags: analysisTags,
      objective: analysisObjective,
      subjectKey,
      hasTopologySignature: Boolean(analysis?.topologySignature),
    });
    if (routed.circuitType !== circuitType) {
      log.info("router_override", { from: circuitType, to: routed.circuitType, reason: routed.reason });
      circuitType = routed.circuitType as typeof circuitType;
    }

    // ★ electronics 전용 archetype subject 보정 — ★DIGITAL/MIXED coercion보다 먼저★.
    //   0-PRE(subject 무관)로 분류된 opamp_analog_summer 등은 subject가 digital_logic·mixed_signal이어도
    //   electronics로 보정해야 아래 digital/mixed coercion에 안 걸린다(안 그러면 universal_digital·
    //   counter_dac_comparator로 강제돼 엉뚱한 유형 생성).
    if (circuitType === "opamp_analog_summer" || circuitType === "opamp_series_regulator" ||
        circuitType === "active_lowpass_filter" || circuitType === "opamp_finite_gain_offset" ||
        circuitType === "opamp_loop_gain_stability" || circuitType === "jfet_voltage_bias" ||
        circuitType === "opamp_rc_t_oscillator") {
      subjectKey = "electronics";
    }

    // ★ subject-first 가드 — 모든 dispatch 분기는 circuitType + subjectKey 둘 다 일치를 요구한다.
    //   디지털 문제(조합논리·진리표 등)를 컴포넌트 인벤토리 추출이 R 다발로 오인해 회로이론
    //   circuitType(dc_nodal 등)으로 분류하면, subjectKey=digital_logic과 짝이 맞는 분기가 하나도
    //   없어 제네릭 GPT fallback으로 떨어진다(아날로그 repair 루프 → 품질 저하·family 불일치).
    //   사용자가 고른 subject를 신뢰해, digital_logic인데 circuitType이 디지털 계열이 아니면
    //   범용 디지털 파이프라인(universal_digital)으로 보정한다.
    const DIGITAL_CIRCUIT_TYPES = new Set([
      "universal_digital", "sequential_dff_generic", "kmap_sop", "kmap_pos",
      "flipflop_mixed_app", "tff_state_table_blank", "tff3_autonomous_counter", "ff_with_waveform",
      "flipflop_counter", "jk_sync_counter", "combinational_gate", "sequence_detector", "fsm",
      "sr_ff_mux_sequential", "dff_mux_sequential", "waveform_analysis", "mux_implementation",
      "tff_state_design_input", "dff_nand_mux_pair",
      "async_preset_ripple_counter", "dff_state_design", "logic_condition_sop", "jk_excitation_sop_pos", "mod_n_counter_reset", "number_representation", "demux_waveform",
      // ★ BJT 스위치 → 논리게이트(임용 2번)는 회로가 아날로그지만 요구가 디지털이라 과목이 흔들린다.
      //   digital_logic으로 선택돼도 universal_digital로 덮이지 않도록 살려 둔다.
      "bjt_switch_logic_gate", "jk_mealy_state_design",
      // 임용 27번 — D-FF + 비동기 PR·CLR + A·B 조합논리 → 구간별 Q 파형.
      "dff_preset_clear_regions",
      // 임용 30번 — JK + 2상 클럭발생기 + EX-OR 출력.
      "jk_two_phase_clock",
      // 임용 27번 — 데이터 표현·산술 연산 빈칸(그림 없음).
      "number_repr_fill_blank",
      // 임용 24번 — D+T FF 동기식 순서논리 파형 도시.
      "ff_reachable_states",
      // 임용 26번 — 되먹임 + 2단 FF → Z 파형.
      "ff_feedback_z_waveform",
    ]);
    if (subjectKey === "digital_logic" && (!circuitType || !DIGITAL_CIRCUIT_TYPES.has(circuitType))) {
      routingTrace.coercions.push("digital_subject_circuittype"), log.warn("digital_subject_circuittype_coerced", { from: circuitType, to: "universal_digital" });
      circuitType = "universal_digital" as typeof circuitType;
    }

    // ★ subject-first 가드 (mixed_signal) — FF + DAC + OPAMP 복합형(임용8 JK카운터·임용10 D시프트레지스터)이
    //   Vision 비결정성으로 sequential_dff_generic(디지털) 등으로 분류되면 mixed_signal 분기와 안 맞아
    //   제네릭 fallback으로 추락한다. mixed_signal인데 circuitType이 mixed_signal 계열이 아니면
    //   counter_dac_comparator로 보정 (파이프라인이 D시프트/JK카운터를 구조 도출로 분기).
    // ★ ac_power_factor(역률, 임용 9번)는 circuit_theory 전용 archetype — subject 오선택(mixed_signal 등)
    //   이어도 강한 "역률" 신호로 분류됐으면 subject를 circuit_theory로 보정 (mixed_signal coercion·dispatch 정상화).
    if (circuitType === "ac_power_factor") subjectKey = "circuit_theory";
    // ac_rl_average_power(임용 8번)는 circuit_theory 전용 — 0-PRE(subject 무관) 분류 대비 보정.
    if (circuitType === "ac_rl_average_power") subjectKey = "circuit_theory";
    if (circuitType === "ac_admittance_resonance") subjectKey = "circuit_theory";
    if (circuitType === "ac_vccs_phasor") subjectKey = "circuit_theory";
    if (circuitType === "inductor_vi_integral") subjectKey = "circuit_theory";
    // opamp_series_regulator(임용 30번)는 electronics 전용 archetype — subject 오선택이어도 강한
    //   OPAMP+제너+트랜지스터 신호로 분류됐으면 electronics로 보정(dispatch 정상화).
    if (circuitType === "opamp_series_regulator") subjectKey = "electronics";
    // active_lowpass_filter(임용 31번)도 electronics 전용 — OPAMP+C+필터 신호로 분류됐으면 electronics 보정.
    if (circuitType === "active_lowpass_filter") subjectKey = "electronics";
    if (circuitType === "opamp_analog_summer") subjectKey = "electronics";
    // opamp_finite_gain_offset(임용 9번 전자회로)도 electronics 전용 — 0-PRE(subject 무관) 분류 대비 보정.
    if (circuitType === "opamp_finite_gain_offset") subjectKey = "electronics";
    // opamp_loop_gain_stability(임용 12번 전자회로)도 electronics 전용 — 0-PRE(subject 무관) 분류 대비 보정.
    if (circuitType === "opamp_loop_gain_stability") subjectKey = "electronics";
    // jfet_voltage_bias(임용 2번)도 electronics 전용 — 0-PRE(subject 무관) 분류 대비 보정.
    if (circuitType === "jfet_voltage_bias") subjectKey = "electronics";
    // opamp_rc_t_oscillator(임용 9번 전자)도 electronics 전용 — 0-PRE(subject 무관) 분류 대비 보정.
    if (circuitType === "opamp_rc_t_oscillator") subjectKey = "electronics";
    // ★ counter_dac_comparator(임용 8번)는 복합형 전용 — 과목을 다른 걸로 골라 분류돼도 여기서 보정.
    //   (분류는 PRE-SUBJECT라 과목 무관하게 잡히지만, ruleSet·dispatch는 subject를 보므로 맞춰준다.)
    if (circuitType === "counter_dac_comparator") subjectKey = "mixed_signal";
    // ★ mosfet_cascode_mirror(임용 10번)는 electronics 전용 — 과목 오선택·회로이론 오분류 대비 보정.
    if (circuitType === "mosfet_cascode_mirror") subjectKey = "electronics";
    // ★ bjt_switch_logic_gate(임용 2번)는 과목 무관 0-PRE로 잡힌다 — ruleSet·dispatch가 흔들리지 않도록
    //   electronics로 고정한다(디지털 과목 coercion 목록에도 넣어 두었다).
    if (circuitType === "bjt_switch_logic_gate" && subjectKey !== "digital_logic") subjectKey = "electronics";
    // ★ comparator_diode_or(임용 3번)도 과목 무관 0-PRE로 잡힌다 — 전자회로로 고정한다.
    if (circuitType === "comparator_diode_or") subjectKey = "electronics";
    const MIXED_SIGNAL_CIRCUIT_TYPES = new Set([
      "counter_dac_comparator", "adc_sample_hold", "logic_opamp_hybrid", "flash_adc_2bit",
    ]);
    if (subjectKey === "mixed_signal" && (!circuitType || !MIXED_SIGNAL_CIRCUIT_TYPES.has(circuitType))) {
      routingTrace.coercions.push("mixed_signal_circuittype"), log.warn("mixed_signal_circuittype_coerced", { from: circuitType, to: "counter_dac_comparator" });
      circuitType = "counter_dac_comparator" as typeof circuitType;
    }

    let problems: GeneratedProblem[];
    // ★ GPT생성유형(gpt_generated) — 원본과 같은 주제만 유지하고 구조는 자유. subject 무관하게
    //   모든 회로 dispatch/결정론 archetype 체인을 우회하고 GPT가 텍스트 문제를 자유 생성한다.
    //   (구조 보존을 포기하므로 결정론 렌더러 사용 불가 → figure 없이 본문 텍스트로만 출제.)
    // ★ 0-PRE (circuitType 무관) — 소자값이 기호 파라미터(a·2a)로 주어지고 "전력이 최대가 되는
    //   a"를 묻는 형식. 이 형식은 supernode·mesh·thevenin 어느 circuitType으로도 분류될 수 있어
    //   특정 분기 안에 두면 샌다(실측: 임용 6번이 dc_supernode로 가서 종속원·파라미터·최대화가
    //   전부 소실됨). 파라미터가 실제로 감지될 때만 발화하므로 일반 회로는 영향받지 않는다.
    // ★ 0-PRE — 제너 클리퍼 + 적분기(임용 2번). 범용 OPAMP cascade가 가져가면 제너·적분기를
    //   모두 잃는다(실측). inventory 구조 지문(OPAMP2+D2+C1)으로 판별한다.
    const zenerClipProblems =
      mode !== "gpt_generated" && detectZenerClipperIntegrator(analysis)
        ? await runZenerClipperIntegratorPipeline({ mode: mode as GenerationMode, count: n })
        : [];
    // ★ 0-PRE — 노튼 등가 + 파라미터 역산(임용 5번). 독립 전원만 있는 유형으로, Vision이
    //   "종속 전원"으로 잘못 요약해도 본문 서술(노튼 등가 + 기호 a + 부하 전류)로 잡는다.
    const nortonProblems =
      mode !== "gpt_generated" && detectNortonParamInverse(analysis)
        ? await runNortonParamInversePipeline({ mode: mode as GenerationMode, count: n })
        : [];
    // ★ 0-PRE(circuitType 무관) — 슈퍼노드 + 종속 전원 + 파라미터 최대 전력(임용 6번) 전용.
    //   토폴로지를 코드가 알고 있어 Vision의 연결 인식에 의존하지 않는다. 아래 universal
    //   파라미터 경로보다 **먼저** 둔다(그쪽은 연결 추출이 정확해야만 성립).
    const supernodeDepProblems =
      mode !== "gpt_generated" && detectSupernodeDepMaxPower(analysis)
        ? await runSupernodeDepMaxPowerPipeline({ mode: mode as GenerationMode, count: n })
        : [];
    //   식 복원·극대 탐색이 실패하면 빈 배열 → 기존 체인으로 그대로 흘려보낸다(억지 생성 금지).
    const paramMaxProblems =
      mode !== "gpt_generated" && detectParamMaxPower(analysis)
        ? await runParamMaxPowerPipeline({ analysis: analysis ?? null, mode: mode as GenerationMode, count: n })
        : [];
    if (zenerClipProblems.length > 0) {
      log.info("dispatch", { route: "zener_clipper_integrator_pipeline", count: n, mode });
      problems = zenerClipProblems;
      if (problems[0]?.topicKey) expectedTopicKey = problems[0].topicKey;
    } else     if (nortonProblems.length > 0) {
      log.info("dispatch", { route: "norton_param_inverse_pipeline", count: n, mode });
      problems = nortonProblems;
      // ★ 전용 archetype이 유형의 authority다 — analyze가 이 원본을 "종속 전원"으로 잘못
      //   분류해도(실측) family 검증이 거짓 mismatch를 내지 않도록 기준을 생성물에 맞춘다.
      if (problems[0]?.topicKey) expectedTopicKey = problems[0].topicKey;
    } else     if (supernodeDepProblems.length > 0) {
      log.info("dispatch", { route: "supernode_dep_max_power_pipeline", count: n, mode });
      problems = supernodeDepProblems;
      // ★ 위와 같은 이유 — 전용 archetype이 유형의 authority.
      if (problems[0]?.topicKey) expectedTopicKey = problems[0].topicKey;
    } else     if (paramMaxProblems.length > 0) {
      log.info("dispatch", { route: "param_max_power_pipeline", count: n, mode });
      problems = paramMaxProblems;
    } else if (mode !== "gpt_generated" && !isParamMaxPowerForm(analysis) && isSymbolicParamCircuitForm(analysis)) {
      // ★ 기호 파라미터를 구하는 문제인데 그 형식을 재현할 전용 경로가 아직 없다.
      //   범용(universal_dc·topology_driven)으로 넘기면 **전원이 통째로 사라진 다른 회로**를
      //   만들어낸다(실측: 임용 5번 노튼 등가 — 발문은 "전류원을 개방"인데 생성 회로엔 전원이 없었다).
      //   구조·원리 유사성이 절대 규칙이므로, 다른 문제를 내느니 실패를 알린다.
      log.warn("symbolic_param_no_archetype", { topic: analysis?.topic });
      return NextResponse.json(
        {
          error:
            `유사문제를 만들지 못했습니다 — 원본과 다른 회로로 문제를 내지 않으려고 생성을 중단했습니다.\n` +
            `사유: 소자값이 기호(예: a[Ω])로 주어지고 그 값을 구하는 유형인데, 이 형식을 그대로 ` +
            `재현하는 전용 경로가 아직 없습니다. 범용 경로로 만들면 전원이 사라진 다른 회로가 됩니다.\n` +
            `이 유형에 대한 지원을 추가하는 중입니다.`,
        },
        { status: 422 },
      );
    } else if (mode !== "gpt_generated" && isParamMaxPowerForm(analysis)) {
      // ★ 형식은 이 유형이 맞는데 회로 복원에 실패했다. 기존 체인으로 넘기면 topology_driven 등이
      //   **원본과 무관한 회로를 새로 지어낸다**(실측 신고: 생판 다른 테브난 회로 생성).
      //   구조·원리 유사성이 이 프로젝트의 절대 규칙이므로, 다른 문제를 내느니 실패를 알린다.
      const reason =
        paramMaxPowerFailureReason(analysis) ??
        "소자는 모두 읽었으나 연결이 원본과 달라 전력의 최댓값이 성립하지 않습니다.";
      log.warn("param_max_power_unrecoverable", { reason });
      return NextResponse.json(
        {
          error:
            `유사문제를 만들지 못했습니다 — 원본과 다른 회로로 문제를 내지 않으려고 생성을 중단했습니다.\n` +
            `사유: ${reason}\n` +
            `이 유형(종속 전원 + 기호 파라미터)은 소자의 ‘연결’까지 정확해야 답이 성립하는데, ` +
            `현재 이미지 인식이 소자는 맞게 읽어도 연결을 원본대로 복원하지 못합니다. ` +
            `★재시도해도 같은 결과일 가능성이 높습니다★ — 연결 인식 개선 작업이 필요한 단계입니다.`,
        },
        { status: 422 },
      );
    } else if (mode === "gpt_generated") {
      log.info("dispatch", { route: "gpt_free_pipeline", subject: subjectKey, count: n, mode });
      problems = await runGptFreePipeline({
        analysis: analysis ?? null,
        subjectKey,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (detectPeriodicSignalDcRms(analysis)) {
      // ★ 주기 신호 수식 → 직류값·실효값 (임용 36번 회로이론) — **회로도 그림도 없는 수식 문항**.
      //   개념 명칭형·generic 회로 경로 **둘 다** 이 원본을 가로챘다(사용자 신고 2026-08-12):
      //   전자는 "원리의 이름을 쓰시오", 후자는 없는 R₁·R₂ 회로를 지어냈다. 그래서 회로 dispatch 체인
      //   전체는 물론 **개념 명칭형보다도 앞에서** 우회한다.
      log.info("dispatch", { route: "periodic_signal_dc_rms_pipeline", count: n, mode, circuitType });
      problems = await runPeriodicSignalDcRmsPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "maxwell_concept_fill_blank" || detectMaxwellConceptFillBlank(analysis)) {
      // ★ 임용 24번 — Maxwell 방정식 개념 빈칸(그림 없음).
      //   ★★ **개념 명칭형·전자기학 subject 분기보다 앞**에 두어야 한다 — 둘 다 회로 dispatch 체인을
      //   통째로 우회하므로 뒤에 두면 도달조차 못 한다(periodic_signal_dc_rms와 같은 이유).
      log.info("dispatch", { route: "maxwell_concept_fill_blank_pipeline", count: n, mode, circuitType });
      problems = await runMaxwellConceptFillBlankPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "bjt_early_effect_fill_blank" || detectBjtEarlyEffectFillBlank(analysis)) {
      // ★ 임용 27번 전자회로 — npn BJT Early 효과 개념 빈칸((가)단면도 + (나)특성곡선).
      //   ★★ **개념 명칭형보다 앞**에 두어야 한다 — 이 원본은 수치 given이 하나도 없는 개념 문항이라
      //   `isConceptNamingAnalysis`가 그대로 물어간다(실측: "㉠, ㉡에 해당하는 용어를 순서대로 쓰시오"가
      //   그림 없이 생성됐다). 개념 명칭형은 회로 dispatch 체인 전체를 우회하므로 뒤에 두면 도달조차 못 한다
      //   (maxwell_concept_fill_blank·periodic_signal_dc_rms와 같은 이유).
      log.info("dispatch", { route: "bjt_early_effect_fill_blank_pipeline", count: n, mode, circuitType });
      problems = await runBjtEarlyEffectFillBlankPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "jfet_depletion_fill_blank" || detectJfetDepletionFillBlank(analysis)) {
      // ★ 임용 28번 전자회로 — n채널 JFET 공핍층·핀치오프 개념 빈칸((가)~(라) 4패널 도식).
      //   ★★ **개념 명칭형보다 앞**에 둔다 — 수치 given이 없는 개념 문항이라 isConceptNamingAnalysis가
      //   그대로 물어가고, 그러면 회로 dispatch 체인 전체를 우회해 그림 없는 "용어를 쓰시오"가 나온다
      //   (bjt_early_effect_fill_blank에서 실측된 실패와 같은 이유).
      log.info("dispatch", { route: "jfet_depletion_fill_blank_pipeline", count: n, mode, circuitType });
      problems = await runJfetDepletionFillBlankPipeline({
        analysis: analysis ?? null, mode: mode as GenerationMode, count: n, topicKey: expectedTopicKey,
      });
    } else if (isConceptNamingAnalysis(analysis)) {
      // ★ 개념 명칭형(원리·법칙·소자의 이름을 쓰는 문항) — 회로 해석 문제가 아니다.
      //   ★★ classifier에서 unsupported로 보내는 것만으로는 부족하다(실측): 원본에 예시 회로
      //   그림이 딸려 있으면 Vision이 topologySignature·소자 12개를 뽑아내고, route가 그걸 보고
      //   topology_driven·universal_dc 같은 **결정론 회로 파이프라인**으로 보낸다. 그 파이프라인은
      //   GPT 프롬프트(개념형 지시문)를 아예 거치지 않으므로 "각 노드 전압을 구하시오" + 접지로만
      //   이어진 회로도가 그대로 생성됐다.
      //   → 전자기학·교육학과 동일하게 **subject·circuitType 무관하게 회로 dispatch 체인 전체를 우회**한다.
      log.info("dispatch", { route: "concept_naming_pipeline", count: n, mode, circuitType });
      problems = await runConceptNamingPipeline({
        analysis: analysis ?? null,
        subjectKey,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (subjectKey === "electromagnetics") {
    // ★ 전자기학 — 회로 아님(공식 레지스트리 기반 결정론 생성). subjectKey 게이팅으로
    //   회로 dispatch 체인 전체를 우회한다(circuitType·topology·analog/digital coercion 무관).
      log.info("dispatch", { route: "electromagnetics_pipeline", count: n, mode });
      problems = await runElectromagneticsPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
      // ★ EM family 검증 기준 재조정 — EM은 공식 레지스트리 분류기가 실제 유형(topicKey)을
      //   결정한다. analyze의 topicKey(예: electrostatics)와 분류기가 고른 항목(예: gauss_law)이
      //   다를 수 있는데(electrostatics↔gauss_law 키워드 중첩), 분류기가 authority이므로
      //   생성된 문제의 topicKey를 family 검증 기준으로 채택해 거짓 family_mismatch를 막는다.
      if (problems[0]?.topicKey) expectedTopicKey = problems[0].topicKey;
    } else if (detectR2rLadderDac(analysis)) {
      // ★ 임용 28번 — 4비트 R-2R 사다리형 D/A + 비반전 OPAMP → 출력전압.
      log.info("dispatch", { route: "r2r_ladder_dac_pipeline", count: n, mode });
      problems = await runR2rLadderDacPipeline({
        analysis: analysis ?? null, mode: mode as GenerationMode, count: n, topicKey: expectedTopicKey,
      });
    } else if (detectFfFeedbackZ(analysis)) {
      // ★ 임용 26번 — 되먹임 + 2단 D/T 플립플롭 + 비동기 CLR → 출력 Z 파형 도시.
      log.info("dispatch", { route: "ff_feedback_z_pipeline", count: n, mode });
      problems = await runFfFeedbackZPipeline({
        analysis: analysis ?? null, mode: mode as GenerationMode, count: n, topicKey: expectedTopicKey,
      });
    } else if (detectFfReachableStates(analysis)) {
      // ★ 임용 24번 — 동기식 순서논리회로의 Q_A·Q_B 파형 도시 (D+T 플립플롭).
      //   넓은 digital 분기(sequential_dff_generic·fsm)보다 앞에 둔다.
      log.info("dispatch", { route: "ff_reachable_states_pipeline", count: n, mode });
      problems = await runFfReachableStatesPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (detectWienBridgeDesign(analysis)) {
      // ★ 임용 30번 — Wien bridge **수치 설계형**(R₁·R₂·f₀). 기호형 WIEN_BRIDGE_OSCILLATOR archetype
      //   (β(s)·특성방정식으로 비 R₃/R₁=2만 구한다)은 이 원본의 요구를 재현하지 못한다.
      //   analog archetype dispatch **앞**에 둔다.
      log.info("dispatch", { route: "wien_bridge_design_pipeline", count: n, mode });
      problems = await runWienBridgeDesignPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (detectCSwitchFallThrough(analysis)) {
      // ★ 임용 33번 — switch fall-through + 배열 부분 초기화 출력 예측 (결정론 archetype).
      //   ★★ **generic c_language GPT 경로보다 앞**에 둔다 — 그 경로는 이 원본의 두 핵심을
      //   반복해서 잃었다(모든 case에 break / 장식용 fall-through / 0 구간 미순회 /
      //   심지어 switch 없는 배열 문제). 프롬프트·게이트로 안정화되지 않아 코드로 구조를 확정한다.
      log.info("dispatch", { route: "c_switch_fall_through_pipeline", count: n, mode });
      problems = await runCSwitchFallThroughPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (subjectKey === "c_language") {
      // ★ C언어 — 회로 아님(GPT 기반 코드 분석·출력 예측). 회로 dispatch 체인 전체 우회.
      log.info("dispatch", { route: "c_language_pipeline", count: n, mode });
      problems = await runCLanguagePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (subjectKey === "communications") {
      // ★ 통신 — 회로 아님(GPT 기반 신호·변조·정보이론 + 파형·스펙트럼 figure). 회로 dispatch 우회.
      log.info("dispatch", { route: "communications_pipeline", count: n, mode });
      problems = await runCommunicationsPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (subjectKey === "pedagogy") {
      // ★ 교육학(교직) — 회로 아님(GPT 기반 교육 이론·논술형, figure 없음). 회로 dispatch 우회.
      log.info("dispatch", { route: "pedagogy_pipeline", count: n, mode });
      problems = await runPedagogyPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (isAcTheveninTwoBox) {
      // ★ 점선 박스 2개(전압원망 a-b + 전류원망 c-d) 직렬 + R_L 최대평균전력 (임용 10번 회로이론).
      //   형제 `theveninMaxPower`(universal_ac params)는 두 전원이 **한 마디에서 병렬**인 구조라
      //   단자쌍이 둘인 이 원본을 재현하지 못한다 — 실측에서 그 경로가 가로채 회로가 변질됐고
      //   Z_th 계산까지 틀렸다. universal_ac dispatch보다 **앞**에 둔다(CLAUDE.md 1-5).
      log.info("dispatch", { route: "ac_thevenin_two_box_pipeline", count: n, mode });
      problems = await runAcTheveninTwoBoxPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "diode_clamper" || detectDiodeClamper(analysis)) {
      // ★ 다이오드 클램퍼 (임용 2번 전자회로) — **회로 dispatch 체인의 맨 앞**.
      //   generic 경로는 다이오드를 통째로 잃고(C·V·R만) 파형도 무의미해진다(실측 신고).
      //   ★ 앞자리에 두는 이유: semantic normalize는 같은 감지기로 hasWaveformEvolution=true를 켜는데,
      //     dispatch가 뒤에 있으면 **다른 분기가 먼저 잡아** 파형 figure 없이 생성 → missing_waveform이 뜬다
      //     (사용자 신고). 감지되면 무조건 이 경로가 이기도록 순서를 고정한다.
      log.info("dispatch", { route: "diode_clamper_pipeline", count: n, mode });
      problems = await runDiodeClamperPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "inductor_vi_integral" && subjectKey === "circuit_theory") {
      // ★ 이상 인덕터/커패시터 v-i 적분 (임용 3번) — 결정론 archetype.
      //   generic은 저항 추가·지수응답으로 변질(RL 스텝) → 파형 적분(1/L∫v, 1/C∫i)을 정확히 계산.
      //   exam_similar=인덕터(v→i), exam_variant=커패시터(i→v, 쌍대).
      log.info("dispatch", { route: "reactive_vi_integral_pipeline", count: n, mode });
      problems = await runReactiveViIntegralPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else {
    // ★ 전원변환 + 전압비(V_1:V_2:V_3 = a:b:c) → 미지 R_3 도출 (임용 7번) — 전용 결정론 archetype.
    //   generic perturbation은 전압비 전제(R_1:R_2=a:b)를 랜덤화로 깨뜨리고, Vision이 (가)·(나)
    //   두 회로를 한 netlist로 병합해 R 값이 "R1"/"R2"/"R3" 심볼로 남는다. 전압비를 만족하도록
    //   값을 결정론 생성하는 전용 경로. universal_dc·topology_driven보다 먼저 라우팅.
    const stRatio =
      subjectKey === "circuit_theory" ? detectSourceTransformRatio(analysis) : null;
    if (stRatio) {
      log.info("dispatch", { route: "source_transform_ratio_pipeline", count: n, mode, ratio: stRatio.join(":") });
      problems = await runSourceTransformRatioPipeline({
        ratio: stRatio,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else {
    // ★ 스위치 RL + 종속전원(2i_A) 과도응답 (임용 2022 B-7) — 전용 archetype.
    //   종속전원(CCVS)·스위치 상태전이를 generic/topology-driven이 잃는 문제 회피 (topology_driven보다 우선).
    const invSrl = analysis?.componentInventory ?? [];
    const isSwitchedRlDependent =
      subjectKey === "circuit_theory" &&
      (circuitType === "switched_rl" || circuitType === "rl_step") &&
      invSrl.some((c) => ["CCVS", "CCCS", "VCVS", "VCCS"].includes(String(c.type))) &&
      invSrl.some((c) => c.type === "L") &&
      invSrl.some((c) => c.type === "SW");
    // ★ 교류 테브난 **소자 값 a·b 설계**(임용 7번)는 종속전원 테브난보다 **앞** — 실측에서
    //   detectAcTheveninDependent가 (테브난+최대전력+리액티브만 보고) 가로채 변형 모드가
    //   V_AB/I_AB/Z_AB 문제로 변질됐다. 이 유형은 종속전원이 없고 미지 소자가 a·b다.
    if (circuitType === "dff_nand_mux_pair" || detectDffNandMuxPair(analysis)) {
      // ★ D-FF 2개 + 3-NAND 입력망 + 점선부 AND/OR 도시 (임용 12번 디지털).
      //   generic `sequential_dff_generic`이 원본과 다른 회로를 만들고 점선부 답을 노출하던 실측 사고
      //   → 체인 최상단 + stale analysis 대비 감지 안전망.
      log.info("dispatch", { route: "dff_nand_mux_pair_pipeline", count: n, mode });
      problems = await runDffNandMuxPairPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_avg_superposition_r" || detectOpampAvgSuperposition(analysis)) {
      // ★ (+)단자 3입력 평균 + 2단 중첩 (임용 8번 전자회로) — generic OPAMP 경로가 (+)입력을
      //   반전 가산기로 뒤집던 실측 사고 → 체인 앞 + 감지 안전망.
      log.info("dispatch", { route: "opamp_avg_superposition_pipeline", count: n, mode });
      problems = await runOpampAvgSuperpositionPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "thevenin_dep_graph_max_power" || detectTheveninDepGraph(analysis)) {
      // ★ 종속전원 + V-I 그래프 + 최대전력 (임용 9번 회로이론) — generic 테브난 경로(GPT 구조 추출)가
      //   점선 박스·계기·i_x를 잃고 (나) 그래프까지 통째로 빠뜨리던 실측 사고 → 체인 앞 + 감지 안전망.
      log.info("dispatch", { route: "thevenin_dep_graph_max_power_pipeline", count: n, mode });
      problems = await runTheveninDepGraphMaxPowerPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_superposition_null_source" || detectAcSuperpositionNullSource(analysis)) {
      // ★ 2전원(V+I) 중첩 + V_L=0 조건으로 전류원 역산 (임용 3번 회로이론) — 전용 항목이 없어
      //   **universal_ac로 떨어져 정답이 "(query 없음)"** 이던 실측 사고(2026-08-05) → 체인 상단 + 감지 안전망.
      log.info("dispatch", { route: "ac_superposition_null_source_pipeline", count: n, mode });
      problems = await runAcSuperpositionNullSourcePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_two_source_mesh_power" || detectAcTwoSourceMeshPower(analysis)) {
      // ★ 2전원 RLC 메시 + 평균전력 (임용 5번 회로이론) — 형제 ac_rl_average_power(단일 전원)가
      //   가로채 **정답이 빈 문자열**인 문제가 나오던 실측 사고 → 체인 최상단 + 감지 안전망.
      log.info("dispatch", { route: "ac_two_source_mesh_power_pipeline", count: n, mode });
      problems = await runAcTwoSourceMeshPowerPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "oscilloscope_phase_l" || detectOscilloscopePhaseL(analysis)) {
      // ★ 오실로스코프 파형 판독 → 위상차 α → 미지 소자값 (임용 11번 회로이론).
      //   실측 사고: 전용 항목이 없어 universal_ac로 떨어져 **정답 "(query 없음)"** 인 빈 문제가 나왔다
      //   → 체인 최상단 + stale analysis 대비 감지 안전망.
      log.info("dispatch", { route: "oscilloscope_phase_l_pipeline", count: n, mode });
      problems = await runOscilloscopePhaseLPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_delta_wye_bridge" || detectAcDeltaWyeBridge(analysis)) {
      // ★ 교류 브리지 + Δ-Y 변환 → 등가 임피던스 Z_AB → 전류 크기 a (임용 2번 회로이론).
      //   실측 사고: 전용 항목이 없어 `ac_parallel_branches`(임용 5번)가 가로채 전혀 다른 문제가 나왔다
      //   → 체인 **최상단**에 두고, 프론트가 캐시한 stale circuitType 대비로 감지 안전망도 함께 건다.
      log.info("dispatch", { route: "ac_delta_wye_bridge_pipeline", count: n, mode });
      problems = await runAcDeltaWyeBridgePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (
      circuitType === "ac_thevenin_design_ab" ||
      (subjectKey === "circuit_theory" && detectAcTheveninDesignAb(analysis))
    ) {
      log.info("dispatch", { route: "ac_thevenin_design_ab_pipeline", count: n, mode });
      problems = await runAcTheveninDesignAbPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_thevenin_dependent" || (subjectKey === "circuit_theory" && detectAcTheveninDependent(analysis))) {
      // ★ 독립 전류원 + 종속전원 페이저 회로 → 테브난 등가(단락전류법) + 복소 켤레 최대전력 (임용 6번 회로이론).
      //   detectSwitchedRlDepI(직류 스위치 RL 종속전원)가 "종속전원 + L"만 보고 가로채던 실측 사고 →
      //   그 분기 **앞**에 두고, stale analysis 대비로 감지 안전망도 함께 건다.
      log.info("dispatch", { route: "ac_thevenin_dependent_pipeline", count: n, mode });
      problems = await runAcTheveninDependentPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (subjectKey === "circuit_theory" && detectTheveninDepVoltageProblem(analysis)) {
      // ★ 종속 **전압원**(k·v_x) + 테브난 등가(시험 전원 1A법) — 전용 결정론 archetype (임용 6번).
      //   전용 generator·renderer·smoke가 있는데 **dispatch 배선이 빠져 있어**(2026-07-29 실측)
      //   generic thevenin_dependent_generic이 종속원을 저항 기호로 그린 netlist를 냈다.
      log.info("dispatch", { route: "thevenin_dep_voltage_pipeline", count: n, mode });
      problems = await runTheveninDepVoltagePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (subjectKey === "circuit_theory" && detectSwitchedRlDepI(analysis)) {
      // ★ 스위치 RL + 종속 전류원(k·iₙ, CCCS) 과도응답 (임용 2024 전기 B-5) — 전용 archetype.
      //   종속 전류원이 type=I로 추출되거나 SW가 누락돼도 값·텍스트로 감지. generic rl_step 앞에 우선.
      log.info("dispatch", { route: "switched_rl_dep_i_pipeline", count: n, mode });
      problems = await runSwitchedRlDepIPipeline({
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else
    if (isSwitchedRlDependent) {
      log.info("dispatch", { route: "switched_rl_dependent_pipeline", count: n, mode });
      problems = await runSwitchedRlDependentPipeline({
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else
    // ★ 2전원 SPDT 스위치 RL 과도응답 (임용 3번 회로이론) — 종속전원 없는 전원-스위칭 케이스.
    //   generic rl_step(buildSimpleEnergizing)이 단일 전원·초기 0으로 변질시켜 스위치·2번째 전원을
    //   잃는 문제 회피. 기존 RL 과도 솔버 재사용(초기전류 i(0⁻)=V_A/R). topology_driven보다 우선.
    if (
      subjectKey === "circuit_theory" &&
      (circuitType === "switched_rl" || circuitType === "rl_step") &&
      detectSwitchedRlDualSource(analysis)
    ) {
      log.info("dispatch", { route: "switched_rl_source_switch_pipeline", count: n, mode });
      problems = await runSwitchedRlSourceSwitchPipeline({
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else
    // ★ 임용 8번 회로이론 — 스위치 2-state + 종속전류원(0.2V) + supermesh 전용 archetype.
    //   Vision이 이 회로(SW─R4─I_s 직렬 가지 + 종속전류원)를 신뢰성 있게 못 읽어(SW_top floating·
    //   1A 분리·mesh 4개 오생성) generic topology_driven으로도 재현 불가 → 사용자 정답으로 역검증한
    //   고정 토폴로지 + MNA solver. universal_dc·topology_driven 앞에 라우팅.
    if (subjectKey === "circuit_theory" && detectSupermeshSwitchedDependent(analysis)) {
      log.info("dispatch", { route: "supermesh_switched_dependent_pipeline", count: n, mode });
      problems = await runSupermeshSwitchedDependentPipeline({
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else
    // ★ Topology-driven fallback — 회로이론에서 archetype의 가정과 원본 topology가 어긋나는
    //   hybrid 케이스(예: supermesh + SW + 종속전원 동시)는 generic topology-driven 파이프라인으로.
    //   archetype hardcoded 생성기는 SW/종속전원을 못 다루므로 원본 구조를 잃음.
    if (
      subjectKey === "circuit_theory" &&
      analysis?.topologySignature &&
      shouldUseTopologyDriven(
        circuitType,
        augmentTopologyFeatures(analysis),
        analysis.topologySignature.branches?.length ?? 0,
        analysis.componentInventory?.length ?? 0,
      )
    ) {
      log.info("dispatch", {
        route: "topology_driven_pipeline",
        count: n,
        mode,
        reason: "archetype/topology mismatch (hybrid·branchCount·inventory 중 하나)",
        features: augmentTopologyFeatures(analysis),
        branchCount: analysis.topologySignature.branches?.length ?? 0,
        inventoryCount: analysis.componentInventory?.length ?? 0,
      });
      problems = await runTopologyDrivenPipeline({
        analysis,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (
      circuitType === "dc_two_source_ladder" ||
      (subjectKey === "circuit_theory" && detectDcTwoSourceLadder(analysis))
    ) {
      // ★ 전압원+전류원 DC 사다리 (임용 3번 회로이론) — universal_dc **앞**.
      //   universal_dc도 회로 자체는 정확히 재현하지만(연결 관계 동일 확인), generic 렌더러가
      //   "hub + 직렬 pendant leg"를 세로 체인으로 접어 그려 원본 사다리와 딴판이 된다(신고 2회).
      //   그림을 원본 배치로 고정하기 위해 전용 archetype으로 받는다.
      log.info("dispatch", { route: "dc_two_source_ladder_pipeline", count: n, mode });
      problems = await runDcTwoSourceLadderPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (
      circuitType === "universal_dc" &&
      subjectKey === "circuit_theory" &&
      analysis &&
      detectImyong10Archetype({
        analysis,
        inventoryCounts: countInventoryByType(analysis.componentInventory),
        extraText: [
          analysis.topic ?? "",
          analysis.interpretation ?? "",
          ...(analysis.relatedConcepts ?? []),
          ...((analysis.fillInTheBlanks ?? []).map((b) => b.sentence)),
        ],
      }) === "IMYONG_10_DC_NODAL"
    ) {
      // CLAUDE.md "Circuit Generation Architecture Principle" — archetype-specific dispatch
      // 정책: archetype 검출 시 universal_dc보다 먼저 라우팅, 고정-slot renderer 사용.
      log.info("dispatch", { route: "imyong_10_dc_nodal", count: n, mode });
      problems = generateImyong10DcNodal({
        analysis,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "universal_dc" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "universal_dc_pipeline", count: n, mode });
      if (!analysis?.topologySignature) {
        return NextResponse.json({ error: "universal_dc는 topologySignature 필수" }, { status: 400 });
      }
      problems = await runUniversalDcPipeline({
        analysis,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "inductor_ramp_slope") {
      log.info("dispatch", { route: "inductor_ramp_slope_pipeline", count: n, mode });
      problems = await runInductorRampSlopePipeline({ analysis: analysis ?? null, mode: mode as GenerationMode, count: n, topicKey: expectedTopicKey });
    } else if (circuitType === "switched_rc_dc_transient" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "switched_rc_dc_transient_pipeline", count: n, mode });
      problems = await runSwitchedRcDcTransientPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_bridge_max_power" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "ac_bridge_max_power_pipeline", count: n, mode });
      problems = await runAcBridgeMaxPowerPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_thevenin_ladder" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "ac_thevenin_ladder_pipeline", count: n, mode });
      problems = await runAcTheveninLadderPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "rlc_resonance_bandwidth" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "rlc_resonance_bandwidth_pipeline", count: n, mode });
      problems = await runRlcResonanceBandwidthPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "universal_ac" && subjectKey === "circuit_theory") {
      log.info("dispatch", {
        route: "universal_ac_pipeline",
        count: n,
        mode,
        acDcSuperposition: Boolean(analysis?.circuitType?.params?.acDcSuperposition),
      });
      // DC+AC 중첩·테브난 최대전력 모드는 결정론 archetype generator 사용 — topologySignature 불필요.
      if (
        !analysis?.topologySignature &&
        !analysis?.circuitType?.params?.acDcSuperposition &&
        !analysis?.circuitType?.params?.acDcSuperpositionRc &&
        !analysis?.circuitType?.params?.theveninMaxPower
      ) {
        return NextResponse.json({ error: "universal_ac는 topologySignature 필수" }, { status: 400 });
      }
      problems = await runUniversalAcPipeline({
        analysis,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "universal_ac_pwl") {
      // circuit_theory·electronics 모두에서 다이오드+SW+AC 형식 지원 (subject 선택 무관).
      log.info("dispatch", { route: "universal_ac_pwl_pipeline", count: n, mode, subject: subjectKey });
      problems = await runUniversalAcPwlPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "demux_waveform" && subjectKey === "digital_logic") {
      // 1→4 디멀티플렉서 + F₀~F₃ 출력 파형 (임용 8번) — 전용 결정론 archetype.
      log.info("dispatch", { route: "demux_waveform_pipeline", count: n, mode });
      problems = await runDemuxWaveformPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "number_representation" && subjectKey === "digital_logic") {
      // n비트 음수 표현 방식 판별 (유사) · 보수 뺄셈 (변형) — 전용 결정론 archetype (임용 4번).
      log.info("dispatch", { route: "number_representation_pipeline", count: n, mode });
      problems = await runNumberRepresentationPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "mod_n_counter_reset" && subjectKey === "digital_logic") {
      // T·D 혼합 mod-N 카운터 + 미사용 상태 + 리셋 게이트 (임용 9번) — 전용 결정론 archetype.
      log.info("dispatch", { route: "mod_n_counter_reset_pipeline", count: n, mode });
      problems = await runModNCounterResetPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_rl_average_power" && subjectKey === "circuit_theory") {
      // AC 전원 + 직렬 리액턴스 + 병렬 저항 평균전력 (임용 8번) — 전용 결정론 archetype.
      //   ★ generic universal_ac가 v(t) 단서를 빠뜨리고 내부 id를 노출하던 것 대체.
      log.info("dispatch", { route: "ac_rl_average_power_pipeline", count: n, mode });
      problems = await runAcRlAveragePowerPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_rc_t_oscillator" && subjectKey === "electronics") {
      // 반전 OPAMP + T형 RC망 → 전달특성 + 사인파 발진기 (임용 9번) — 전용 결정론 archetype.
      log.info("dispatch", { route: "opamp_rc_t_oscillator_pipeline", count: n, mode });
      problems = await runOpampRcTOscillatorPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "jfet_voltage_bias" && subjectKey === "electronics") {
      // JFET 전압(분압) 바이어스 (임용 2번) — 전용 결정론 archetype.
      //   ★ mosfet_bias(소스 접지 NMOS + 제곱법칙)와 모델이 다르다 — 실측 오매치 이력.
      log.info("dispatch", { route: "jfet_voltage_bias_pipeline", count: n, mode });
      problems = await runJfetVoltageBiasPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "tff3_autonomous_counter" && subjectKey === "digital_logic") {
      // T-FF 3개 자율 카운터 + 상태도 + T_B 최소 SOP → 2입력 게이트 2개 (임용 11번) — 전용 결정론 archetype.
      //   ★ tff_state_table_blank(임용 7번: T-FF 2개 + 외부 입력 C)와 구조가 다르다 — 조용한 오매치 이력.
      log.info("dispatch", { route: "tff3_autonomous_counter_pipeline", count: n, mode });
      problems = await runTff3AutonomousCounterPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "jk_excitation_sop_pos" && subjectKey === "digital_logic") {
      // JK-FF 2개 여기표 + 조합논리 J_A (SOP→POS) — 전용 결정론 archetype (2025 전기 A-8).
      log.info("dispatch", { route: "jk_excitation_sop_pos_pipeline", count: n, mode });
      problems = await runJkExcitationSopPosPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "logic_condition_sop" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "logic_condition_sop_pipeline", count: n, mode });
      problems = await runLogicConditionSopPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "universal_digital" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "universal_digital_pipeline", count: n, mode });
      problems = await runUniversalDigitalPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "sequential_dff_generic" && subjectKey === "digital_logic") {
      // 디지털 순서논리 D-FF — GPT 구조추출 + 상태 시뮬레이션 (예시 하드코딩·kmap 오분류 대체).
      log.info("dispatch", { route: "sequential_dff_generic_pipeline", count: n, mode });
      problems = await runSequentialGenericPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_power_factor" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "ac_power_factor_pipeline", count: n, mode });
      problems = await runAcPowerFactorPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_admittance_resonance" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "ac_admittance_resonance_pipeline", count: n, mode });
      problems = await runAcAdmittanceResonancePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_vccs_phasor" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "ac_vccs_phasor_pipeline", count: n, mode });
      problems = await runAcVccsPhasorPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_superposition_source_design" && subjectKey === "circuit_theory") {
      // 2전원 페이저 + 중첩 → 전원 크기 역산 (임용 5번 회로이론) — 전용 결정론 archetype.
      log.info("dispatch", { route: "ac_superposition_source_design_pipeline", count: n, mode });
      problems = await runAcSuperpositionSourceDesignPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "dc_wheatstone_balance" && subjectKey === "circuit_theory") {
      // DC 휘트스톤 브리지 평형 (임용 3번 회로이론) — 전용 결정론 archetype.
      log.info("dispatch", { route: "dc_wheatstone_balance_pipeline", count: n, mode });
      problems = await runDcWheatstoneBalancePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "dc_thevenin_2src" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "dc_thevenin_2src_pipeline", count: n, mode });
      problems = await runDcTheveninTwoSourcePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "thevenin" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "thevenin_pipeline", count: n, mode });
      problems = await runTheveninPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "norton" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "norton_pipeline", count: n, mode });
      problems = await runNortonPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if ((circuitType === "dc_mesh" || circuitType === "dc_nodal") && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "dc_mesh_pipeline", count: n, mode });
      problems = await runDcMeshPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "thevenin_switched_rc" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "thevenin_switched_rc_pipeline", count: n, mode });
      problems = await runTheveninSwitchedRcPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if ((circuitType === "rc_step" || circuitType === "switched_rc") && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "rc_step_pipeline", count: n, mode });
      problems = await runRcStepPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if ((circuitType === "rl_step" || circuitType === "switched_rl") && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "rl_step_pipeline", count: n, mode });
      problems = await runRlStepPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "rlc_step" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "rlc_step_pipeline", count: n, mode });
      problems = await runRlcStepPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "switched_rlc_5leg" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "switched_rlc_5leg_pipeline", count: n, mode });
      problems = await runSwitchedRlc5legPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    // ※ ac_thevenin_design_ab dispatch는 체인 **최상단**(ac_thevenin_dependent 앞)에 있다 —
    //   여기 중복으로 두면 위에서 이미 소비돼 도달하지 못한다(tsc가 unreachable로 잡아냄).
    } else if (
      circuitType === "zener_shunt_regulator" || detectZenerShuntRegulator(analysis)
    ) {
      // ★ 제너 직렬 션트 정전압 + 부하 저항 범위 (임용 2번 전자) — generic dc_mesh fallback보다 앞.
      log.info("dispatch", { route: "zener_shunt_regulator_pipeline", count: n, mode });
      problems = await runZenerShuntRegulatorPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (
      circuitType === "switched_rlc_source_free" ||
      (subjectKey === "circuit_theory" && detectSwitchedRlcSourceFree(analysis))
    ) {
      // ★ t=0 스위치 개방 무전원 직렬 RLC (임용 5번) — switched_rlc_step(전류원 포함)보다 **앞**.
      log.info("dispatch", { route: "switched_rlc_source_free_pipeline", count: n, mode });
      problems = await runSwitchedRlcSourceFreePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (
      circuitType === "rlc_state_equation" ||
      (subjectKey === "circuit_theory" && detectRlcStateEquation(analysis))
    ) {
      // ★ 직류 V·I원 RLC 상태 방정식 (임용 6번) — ac_superposition보다 **앞**.
      //   실측에서 이 원본이 교류 중첩으로 새어 전혀 다른 문제가 생성됐다.
      log.info("dispatch", { route: "rlc_state_equation_pipeline", count: n, mode });
      problems = await runRlcStateEquationPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (
      circuitType === "switched_rlc_dual_switch" ||
      (subjectKey === "circuit_theory" && detectSwitchedRlcDualSwitch(analysis))
    ) {
      // ★ SW₁ 닫힘 + SW₂(b→c) 2전압원 RLC (2022 전기 B-5) — switched_rlc_step(v1, 전류원 포함)
      //   **앞**에 둔다. 실측에서 이 원본이 v1으로 가서 전류원 회로로 변질됐다.
      log.info("dispatch", { route: "switched_rlc_dual_switch_pipeline", count: n, mode });
      problems = await runSwitchedRlcDualSwitchPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (
      circuitType === "switched_cap_short_rl" ||
      detectSwitchedCapShortRl(analysis)
    ) {
      // ★ 스위치가 **커패시터를 단락**시키는 RLC → 1차 RL 계단응답 (임용 7번 회로이론).
      //   switched_rlc_step(v1, SPDT+전류원) **앞**에 둔다 — 실측에서 그 형제가 이 원본을 가로채
      //   원본에 없는 전류원·SPDT가 들어간 회로로 변질됐다(묻는 양도 v_C(t)로 바뀜).
      log.info("dispatch", { route: "switched_cap_short_rl_pipeline", count: n, mode });
      problems = await runSwitchedCapShortRlPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "switched_rlc_step" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "switched_rlc_step_pipeline", count: n, mode });
      problems = await runSwitchedRlcStepPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "rlc_resonance" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "rlc_resonance_pipeline", count: n, mode });
      problems = await runRlcResonancePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "rlc_resonance_max_power" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "rlc_resonance_max_power_pipeline", count: n, mode });
      problems = await runRlcResonanceMaxPowerPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "dc_supermesh" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "dc_supermesh_pipeline", count: n, mode });
      problems = await runDcSupermeshPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "dc_supernode" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "dc_supernode_pipeline", count: n, mode });
      problems = await runDcSupernodePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_parallel_branches" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "ac_parallel_branches_pipeline", count: n, mode });
      problems = await runAcParallelBranchesPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_superposition" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "ac_superposition_pipeline", count: n, mode });
      problems = await runAcSuperpositionPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "dc_dependent_source" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "dc_dependent_source_pipeline", count: n, mode });
      problems = await runDcDependentSourcePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "thevenin_dependent_generic" && subjectKey === "circuit_theory") {
      // 종속전원 테브난+최대전력 — GPT 구조추출 netlist + 종속원 보존 V_oc/I_sc (예시 하드코딩 대체).
      log.info("dispatch", { route: "thevenin_dependent_generic_pipeline", count: n, mode });
      problems = await runTheveninMaxPowerGenericPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "max_power_transfer" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "max_power_transfer_pipeline", count: n, mode });
      problems = await runMaxPowerTransferPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "switched_dc" && subjectKey === "circuit_theory") {
      log.info("dispatch", { route: "switching_circuit_pipeline", count: n, mode });
      problems = await runSwitchingCircuitPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (subjectKey === "electronics" && detectOpampDifferenceAmp(analysis)) {
      // ★ OPAMP 차동증폭기 (임용 9번) — 전용 결정론 archetype. generic 추출이 2입력 차동구조
      //   (노턴 입력 I_n∥R_n + V+ 분배 R_3·R_4)를 단순 반전증폭으로 축소하는 문제 회피. opamp 분기보다 먼저.
      log.info("dispatch", { route: "opamp_difference_amp_pipeline", count: n, mode });
      problems = await runOpampDifferenceAmpPipeline({
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_three_stage_sum" && subjectKey === "electronics") {
      log.info("dispatch", { route: "opamp_three_stage_sum_pipeline", count: n, mode });
      problems = await runOpampThreeStageSumPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_positive_feedback" && subjectKey === "electronics") {
      // ★ 정귀환(positive feedback) OPAMP + SW step (임용 6번) — runOpampPipeline의 positive_feedback
      //   archetype(β·B·D·K 결정론, V_out→V+ 피드백). generic opamp가 "비반전 입력 단자"로 반전 가산증폭기
      //   변질시키는 문제 회피. opamp 분기보다 먼저. (runOpampPipeline이 텍스트 키워드로 archetype 강제.)
      log.info("dispatch", { route: "opamp_positive_feedback_pipeline", count: n, mode });
      problems = await runOpampPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_loop_gain_stability" && subjectKey === "electronics") {
      // ★ OPAMP 루프이득 + 좌반평면 안정도 (임용 12번 전자회로) — 전용 결정론 archetype.
      log.info("dispatch", { route: "opamp_loop_gain_stability_pipeline", count: n, mode });
      problems = await runOpampLoopGainStabilityPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_finite_gain_offset" && subjectKey === "electronics") {
      // ★ 유한 이득 OPAMP + 출력단 오프셋 전압원 V_B (임용 9번 전자회로) — 전용 결정론 archetype.
      //   형제 opamp_finite_gain_block(블록도·A(s))보다 먼저 두어 A₀ 공유로 인한 오탈취를 막는다.
      log.info("dispatch", { route: "opamp_finite_gain_offset_pipeline", count: n, mode });
      problems = await runOpampFiniteGainOffsetPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_finite_gain_block" && subjectKey === "electronics") {
      // ★ 연산증폭기 유한 개방루프 이득 + 블록도 (임용 11번) — 전용 결정론 archetype.
      //   generic opamp 분기가 "반전 입력 단자" 텍스트로 INVERTING_AMP 변질시키는 문제 회피. opamp 분기보다 먼저.
      log.info("dispatch", { route: "opamp_finite_gain_block_pipeline", count: n, mode });
      problems = await runOpampFiniteGainBlockPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "jk_mealy_state_design" || detectJkMealyStateDesign(analysis)) {
      // ★ JK-FF 2개 Mealy 상태도 + 상태표 빈칸 (임용 9번 디지털) — generic fsm·jk 형제보다 앞.
      log.info("dispatch", { route: "jk_mealy_state_design_pipeline", count: n, mode });
      problems = await runJkMealyStateDesignPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "bjt_thevenin_bias" || detectBjtTheveninBias(analysis)) {
      // ★ BJT 바이어스 + 베이스망 테브난 등가 (임용 10번 전자회로) — generic bjt_bias보다 앞.
      log.info("dispatch", { route: "bjt_thevenin_bias_pipeline", count: n, mode });
      problems = await runBjtTheveninBiasPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "comparator_diode_or" || detectComparatorDiodeOr(analysis)) {
      // ★ 비교기 2개 + 다이오드 결합 → 구간별 V_out·다이오드 ON/OFF (임용 3번 전자회로).
      log.info("dispatch", { route: "comparator_diode_or_pipeline", count: n, mode });
      problems = await runComparatorDiodeOrPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "bjt_switch_logic_gate" || detectBjtSwitchLogicGate(analysis)) {
      // ★ BJT 이상적 스위치 → 진리표 + 동일 동작 논리게이트 (임용 2번).
      //   형제 BJT archetype(바이어스·특성곡선·레귤레이터)은 전부 아날로그라 재현 불가.
      log.info("dispatch", { route: "bjt_switch_logic_gate_pipeline", count: n, mode });
      problems = await runBjtSwitchLogicGatePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_summer_tfeedback" || detectOpampSummerTFeedback(analysis)) {
      // ★ 반전 가산기(미지 R₁) + T형 궤환 반전증폭기 + 부하 전류 I_L (임용 7번 전자회로).
      //   generic opamp_cascade_voltage_divider가 가로채 전달함수 문제로 변질되던 실측 사고 → cascade 앞.
      log.info("dispatch", { route: "opamp_summer_tfeedback_pipeline", count: n, mode });
      problems = await runOpampSummerTFeedbackPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_two_stage_rx" || detectOpampTwoStageRx(analysis)) {
      // ★ 2단 OPAMP + 저항 R_X 설계 (임용 2번 전자회로) — generic opamp 경로 앞.
      //   stale analysis(캐시된 circuitType) 대비로 감지 안전망도 함께 건다.
      log.info("dispatch", { route: "opamp_two_stage_rx_pipeline", count: n, mode });
      problems = await runOpampTwoStageRxPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_two_stage" && subjectKey === "electronics") {
      log.info("dispatch", { route: "opamp_two_stage_pipeline", count: n, mode });
      problems = await runOpampTwoStagePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "function_generator" && subjectKey === "electronics") {
      log.info("dispatch", { route: "function_generator_pipeline", count: n, mode });
      problems = await runFunctionGeneratorPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_cascade_voltage_divider" && subjectKey === "electronics") {
      log.info("dispatch", { route: "opamp_cascade_pipeline", count: n, mode });
      problems = await runOpampCascadePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_generic" && subjectKey === "electronics") {
      // 범용 OPAMP — GPT 구조추출 netlist + MNA 결정론 풀이 + generic 렌더 (예시 하드코딩 없음).
      log.info("dispatch", { route: "opamp_generic_pipeline", count: n, mode });
      problems = await runOpampGenericPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp" && subjectKey === "electronics") {
      // 정책: OPAMP family 검출 시 archetype 기반 dispatch만 허용. free generation 금지.
      // 외부 텍스트 보강 — interpretation 외에 topic·conditions·answer·fillInTheBlanks 문장도 scoring 대상.
      const extraText: string[] = [
        analysis?.topic ?? "",
        analysis?.interpretation ?? "",
        ...(analysis?.relatedConcepts ?? []),
        ...((analysis?.fillInTheBlanks ?? []).map((b) => b.sentence)),
      ];
      const archetype = detectOpampArchetype(analysis, extraText);
      if (!archetype) {
        // ★ archetype 불확실(차동증폭기 등 고정 템플릿 아닌 OPAMP) → 예시 하드코딩 대신
        //   generic MNA 경로로 처리 (Wien Bridge 오매치·throw 대신 실제 회로 구조추출+풀이).
        log.info("dispatch", { route: "opamp_generic_pipeline (archetype 불확실 fallback)", count: n, mode });
        problems = await runOpampGenericPipeline({
          analysis: analysis ?? null,
          mode: mode as GenerationMode,
          count: n,
          topicKey: expectedTopicKey,
        });
      } else {
      log.info("dispatch", { route: "analog_archetype_dispatch", archetype, count: n });
      // N개 problem 각각 별도 generate — generator 내부 seed가 매번 다른 값 생성.
      // 동일 base × N copy 했던 옛 패턴은 결정론 generator에 대해 모두 같은 결과 emit.
      problems = [];
      for (let pi = 0; pi < n; pi++) {
        const generated = generateCircuit({ family: "OPAMP", archetype }) as GeneratedProblem;
        // ── Archetype-specific post-generation validation ──
        if (archetype === "WIEN_BRIDGE_OSCILLATOR") {
          const netlistFig = generated.figureVariants?.find((f) => f.diagramType === "analog_netlist");
          if (!netlistFig) {
            throw new GenerateError("WIEN_NETWORK_VALIDATION_FAILED: analog_netlist figure 누락");
          }
          const result = validateWienNetwork(netlistFig.diagram as CircuitNetlist);
          if (!result.ok) {
            throw new GenerateError(
              `WIEN_NETWORK_VALIDATION_FAILED: ${result.errors.join(", ")}`,
            );
          }
        }
        problems.push({ ...generated, id: randomUUID() });
      }
      log.info("validate_archetype_outputs", { archetype, count: problems.length });
      } // end: archetype 매치된 경우
    } else if (circuitType === "opamp_time_domain" && subjectKey === "electronics") {
      log.info("dispatch", { route: "opamp_time_domain_pipeline", count: n, mode });
      problems = await runOpampTimeDomainPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "flash_adc_2bit" && subjectKey === "mixed_signal") {
      log.info("dispatch", { route: "flash_adc_2bit_pipeline", count: n, mode });
      problems = await runFlashAdc2bitPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "counter_dac_comparator" && subjectKey === "mixed_signal") {
      log.info("dispatch", { route: "counter_dac_comparator_pipeline", count: n, mode });
      problems = await runCounterDacComparatorPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_two_input_diff_design" && subjectKey === "electronics") {
      log.info("dispatch", { route: "opamp_two_input_diff_design_pipeline", count: n, mode });
      problems = await runOpampTwoInputDiffDesignPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "bjt_two_stage_switched" && subjectKey === "electronics") {
      log.info("dispatch", { route: "bjt_two_stage_switched_pipeline", count: n, mode });
      problems = await runBjtTwoStageSwitchedPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "bjt_bias" && subjectKey === "electronics") {
      log.info("dispatch", { route: "bjt_bias_pipeline", count: n, mode });
      problems = await runBjtBiasPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "scr_turn_on" && subjectKey === "electronics") {
      // ★ SCR 턴온 회로 — 결정론 archetype. generic GPT 폴백이 래칭(㉡에서 게이트 없어도 ON 유지)을
      //   놓쳐 답을 틀리게 냄 → 전용 계산.
      log.info("dispatch", { route: "scr_turn_on_pipeline", count: n, mode });
      problems = await runScrTurnOnPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "zener_bjt_regulator" && subjectKey === "electronics") {
      log.info("dispatch", { route: "zener_bjt_regulator_pipeline", count: n, mode });
      problems = await runZenerBjtRegulatorPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_series_regulator" && subjectKey === "electronics") {
      log.info("dispatch", { route: "opamp_series_regulator_pipeline", count: n, mode });
      problems = await runOpampSeriesRegulatorPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "active_lowpass_filter" && subjectKey === "electronics") {
      log.info("dispatch", { route: "active_lowpass_filter_pipeline", count: n, mode });
      problems = await runActiveLowpassFilterPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "opamp_analog_summer" && subjectKey === "electronics") {
      log.info("dispatch", { route: "opamp_analog_summer_pipeline", count: n, mode });
      problems = await runOpampAnalogSummerPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "bjt_characteristic_curve" && subjectKey === "electronics") {
      log.info("dispatch", { route: "bjt_characteristic_curve_pipeline", count: n, mode });
      problems = await runBjtCharacteristicCurvePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "mosfet_cascode_mirror" && subjectKey === "electronics") {
      log.info("dispatch", { route: "mosfet_cascode_mirror_pipeline", count: n, mode });
      problems = await runMosfetCascodeMirrorPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "mosfet_bias" && subjectKey === "electronics") {
      log.info("dispatch", { route: "mosfet_bias_pipeline", count: n, mode });
      problems = await runMosfetBiasPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "bjt_small_signal" && subjectKey === "electronics") {
      log.info("dispatch", { route: "bjt_small_signal_pipeline", count: n, mode });
      problems = await runBjtSmallSignalPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "kmap_sop" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "kmap_sop_pipeline", count: n, mode });
      problems = await runKmapSopPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "kmap_pos" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "kmap_pos_pipeline", count: n, mode });
      problems = await runKmapPosPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "flipflop_mixed_app" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "flipflop_mixed_pipeline", count: n, mode });
      problems = await runFlipflopMixedPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "tff_state_table_blank" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "tff_state_table_blank_pipeline", count: n, mode });
      problems = await runTffStateTableBlankPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "jk_sync_counter" && subjectKey === "digital_logic") {
      // ★ JK 플립플롭 동기식 카운터 타이밍 분석 (임용 6번류) — 전용 결정론 archetype.
      //   sequential_dff_generic·ff_with_waveform은 D/T-FF 전용이라 JK 카운터를 D-FF 상태설계로
      //   변질시킴 → JK-FF 3개 + 공통 CP + 타이밍 도표 재현 (logic_network 렌더러 재사용).
      log.info("dispatch", { route: "jk_sync_counter_pipeline", count: n, mode });
      problems = await runJkSyncCounterPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ff_with_waveform" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "ff_with_waveform_pipeline", count: n, mode });
      problems = await runFfWithWaveformPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "flipflop_counter" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "flipflop_counter_pipeline", count: n, mode });
      problems = await runFlipflopCounterPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "combinational_gate" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "combinational_gate_pipeline", count: n, mode });
      problems = await runCombinationalGatePipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "sequence_detector" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "sequence_detector_pipeline", count: n, mode });
      problems = await runSequenceDetectorPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "sr_ff_mux_sequential" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "sr_ff_mux_sequential_pipeline", count: n, mode });
      problems = await runSrFfMuxSequentialPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "number_repr_fill_blank") {
      // ★ 임용 27번 — 데이터 표현·산술 연산 빈칸 채우기 (그림 없음).
      log.info("dispatch", { route: "number_repr_fill_blank_pipeline", count: n, mode });
      problems = await runNumberReprFillBlankPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "max_power_two_source_ratio") {
      // ★ 임용 17번 — 전원 크기만 다른 두 회로의 최대전력 부하와 비.
      log.info("dispatch", { route: "max_power_two_source_ratio_pipeline", count: n, mode });
      problems = await runMaxPowerTwoSourceRatioPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "jk_two_phase_clock") {
      // ★ 임용 30번 — JK + 2상 클럭발생기 + EX-OR 출력 파형 도시.
      log.info("dispatch", { route: "jk_two_phase_clock_pipeline", count: n, mode });
      problems = await runJkTwoPhaseClockPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "rlc_antiresonance_ladder") {
      // ★ 임용 16번 — 병렬 LC 반공진.
      log.info("dispatch", { route: "rlc_antiresonance_ladder_pipeline", count: n, mode });
      problems = await runRlcAntiresonanceLadderPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "ac_dc_source_superposition_vc") {
      // ★ 임용 15번 — 교류 전압원 + 직류 전류원 정상상태 중첩.
      log.info("dispatch", { route: "ac_dc_source_superposition_vc_pipeline", count: n, mode });
      problems = await runAcDcSourceSuperpositionVcPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "two_source_rl_superposition") {
      // ★ 임용 4번 — 전압원 2개(계단+정현파) 테브난+중첩 5단계.
      log.info("dispatch", { route: "two_source_rl_superposition_pipeline", count: n, mode });
      problems = await runTwoSourceRlSuperpositionPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "switched_rl_dual_short") {
      // ★ 임용 17번 — 전류원 RL + 스위치 2개가 소자를 단락. generic switched_rl 앞에 둔다.
      log.info("dispatch", { route: "switched_rl_dual_short_pipeline", count: n, mode });
      problems = await runSwitchedRlDualShortPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "dff_preset_clear_regions") {
      // ★ 임용 27번 — D-FF + 비동기 PR·CLR + A·B 조합논리 → 구간 ㉠~㉢의 출력 Q 파형.
      //   과목 게이트를 걸지 않는다(위에서 subjectKey를 digital_logic으로 고정했고,
      //   회로가 아날로그처럼 보여 과목이 흔들리는 유형이다).
      log.info("dispatch", { route: "dff_preset_clear_regions_pipeline", count: n, mode });
      problems = await runDffPresetClearRegionsPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "async_preset_ripple_counter" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "async_preset_ripple_counter_pipeline", count: n, mode });
      problems = await runAsyncPresetCounterPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "tff_state_design_input" || detectTffStateDesignInput(analysis)) {
      // ★ 입력 X를 갖는 2-bit 상태기계 + T-FF 설계 (임용 12번 디지털논리) — dff_state_design 앞.
      //   형제는 입력 없는 자율 상태도라 스스로 양보하지만, 받아 줄 전용 분기가 없으면 generic fsm으로 샌다.
      log.info("dispatch", { route: "tff_state_design_input_pipeline", count: n, mode });
      problems = await runTffStateDesignInputPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "dff_state_design" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "dff_state_design_pipeline", count: n, mode });
      problems = await runDffStateDesignPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "dff_mux_sequential" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "dff_mux_sequential_pipeline", count: n, mode });
      problems = await runDffMuxSequentialPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "fsm" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "fsm_pipeline", count: n, mode });
      problems = await runFsmPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "waveform_analysis" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "waveform_analysis_pipeline", count: n, mode });
      problems = await runWaveformAnalysisPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else if (circuitType === "mux_implementation" && subjectKey === "digital_logic") {
      log.info("dispatch", { route: "mux_implementation_pipeline", count: n, mode });
      problems = await runMuxImplementationPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
    } else {
      const fn = (mode as GenerationMode) === "exam_similar" ? generateSimilar : generateVariant;
      problems = await fn({
        image,
        subject: subjectKey,
        count: n,
        analysis: analysis ?? null,
        topicKey: expectedTopicKey,
        semantic: expectedSemantic,
      });
    }
    } // end: source_transform_ratio 우선 dispatch가 아닐 때의 기존 dispatch 체인
    } // end: electromagnetics가 아닐 때의 회로 dispatch 체인

    // ★ 뜬 노드(dangling) 자동 보정 — **모든 파이프라인 공통, 검증 직전 한 곳에서** (2026-07-27).
    //   실측 신고: `node "B" — degree 1` + `V2: pins "B"↔"M1" 사이 closed loop 없음 — floating source`.
    //   원인은 `autoCloseAnalogDangling`이 **GPT 자유 경로(_core)에만** 걸려 있었던 것 —
    //   결정론 파이프라인(opamp_generic 등)이 만든 analog_netlist는 보정 없이 화면까지 나갔다.
    //   CLAUDE.md 규칙 1-3("분기마다 fallback 금지, 한 곳에서 처리") 적용.
    //   ※ label_only(외부 단자)·ground는 autoClose 내부에서 면제되므로 단자가 GND로 단락되지 않는다.
    autoCloseAnalogDangling(problems);

    // ★★ GPT 출력 **형식 정규화** — 텍스트 필드를 문자열로 강제한다 (2026-08-12 실측 500 2건).
    //   GPT 경로가 answer·solution·question을 **배열이나 객체로** 돌려주는 회차가 있어, 뒤따르는
    //   포맷터·검증기가 `text.replace is not a function` / `text.match is not a function`으로 터졌다
    //   (실측: switched_dc·bjt_small_signal이 HTTP 500). 소비자마다 방어를 흩뿌리면 반드시 빠지는 곳이
    //   생기므로 **모든 후처리 앞 한 곳에서** 흡수한다([[feedback_gpt_format_normalization]]).
    const asText = (v: unknown): string =>
      typeof v === "string" ? v
        : Array.isArray(v) ? v.map((x) => asText(x)).join("\n")
        : v == null ? ""
        : typeof v === "object" ? Object.values(v as Record<string, unknown>).map((x) => asText(x)).join("\n")
        : String(v);
    for (const p of problems) {
      p.content = asText(p.content);
      p.question = asText(p.question);
      p.answer = asText(p.answer);
      p.solution = asText(p.solution);
      p.conditions = Array.isArray(p.conditions)
        ? p.conditions.map((c) => asText(c))
        : p.conditions ? [asText(p.conditions)] : [];
    }

    // ★ 소수 → 분수 표기 (사용자 요청 2026-07-29: "답이 소수점으로 나오면 차라리 분수로").
    //   **모든 파이프라인 공통, 검증 직전 한 곳에서** 처리한다(유형마다 고치면 반드시 빠지는 곳이 생긴다 —
    //   CLAUDE.md 규칙 1-3). 답·풀이에만 적용하고 본문·조건(주어진 소자 값 0.7V·0.2µF 등)은 건드리지 않는다.
    //   깔끔한 분수(분모 ≤ 20)만 변환하므로 2.693∠158.199° 같은 근삿값은 그대로 남는다.
    for (const p of problems) {
      if (p.answer) p.answer = fractionizeText(p.answer);
      if (p.solution) p.solution = fractionizeText(p.solution);
    }

    // ★ 문제 **조건**에서 자연상수 e의 수치 제시를 제거 (사용자 지정 2026-08-04, 전 과목).
    //   "답에 있는 건 상관없고 문제 조건으로 주어지는 것만" → content·conditions에만 적용한다.
    //   GPT가 `(단, e = 2.718로 계산한다)`를 얹으면 학생이 기호식 대신 소수로 답하게 된다.
    //   위 분수 변환기와 같은 이유로 **한 곳에서** 처리한다(유형마다 고치면 반드시 빠지는 곳이 생긴다).
    for (const p of problems) {
      if (p.content) p.content = stripEulerGiven(p.content);
      const cleaned = stripEulerGivenList(p.conditions);
      if (cleaned) p.conditions = cleaned;
    }

    // 검증 (Pipeline 6단계)
    // answer/solution 일관성 issue는 별도 "solutionIssues"로 보고 — totalIssues에 합산하지만
    // critical은 아님 (이미 솔버가 정답 강제, 풀이 텍스트 품질 경고).
    const validations: Array<{
      problemId: string;
      problem: ValidationResult;
      figures: ValidationResult;
      solution?: { ok: boolean; issues: Array<{ rule: string; message: string }> };
    }> = [];
    let totalIssues = 0;
    let solutionWarnings = 0;
    // ★ gpt_generated 모드는 원본 구조를 보존하지 않고 그림도 만들지 않으므로(텍스트 자유 출제)
    //   회로 subject의 topology/figure 검증(missing_topology·figure_reference 등)은 적용 대상이 아니다.
    //   구조·그림 검증은 건너뛰고 답·풀이 일관성만 확인한다.
    const skipStructuralValidation = mode === "gpt_generated";
    // ★★ 객관식 원본 → 3단계 단계별 주관식 계약 (사용자 지정 2026-08-12).
    //   원본이 보기 ①~⑤ 중 고르는 문항이면 생성물은 예외 없이 〈해석 절차〉 3단계 서술형이어야 한다.
    //   판정은 **한 곳에서** 하고(분석 텍스트), 검증기가 위반을 보고한다([[lib/format/threeStep]]).
    const multipleChoiceOriginal = detectMultipleChoiceOriginal(analysis);
    for (const p of problems) {
      const pv = skipStructuralValidation
        ? { ok: true, issues: [] as ValidationResult["issues"] }
        : validateProblem({
            problem: p,
            expected: { subject: subjectKey, topicKey: expectedTopicKey, ruleSet, multipleChoiceOriginal },
          });
      const fv = skipStructuralValidation
        ? { ok: true, issues: [] as ValidationResult["issues"] }
        : validateFigures(p.figureVariants ?? []);
      const sv = validateAnswerSolution({ answer: p.answer, solution: p.solution });
      const solutionResult = { ok: sv.length === 0, issues: sv };
      validations.push({ problemId: p.id, problem: pv, figures: fv, solution: solutionResult });
      totalIssues += pv.issues.length + fv.issues.length;
      solutionWarnings += sv.length;
    }
    log.info("validation", { mode, returned: problems.length, totalIssues, solutionWarnings });

    // ★★ 라우팅 요약 한 줄 (2026-07-27) — "왜 이 문제가 나왔는지"를 한 번에 알기 위한 조치.
    //   지금까지는 분류·재분류·보정·dispatch·figure가 로그 여기저기 흩어져 있어 원인 특정에
    //   여러 번의 왕복이 필요했다. 이 한 줄만 보면 결정 경로가 끝난다.
    //   읽기: `node scripts/whyLastGeneration.mjs`
    // ★★ 재발 방지 조치 (2026-07-29) — **generic 경로로 떨어지면 경고를 남긴다**.
    //   이번 주 반복된 사고는 전부 "전용 archetype이 있는데 넓은 분기·generic 경로가 가로챈" 것이었고,
    //   에러가 아니라 totalIssues=0으로 조용히 통과해 사용자 화면에서야 드러났다.
    //   generic 경로가 정답인 경우도 있으므로 차단하지 않고 **경고만** 남긴다 — 신고가 들어오면
    //   이 한 줄(`generic_dispatch_warning`)만 grep 하면 원인 후보가 즉시 나온다.
    const GENERIC_DISPATCH_TYPES = new Set([
      "universal_dc", "universal_ac", "universal_digital", "topology_driven",
      "dc_mesh", "dc_nodal", "rl_step", "rc_step", "rlc_step",
      "switched_rc", "switched_rl", "thevenin", "norton",
      "opamp", "opamp_generic", "fsm", "sequential_dff_generic", "combinational_gate",
    ]);
    if (circuitType && GENERIC_DISPATCH_TYPES.has(circuitType)) {
      log.warn("generic_dispatch_warning", {
        finalType: circuitType,
        subject: subjectKey,
        hint: "전용 archetype이 있는 원본이 generic 경로로 떨어졌을 수 있음 — 분류기 0-PRE/감지 안전망 확인",
        topic: String(analysis?.topic ?? "").slice(0, 60),
      });
    }

    log.info("routing_summary", {
      subject: subjectKey,
      cachedType: routingTrace.cachedType ?? "(none)",
      finalType: circuitType ?? "(none)",
      reclassified: routingTrace.reclassifiedTo ?? "-",
      coercions: routingTrace.coercions.length > 0 ? routingTrace.coercions.join(",") : "-",
      coercionSkipped: routingTrace.coercionSkipped ? "yes(specific)" : "no",
      topicKey: expectedTopicKey ?? "(none)",
      figures: problems.flatMap((p) => (p.figureVariants ?? []).map((f) => f.diagramType)).join(",") || "(none)",
      totalIssues,
      mode,
    });

    return NextResponse.json({
      problems,
      mode,
      ruleSet,
      validations,
      summary: { problems: problems.length, totalIssues, solutionWarnings },
    });
  } catch (e) {
    if (e instanceof GenerateError) {
      log.error("GenerateError", { message: e.message });
      return NextResponse.json({ error: `생성 실패: ${e.message}` }, { status: 502 });
    }
    log.error("처리 중 오류", { error: (e as Error).message });
    return NextResponse.json({ error: "문제 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * archetype별 지원 features 화이트리스트 — 둘 이상 hybrid feature가 동시 또는 archetype이 못 다루면
 * topology-driven으로 fallback.
 *
 *  archetype 가정:
 *   - switched_*: SW만, 종속전원·supermesh 미지원
 *   - dc_dependent_source: 종속전원만, SW·supermesh 미지원
 *   - dc_supermesh: supermesh만, SW·종속전원 미지원 (현 구현 한계)
 *   - 그 외: SW·종속전원·supermesh 모두 미지원
 */
/**
 * topologySignature.features 보강 — Vision이 features를 불안정하게 채우는 경우(로그
 * "topologySignature 형태 불량")가 잦다. inventory(SW·종속전원)와 텍스트(supermesh)로 교차
 * 보강해 hybrid 케이스(임용 8번: SW+종속전류원+supermesh)가 판정에서 누락되지 않게 한다.
 */
function augmentTopologyFeatures(
  analysis: AnalysisResult | null | undefined,
): { hasSwitch?: boolean; hasDependentSource?: boolean; hasSupermesh?: boolean; hasMesh?: boolean; meshCount?: number } {
  const inv = analysis?.componentInventory ?? [];
  const text = [
    analysis?.topic ?? "",
    analysis?.interpretation ?? "",
    ...(analysis?.relatedConcepts ?? []),
  ].join(" ");
  const base = analysis?.topologySignature?.features ?? {};
  return {
    ...base,
    hasSwitch:
      Boolean(base.hasSwitch) || inv.some((c) => String(c?.type).toUpperCase() === "SW"),
    hasDependentSource:
      Boolean(base.hasDependentSource) ||
      inv.some((c) => ["VCCS", "CCCS", "CCVS", "VCVS"].includes(String(c?.type).toUpperCase())),
    hasSupermesh:
      Boolean(base.hasSupermesh) || /초\s*메쉬|supermesh|초\s*마디|supernode/i.test(text),
  };
}

/**
 * 임용 8번 시그니처 — 스위치 + 종속전류원 + 독립전류원 + 초메쉬(supermesh)가 동시에 존재.
 * 이 조합은 (가)SW개방·(나)SW단락 2-state + 종속전류원 보존 + supermesh 해석이 필요한 고정
 * 토폴로지로, generic universal_dc/topology_driven이 재현 못 한다. 전용 archetype으로 라우팅.
 */
// 종속전원 계수 패턴 — "0.2·V₃"/"0.2V2"/"0.2V"(첨자 소실)/"2V₃" 등 계수×노드전압.
//   "10V"·"5V"(독립 전압원)·"1A"·"10Ω"는 매칭 금지: (소수 계수 + V) 또는 (정수 계수 + V + 첨자) 만 인정.
const DEP_VALUE_RE = /(\d*\.\d+\s*[·*x]?\s*v)|(\d+\s*[·*]?\s*v[_\s]?[₀-₉0-9])/i;

function detectSupermeshSwitchedDependent(analysis: AnalysisResult | null | undefined): boolean {
  if (!analysis) return false;
  const inv = analysis.componentInventory ?? [];
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    ...(analysis.relatedConcepts ?? []),
    ...((analysis.fillInTheBlanks ?? []).map((b) => b?.sentence ?? "")),
  ].join(" ");
  // ★ Vision은 이 회로의 SW·종속전류원을 run마다 들쭉날쭉 놓친다(실측: 한 run은 SW+VCCS 추출,
  //   다른 run은 SW 통째 누락 + 종속원을 일반 V "0.2V"로 추출). 따라서 각 조건을
  //   인벤토리 단독이 아니라 inventory OR 텍스트/값 패턴으로 도출해 라우팅 안정화.

  // 스위치 — inventory SW 또는 텍스트의 스위치 언급(임용 8번 〈해석 절차〉에 "스위치 SW" 명시).
  const hasSwitch =
    inv.some((c) => String(c?.type).toUpperCase() === "SW") ||
    /스위치|\bSW\b|switch/i.test(text);

  // 종속전원 — inventory의 종속 타입/계수×V value, 또는 텍스트의 "종속" 언급.
  const hasDep =
    inv.some((c) => {
      const ty = String(c?.type).toUpperCase();
      if (["VCCS", "CCCS", "CCVS", "VCVS"].includes(ty)) return true;
      // Vision이 종속원을 일반 V/I로 추출하고 value에 계수×전압을 남긴 경우 (예 "0.2V2"·"0.2V")
      return DEP_VALUE_RE.test(String(c?.value ?? ""));
    }) ||
    /종속\s*(전원|전류원|전압원)|dependent\s*source|controlled\s*source/i.test(text);

  // 독립 전류원 — 종속(value에 V 포함)이 아닌 진짜 I, 또는 텍스트의 전류원 언급.
  const hasIsrc =
    inv.some((c) => String(c?.type).toUpperCase() === "I" && !/v/i.test(String(c?.value ?? ""))) ||
    /전류원|current\s*source/i.test(text);

  // 초메쉬(supermesh)의 한글 음역은 Vision이 매번 다르게 출력한다: "수퍼메시"·"슈퍼메시"·
  //   "초메쉬"·"초메시"·"초마디"·"수퍼매시" 등. 한 변형만 매칭하면 detector가 새는다
  //   (실측: "수퍼메시 해석"을 못 잡아 generic topology_driven으로 오라우팅).
  //   → (수퍼|슈퍼|초) × (메쉬|메시|매시|마디|노드) 조합 + 영어 super(-)mesh/node 모두 흡수.
  const hasSupermesh =
    /(수퍼|슈퍼|초)\s*(메쉬|메시|매시|마디|노드)|super\s*-?\s*(mesh|node)/i.test(text) ||
    analysis.topicKey === "supermesh" ||
    analysis.topicKey === "supernode" ||
    Boolean(analysis.topologySignature?.features?.hasSupermesh);
  return hasSwitch && hasDep && hasIsrc && hasSupermesh;
}

function shouldUseTopologyDriven(
  circuitType: string | undefined,
  features: { hasSwitch?: boolean; hasDependentSource?: boolean; hasSupermesh?: boolean },
  branchCount: number = 0,
  inventoryCount: number = 0,
  archetypeBranchAssumption: number = 5,
): boolean {
  const hasSwitch = Boolean(features.hasSwitch);
  const hasDep = Boolean(features.hasDependentSource);
  const hasSupermesh = Boolean(features.hasSupermesh);

  // ac_superposition은 전용 generator로 명시 분기에서 처리. topology_driven으로 fallback 금지.
  // ★ universal_dc는 자체 MNA DC 솔버 보유 — 단, SW(스위치)는 못 푼다: 열린 leg가 floating node가
  //   되어 singular matrix. SW 또는 (supermesh+종속전원) hybrid면 early-return 하지 않고 아래
  //   hasSwitch/hasDep 판정으로 흘려보내 topology_driven 2-state((가)open·(나)closed) figure를
  //   생성한다. (임용 8번: SW + 종속전류원 0.2V + supermesh — universal_dc가 못 푸는 hybrid.)
  if (circuitType === "universal_dc" && !(hasSwitch || (hasSupermesh && hasDep))) return false;
  if (circuitType === "universal_ac") return false;
  if (circuitType === "ac_superposition") return false;
  // rlc_resonance도 전용 generator(공진곡선 figure 포함) 보존 — topology_driven은 회로만 만들고
  // 주파수응답 곡선 figure를 모르므로 fallback 금지.
  if (circuitType === "rlc_resonance") return false;
  if (circuitType === "rlc_resonance_max_power") return false;
  // switched_rlc_step·switched_rlc_5leg 모두 전용 generator 보존.
  if (circuitType === "switched_rlc_step") return false;
  // switched_rlc_dual_switch도 전용 결정론 generator+렌더러 (2022 전기 B-5) — 두 스위치 구조 보존.
  if (circuitType === "ac_thevenin_design_ab") return false;
  // ac_delta_wye_bridge도 전용 결정론 generator+렌더러 (임용 2번 회로이론) — 5-arm 브리지 구조 보존.
  if (circuitType === "ac_delta_wye_bridge") return false;
  // oscilloscope_phase_l도 전용 결정론 generator+렌더러 (임용 11번) — 스코프 화면 figure 보존.
  if (circuitType === "oscilloscope_phase_l") return false;
  // ac_two_source_mesh_power도 전용 결정론 generator+렌더러 (임용 5번) — 2-메시 구조 보존.
  if (circuitType === "ac_two_source_mesh_power") return false;
  // ac_superposition_null_source (임용 3번) — 고정 2-메시(V_s·I_s)를 topology-driven이 잃는다.
  if (circuitType === "ac_superposition_null_source") return false;
  // thevenin_dep_graph_max_power도 전용 결정론 generator+렌더러 (임용 9번) — 점선 박스·계기 보존.
  if (circuitType === "thevenin_dep_graph_max_power") return false;
  // opamp_avg_superposition_r도 전용 (임용 8번) — (+)단자 3입력 구조 보존.
  if (circuitType === "opamp_avg_superposition_r") return false;
  // max_power_two_source_ratio도 전용 결정론 generator+렌더러 (임용 17번) — 2-figure 구조 보존.
  if (circuitType === "max_power_two_source_ratio") return false;
  // bjt_early_effect_fill_blank — 회로 netlist가 아니라 소자 단면도·특성곡선이다(임용 27번).
  if (circuitType === "bjt_early_effect_fill_blank") return false;
  // rlc_antiresonance_ladder도 전용 결정론 generator+렌더러 (임용 16번).
  if (circuitType === "rlc_antiresonance_ladder") return false;
  // ac_dc_source_superposition_vc도 전용 결정론 generator+렌더러 (임용 15번).
  if (circuitType === "ac_dc_source_superposition_vc") return false;
  // two_source_rl_superposition도 전용 결정론 generator+렌더러 (임용 4번) — 3-figure 구조 보존.
  if (circuitType === "two_source_rl_superposition") return false;
  // switched_rl_dual_short도 전용 결정론 generator+렌더러 (임용 17번) — 전류원·스위치 2개 구조 보존.
  if (circuitType === "switched_rl_dual_short") return false;
  // dff_preset_clear_regions도 전용 결정론 generator+렌더러 (임용 27번) — PR·CLR 비동기 구조 보존.
  if (circuitType === "dff_preset_clear_regions") return false;
  // dff_nand_mux_pair도 전용 결정론 generator (임용 12번) — 3-NAND 입력망 구조 보존.
  if (circuitType === "dff_nand_mux_pair") return false;
  if (circuitType === "zener_shunt_regulator") return false;
  if (circuitType === "switched_rlc_source_free") return false;
  // rlc_state_equation도 전용 결정론 generator+렌더러 (임용 6번) — 고정 토폴로지 보존.
  if (circuitType === "rlc_state_equation") return false;
  if (circuitType === "switched_rlc_dual_switch") return false;
  // 전용 결정론 generator+렌더러 — 고정 토폴로지(스위치가 커패시터와 병렬)를 topology-driven이 못 그린다.
  if (circuitType === "switched_cap_short_rl") return false;
  if (circuitType === "switched_rlc_5leg") return false;
  if (circuitType === "ac_parallel_branches") return false;
  // thevenin_switched_rc는 전용 fixed-slot generator (imyong 9 정보과). 점선박스+Thevenin 등가
  // figure는 topology-driven으로 재현 불가 → 전용 pipeline 보존.
  if (circuitType === "thevenin_switched_rc") return false;
  // universal_ac_pwl도 전용 PWL 솔버 (imyong 6번). topology-driven으로 fallback 금지.
  if (circuitType === "universal_ac_pwl") return false;
  // opamp_cascade_voltage_divider도 전용 2-OPAMP renderer (imyong 10번). topology-driven 우회.
  if (circuitType === "opamp_cascade_voltage_divider") return false;
  // opamp_generic은 GPT 구조추출 netlist 경로 — topology-driven 우회.
  if (circuitType === "opamp_generic") return false;
  // opamp_two_stage는 전용 결정론 generator+renderer (임용 2번). topology-driven 우회.
  if (circuitType === "opamp_two_stage") return false;
  // opamp_two_stage_rx도 전용 결정론 generator+렌더러 (임용 2번 전자회로) — 2단·3입력 구조 보존.
  if (circuitType === "opamp_two_stage_rx") return false;
  // dc_two_source_ladder도 전용 결정론 generator+렌더러 (임용 3번 회로이론).
  if (circuitType === "dc_two_source_ladder") return false;
  if (circuitType === "diode_clamper") return false;
  // ac_thevenin_two_box도 전용 결정론 generator+렌더러 (임용 10번 회로이론) — 점선 박스 2개 구조 보존.
  if (circuitType === "ac_thevenin_two_box") return false;
  // opamp_summer_tfeedback도 전용 결정론 generator+렌더러 (임용 7번 전자회로) — T형 궤환 구조 보존.
  if (circuitType === "opamp_summer_tfeedback") return false;
  // bjt_switch_logic_gate도 전용 결정론 generator+렌더러 (임용 2번).
  if (circuitType === "bjt_switch_logic_gate") return false;
  // comparator_diode_or도 전용 결정론 generator+렌더러 (임용 3번 전자회로).
  if (circuitType === "comparator_diode_or") return false;
  // bjt_thevenin_bias도 전용 결정론 generator+렌더러 (임용 10번 전자회로).
  if (circuitType === "bjt_thevenin_bias") return false;
  // function_generator는 전용 결정론 generator+renderer (임용 29번). topology-driven 우회.
  if (circuitType === "function_generator") return false;
  // opamp_finite_gain_block은 전용 결정론 generator+renderer (임용 11번). topology-driven 우회.
  if (circuitType === "opamp_finite_gain_block") return false;
  // opamp_finite_gain_offset도 전용 결정론 generator+renderer (임용 9번 전자회로). topology-driven 우회.
  if (circuitType === "opamp_finite_gain_offset") return false;
  // opamp_loop_gain_stability도 전용 결정론 generator+renderer (임용 12번 전자회로). topology-driven 우회.
  if (circuitType === "opamp_loop_gain_stability") return false;
  // opamp_positive_feedback은 runOpampPipeline의 positive_feedback archetype (임용 6번). topology-driven 우회.
  if (circuitType === "opamp_positive_feedback") return false;
  // opamp_three_stage_sum은 전용 결정론 generator+renderer (임용 2번 전자). topology-driven 우회.
  if (circuitType === "opamp_three_stage_sum") return false;
  // ac_bridge_max_power는 전용 결정론 generator+브리지 렌더러 (임용 7번). topology-driven 우회.
  if (circuitType === "ac_bridge_max_power") return false;
  // ac_power_factor는 전용 결정론 generator+렌더러 (임용 9번 역률). topology-driven 우회.
  if (circuitType === "ac_power_factor") return false;
  // ac_admittance_resonance는 전용 결정론 generator+렌더러 (임용 7번 회로이론). topology-driven 우회.
  if (circuitType === "ac_admittance_resonance") return false;
  // ac_vccs_phasor는 전용 결정론 generator+렌더러 (임용 3번, 종속전류원 2단 구동). topology-driven 우회.
  if (circuitType === "ac_vccs_phasor") return false;
  // ac_thevenin_ladder는 전용 결정론 generator+사다리 렌더러 (임용 7번 회로이론). topology-driven 우회.
  if (circuitType === "ac_thevenin_ladder") return false;
  // ac_thevenin_dependent도 전용 결정론 generator+렌더러 (임용 6번 회로이론) — 종속전원을 잃지 않도록 우회.
  if (circuitType === "ac_thevenin_dependent") return false;
  // switched_rc_dc_transient는 전용 결정론 generator+렌더러 (임용 2번). topology-driven 우회.
  if (circuitType === "switched_rc_dc_transient") return false;
  // ★ dc_wheatstone_balance는 전용 결정론 generator+브리지 렌더러 (임용 3번 회로이론). topology-driven 우회.
  //   (실측: inventoryCount 8 ≥ 7 게이트에 걸려 브리지 구조가 통째로 소실됐다.)
  if (circuitType === "dc_wheatstone_balance") return false;
  // ac_superposition_source_design도 전용 결정론 generator+렌더러 (임용 5번). topology-driven 우회.
  if (circuitType === "ac_superposition_source_design") return false;
  // thevenin_dependent_generic도 GPT 구조추출 + 종속원 보존 경로 — topology-driven 우회.
  if (circuitType === "thevenin_dependent_generic") return false;
  // ★ max_power_transfer는 runMaxPowerTransferPipeline이 2V+2I를 viTheveninMaxPower로 충실 재현
  //   (inventory 7개여도). 아래 inventoryCount≥7 게이트에 뺏기지 않도록 여기서 우회. (임용 6번 회귀)
  if (circuitType === "max_power_transfer") return false;

  const archetypeSupportsSwitch =
    circuitType === "switched_rc" || circuitType === "switched_rl" || circuitType === "switched_dc";
  const archetypeSupportsDep = circuitType === "dc_dependent_source";

  if (hasSwitch && !archetypeSupportsSwitch) return true;
  if (hasDep && !archetypeSupportsDep) return true;
  // dc_supermesh archetype은 SW/dep 둘 다 못 다룸
  if (hasSupermesh && (hasSwitch || hasDep)) return true;
  // ★ branches 개수 초과 — analyze가 잘 추출한 경우 (한 branch 1 component 가정)
  if (branchCount > archetypeBranchAssumption + 1) return true;
  // ★ inventory 풍부 — analyze가 한 branch에 multi-component 직렬로 압축한 경우 대비.
  //   thevenin/max_power_transfer archetype의 vi_two_source는 5 component 가정.
  //   inventory가 7+이면 horizontal V·multiple sources·풍부한 R을 archetype hardcode가
  //   못 재현 → 원본 구조 손실. topology-driven으로 generic 재구성.
  if (inventoryCount >= 7) return true;
  return false;
}

