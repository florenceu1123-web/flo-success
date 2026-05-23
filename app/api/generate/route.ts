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
import { runSwitchedRlcStepPipeline } from "@/lib/pipeline/runSwitchedRlcStepPipeline";
import { runSwitchedRlc5legPipeline } from "@/lib/pipeline/runSwitchedRlc5legPipeline";
import { runDcSupermeshPipeline } from "@/lib/pipeline/runDcSupermeshPipeline";
import { runDcSupernodePipeline } from "@/lib/pipeline/runDcSupernodePipeline";
import { runDcDependentSourcePipeline } from "@/lib/pipeline/runDcDependentSourcePipeline";
import { runAcSuperpositionPipeline } from "@/lib/pipeline/runAcSuperpositionPipeline";
import { runAcParallelBranchesPipeline } from "@/lib/pipeline/runAcParallelBranchesPipeline";
import { runMaxPowerTransferPipeline } from "@/lib/pipeline/runMaxPowerTransferPipeline";
import { runSwitchingCircuitPipeline } from "@/lib/pipeline/runSwitchingCircuitPipeline";
import { runOpampPipeline } from "@/lib/pipeline/runOpampPipeline";
import { runOpampTimeDomainPipeline } from "@/lib/pipeline/runOpampTimeDomainPipeline";
import { runBjtSmallSignalPipeline } from "@/lib/pipeline/runBjtSmallSignalPipeline";
import { runBjtBiasPipeline } from "@/lib/pipeline/runBjtBiasPipeline";
import { runMosfetBiasPipeline } from "@/lib/pipeline/runMosfetBiasPipeline";
import { runMosfetCascodeMirrorPipeline } from "@/lib/pipeline/runMosfetCascodeMirrorPipeline";
import { runCounterDacComparatorPipeline } from "@/lib/pipeline/runCounterDacComparatorPipeline";
import { runKmapSopPipeline } from "@/lib/pipeline/runKmapSopPipeline";
import { runKmapPosPipeline } from "@/lib/pipeline/runKmapPosPipeline";
import { runFlipflopCounterPipeline } from "@/lib/pipeline/runFlipflopCounterPipeline";
import { runFfWithWaveformPipeline } from "@/lib/pipeline/runFfWithWaveformPipeline";
import { runFlipflopMixedPipeline } from "@/lib/pipeline/runFlipflopMixedPipeline";
import { runCombinationalGatePipeline } from "@/lib/pipeline/runCombinationalGatePipeline";
import { runFsmPipeline } from "@/lib/pipeline/runFsmPipeline";
import { runWaveformAnalysisPipeline } from "@/lib/pipeline/runWaveformAnalysisPipeline";
import { runTopologyDrivenPipeline } from "@/lib/pipeline/runTopologyDrivenPipeline";
import { runUniversalDcPipeline } from "@/lib/pipeline/runUniversalDcPipeline";
import { runUniversalAcPipeline } from "@/lib/pipeline/runUniversalAcPipeline";
import {
  GENERATION_POLICIES,
  SUBJECT_KEYS,
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

    // analysis에서 topicKey/semantic을 우선 활용 (body의 명시 값이 있으면 그것 우선)
    const expectedTopicKey: TopicKey | undefined = body.topicKey ?? analysis?.topicKey;
    const rawSemantic: SemanticStructure = body.semantic ?? analysis?.semantic ?? DEFAULT_SEMANTIC;

    const subjectKey = subject as SubjectKey;
    // ── semantic normalize: SW만 있고 C/L이 없는 두 정상상태 비교 케이스는
    //    waveform 응답이 아니므로 hasWaveformEvolution을 false로 (analyze가 SW
    //    swiching을 timing 변화로 잘못 marking할 때가 잦아 ruleSet의 waveform required
    //    조건이 false-positive로 figure 누락 issue를 일으킴).
    const inventory = analysis?.componentInventory ?? [];
    const hasCapOrIndInCircuit = inventory.some((c) => c.type === "C" || c.type === "L");
    const isAcSuperposition = analysis?.circuitType?.type === "ac_superposition" ||
      analysis?.circuitType?.type === "ac_parallel_branches";
    // switched_rlc_*는 v_C(t) 응답이 학생 도출 정답이라 waveform figure를 안 만듦 (학습 의도).
    //  → state_before/state_after figure로 시간 변화 표현 → hasWaveformEvolution=false 강제로 waveform required 면제.
    const isSwitchedRlc =
      analysis?.circuitType?.type === "switched_rlc_5leg" ||
      analysis?.circuitType?.type === "switched_rlc_step";
    const isSwStatePair =
      rawSemantic.hasWaveformEvolution &&
      !hasCapOrIndInCircuit &&
      Boolean(analysis?.topologySignature?.features?.hasSwitch);
    // ac_superposition은 phasor 정상상태 해석이라 waveform figure 불필요 → hasWaveformEvolution=false 강제
    const expectedSemantic: SemanticStructure =
      isSwStatePair || (rawSemantic.hasWaveformEvolution && (isAcSuperposition || isSwitchedRlc))
        ? { ...rawSemantic, hasWaveformEvolution: false }
        : rawSemantic;
    if (expectedSemantic !== rawSemantic) {
      log.info("semantic_normalized", {
        reason: isAcSuperposition
          ? "ac_superposition (phasor 정상상태) → hasWaveformEvolution=false"
          : isSwitchedRlc
            ? "switched_rlc_* (v_C(t)는 학생 도출 정답) → hasWaveformEvolution=false"
            : "SW state pair without C/L → hasWaveformEvolution=false",
      });
    }

    const ruleSet = resolveRules({
      subject: subjectKey,
      topicKey: expectedTopicKey,
      semantic: expectedSemantic,
      circuitType: analysis?.circuitType?.type,
    });

    // ★ Circuit-type 기반 dispatch — 결정론 파이프라인을 가진 type은 그쪽으로.
    // 현 phase: thevenin, norton. 나머지는 기존 free/strict 경로.
    const circuitType = analysis?.circuitType?.type;
    let problems: GeneratedProblem[];
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
      log.info("dispatch", { route: "universal_ac_pipeline", count: n, mode });
      if (!analysis?.topologySignature) {
        return NextResponse.json({ error: "universal_ac는 topologySignature 필수" }, { status: 400 });
      }
      problems = await runUniversalAcPipeline({
        analysis,
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
    } else if (circuitType === "opamp" && subjectKey === "electronics") {
      log.info("dispatch", { route: "opamp_pipeline", count: n, mode });
      problems = await runOpampPipeline({
        analysis: analysis ?? null,
        mode: mode as GenerationMode,
        count: n,
        topicKey: expectedTopicKey,
      });
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
  // switched_rlc_step·switched_rlc_5leg 모두 전용 generator 보존.
  if (circuitType === "switched_rlc_step") return false;
  if (circuitType === "switched_rlc_5leg") return false;
  if (circuitType === "ac_parallel_branches") return false;

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
