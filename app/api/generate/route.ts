import { NextRequest, NextResponse } from "next/server";
import { GenerateError } from "@/lib/generation/_core";
import { generateVariant } from "@/lib/generation";
import { generateSimilar } from "@/lib/mutation";
import { resolveRules } from "@/lib/rules";
import { validateProblem, validateFigures, type ValidationResult } from "@/lib/validators";
import { validateAnswerSolution } from "@/lib/validators/validateAnswerSolution";
import { createLogger } from "@/lib/logger";
import { runTheveninPipeline } from "@/lib/pipeline/runTheveninPipeline";
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
import { runDcDependentSourcePipeline } from "@/lib/pipeline/runDcDependentSourcePipeline";
import { runAcSuperpositionPipeline } from "@/lib/pipeline/runAcSuperpositionPipeline";
import { runAcParallelBranchesPipeline } from "@/lib/pipeline/runAcParallelBranchesPipeline";
import { runMaxPowerTransferPipeline } from "@/lib/pipeline/runMaxPowerTransferPipeline";
import { runTheveninMaxPowerGenericPipeline } from "@/lib/pipeline/runTheveninMaxPowerGenericPipeline";
import { runSwitchingCircuitPipeline } from "@/lib/pipeline/runSwitchingCircuitPipeline";
import { runSwitchedRlDependentPipeline } from "@/lib/pipeline/runSwitchedRlDependentPipeline";
import { runSourceTransformRatioPipeline, detectSourceTransformRatio } from "@/lib/pipeline/runSourceTransformRatioPipeline";
import { runOpampPipeline } from "@/lib/pipeline/runOpampPipeline";
import { runOpampTimeDomainPipeline } from "@/lib/pipeline/runOpampTimeDomainPipeline";
import { runBjtSmallSignalPipeline } from "@/lib/pipeline/runBjtSmallSignalPipeline";
import { runBjtBiasPipeline } from "@/lib/pipeline/runBjtBiasPipeline";
import { runBjtCharacteristicCurvePipeline } from "@/lib/pipeline/runBjtCharacteristicCurvePipeline";
import { runMosfetBiasPipeline } from "@/lib/pipeline/runMosfetBiasPipeline";
import { runMosfetCascodeMirrorPipeline } from "@/lib/pipeline/runMosfetCascodeMirrorPipeline";
import { runCounterDacComparatorPipeline } from "@/lib/pipeline/runCounterDacComparatorPipeline";
import { runKmapSopPipeline } from "@/lib/pipeline/runKmapSopPipeline";
import { runKmapPosPipeline } from "@/lib/pipeline/runKmapPosPipeline";
import { runFlipflopCounterPipeline } from "@/lib/pipeline/runFlipflopCounterPipeline";
import { runFfWithWaveformPipeline } from "@/lib/pipeline/runFfWithWaveformPipeline";
import { runFlipflopMixedPipeline } from "@/lib/pipeline/runFlipflopMixedPipeline";
import { runTffStateTableBlankPipeline } from "@/lib/pipeline/runTffStateTableBlankPipeline";
import { runCombinationalGatePipeline } from "@/lib/pipeline/runCombinationalGatePipeline";
import { runFsmPipeline } from "@/lib/pipeline/runFsmPipeline";
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
      return NextResponse.json({ error: "mode는 exam_similar 또는 exam_variant여야 합니다." }, { status: 400 });
    }
    const n = typeof count === "number" && count > 0 ? Math.min(Math.floor(count), 10) : 1;

    const subjectKey = subject as SubjectKey;

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
    const DIGITAL_ONLY_TYPES = new Set([
      "universal_digital", "sequential_dff_generic", "kmap_sop", "kmap_pos",
      "flipflop_mixed_app", "tff_state_table_blank", "ff_with_waveform",
      "flipflop_counter", "combinational_gate", "sequence_detector", "fsm",
      "waveform_analysis", "mux_implementation", "counter_dac_comparator",
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
      log.warn("analog_subject_digital_circuittype_coerced", {
        from: analysis.circuitType.type,
        to: coerced,
        subject: subjectKey,
      });
      analysis.circuitType.type = coerced as typeof analysis.circuitType.type;
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
      isUniversalAc && Boolean(analysis?.circuitType?.params?.acDcSuperposition);
    // switched_rlc_*는 v_C(t) 응답이 학생 도출 정답이라 waveform figure를 안 만듦 (학습 의도).
    //  → state_before/state_after figure로 시간 변화 표현 → hasWaveformEvolution=false 강제로 waveform required 면제.
    const isSwitchedRlc =
      analysis?.circuitType?.type === "switched_rlc_5leg" ||
      analysis?.circuitType?.type === "switched_rlc_step";
    // 스위치 RL + 종속전원(2i_A) 과도응답 (임용 7번) — v_o(t)는 학생 도출 정답 → waveform figure 불필요.
    const isSwitchedRlDep =
      (analysis?.circuitType?.type === "switched_rl" || analysis?.circuitType?.type === "rl_step") &&
      (analysis?.componentInventory ?? []).some((c) => ["CCVS", "CCCS", "VCVS", "VCCS"].includes(String(c.type)));
    // bjt_characteristic_curve는 개념·도식 해석형 — 시간영역 파형 없음, 회로 netlist 없음.
    //  단일 characteristic_curve figure 1장으로 충분.
    const isCharacteristicCurve = analysis?.circuitType?.type === "bjt_characteristic_curve";
    const isSwStatePair =
      rawSemantic.hasWaveformEvolution &&
      !hasCapOrIndInCircuit &&
      Boolean(analysis?.topologySignature?.features?.hasSwitch);
    // ac_superposition은 phasor 정상상태 해석이라 waveform figure 불필요 → hasWaveformEvolution=false 강제
    // bjt_characteristic_curve는 회로/파형 없는 graph 해석 — 모든 multi-figure 의무 면제
    // rlc_resonance_max_power는 phasor 정상상태 — waveform 면제
    const expectedSemantic: SemanticStructure = isCharacteristicCurve
      ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false, requiresMultiFigure: false }
      : isAcDcSuperposition
        ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false }
        : isRlcResonanceMaxPower
          ? { ...rawSemantic, hasWaveformEvolution: false }
          : isUniversalAc
            ? { ...rawSemantic, hasWaveformEvolution: false }
            : isSwitchedRlDep
              ? { ...rawSemantic, hasWaveformEvolution: false, hasStateTransition: false }
              : isSwStatePair || (rawSemantic.hasWaveformEvolution && (isAcSuperposition || isSwitchedRlc))
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
    const ruleSet = resolveRules({
      subject: subjectKey,
      topicKey: ruleTopicKey,
      semantic: expectedSemantic,
      circuitType: analysis?.circuitType?.type,
      circuitTypeParams: analysis?.circuitType?.params,
    });

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

    // ★ subject-first 가드 — 모든 dispatch 분기는 circuitType + subjectKey 둘 다 일치를 요구한다.
    //   디지털 문제(조합논리·진리표 등)를 컴포넌트 인벤토리 추출이 R 다발로 오인해 회로이론
    //   circuitType(dc_nodal 등)으로 분류하면, subjectKey=digital_logic과 짝이 맞는 분기가 하나도
    //   없어 제네릭 GPT fallback으로 떨어진다(아날로그 repair 루프 → 품질 저하·family 불일치).
    //   사용자가 고른 subject를 신뢰해, digital_logic인데 circuitType이 디지털 계열이 아니면
    //   범용 디지털 파이프라인(universal_digital)으로 보정한다.
    const DIGITAL_CIRCUIT_TYPES = new Set([
      "universal_digital", "sequential_dff_generic", "kmap_sop", "kmap_pos",
      "flipflop_mixed_app", "tff_state_table_blank", "ff_with_waveform",
      "flipflop_counter", "combinational_gate", "sequence_detector", "fsm",
      "waveform_analysis", "mux_implementation",
    ]);
    if (subjectKey === "digital_logic" && (!circuitType || !DIGITAL_CIRCUIT_TYPES.has(circuitType))) {
      log.warn("digital_subject_circuittype_coerced", { from: circuitType, to: "universal_digital" });
      circuitType = "universal_digital" as typeof circuitType;
    }

    // ★ subject-first 가드 (mixed_signal) — FF + DAC + OPAMP 복합형(임용8 JK카운터·임용10 D시프트레지스터)이
    //   Vision 비결정성으로 sequential_dff_generic(디지털) 등으로 분류되면 mixed_signal 분기와 안 맞아
    //   제네릭 fallback으로 추락한다. mixed_signal인데 circuitType이 mixed_signal 계열이 아니면
    //   counter_dac_comparator로 보정 (파이프라인이 D시프트/JK카운터를 구조 도출로 분기).
    const MIXED_SIGNAL_CIRCUIT_TYPES = new Set([
      "counter_dac_comparator", "adc_sample_hold", "logic_opamp_hybrid",
    ]);
    if (subjectKey === "mixed_signal" && (!circuitType || !MIXED_SIGNAL_CIRCUIT_TYPES.has(circuitType))) {
      log.warn("mixed_signal_circuittype_coerced", { from: circuitType, to: "counter_dac_comparator" });
      circuitType = "counter_dac_comparator" as typeof circuitType;
    }

    let problems: GeneratedProblem[];
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
    if (isSwitchedRlDependent) {
      log.info("dispatch", { route: "switched_rl_dependent_pipeline", count: n, mode });
      problems = await runSwitchedRlDependentPipeline({
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
        analysis.topologySignature.features,
        analysis.topologySignature.branches?.length ?? 0,
        analysis.componentInventory?.length ?? 0,
      )
    ) {
      log.info("dispatch", {
        route: "topology_driven_pipeline",
        count: n,
        mode,
        reason: "archetype/topology mismatch (hybrid·branchCount·inventory 중 하나)",
        features: analysis.topologySignature.features,
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
        throw new GenerateError(
          "ARCHETYPE_DETECTION_FAILED: OPAMP family detected but archetype uncertain — free OPAMP generation is disabled. " +
          "원본 이미지/문제 텍스트에 archetype을 식별할 단서가 부족합니다 (예: '반전', '비반전', '발진', '피드백', 'RC 회로망' 등).",
        );
      }
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
    } else if (circuitType === "opamp_time_domain" && subjectKey === "electronics") {
      log.info("dispatch", { route: "opamp_time_domain_pipeline", count: n, mode });
      problems = await runOpampTimeDomainPipeline({
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
    } else if (circuitType === "bjt_bias" && subjectKey === "electronics") {
      log.info("dispatch", { route: "bjt_bias_pipeline", count: n, mode });
      problems = await runBjtBiasPipeline({
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
    for (const p of problems) {
      const pv = validateProblem({
        problem: p,
        expected: { subject: subjectKey, topicKey: expectedTopicKey, ruleSet },
      });
      const fv = validateFigures(p.figureVariants ?? []);
      const sv = validateAnswerSolution({ answer: p.answer, solution: p.solution });
      const solutionResult = { ok: sv.length === 0, issues: sv };
      validations.push({ problemId: p.id, problem: pv, figures: fv, solution: solutionResult });
      totalIssues += pv.issues.length + fv.issues.length;
      solutionWarnings += sv.length;
    }
    log.info("validation", { mode, returned: problems.length, totalIssues, solutionWarnings });

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
  if (circuitType === "universal_dc") return false;
  if (circuitType === "universal_ac") return false;
  if (circuitType === "ac_superposition") return false;
  // rlc_resonance도 전용 generator(공진곡선 figure 포함) 보존 — topology_driven은 회로만 만들고
  // 주파수응답 곡선 figure를 모르므로 fallback 금지.
  if (circuitType === "rlc_resonance") return false;
  if (circuitType === "rlc_resonance_max_power") return false;
  // switched_rlc_step·switched_rlc_5leg 모두 전용 generator 보존.
  if (circuitType === "switched_rlc_step") return false;
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
  // thevenin_dependent_generic도 GPT 구조추출 + 종속원 보존 경로 — topology-driven 우회.
  if (circuitType === "thevenin_dependent_generic") return false;

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

