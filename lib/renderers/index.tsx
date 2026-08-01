import type { ReactNode } from "react";
import type {
  BlockDiagram,
  CharacteristicCurveDiagram,
  CircuitNetlist,
  DiagramType,
  FigureVariant,
  KmapDiagram,
  LogicNetworkDiagram,
  MixedCircuitDiagram,
  MuxDiagram,
  MuxGarCircuitDiagram,
  RlcResonanceMaxPowerCircuitDiagram,
} from "@/types";
import type { Imyong10DcNodalStructure } from "@/lib/analog/archetypeRegistry";
import { renderImyong10DcNodalCircuit } from "./imyong10DcNodalCircuit";
import { DiagramMissing, FigureHeader, PlaceholderFigure } from "./_placeholder";
import { renderAnalogMeshSVG } from "./analogMeshRenderer";
import { renderBlockDiagramSVG } from "./blockDiagramRenderer";
import { renderInductorRampCircuit, type InductorRampCircuitDiagram } from "./inductorRampCircuitRenderer";
import { renderCharacteristicCurveSVG } from "./characteristicCurveRenderer";
import { renderConceptDiagramSVG } from "./conceptDiagramRenderer";
import { renderKmapSVG } from "./kmapRenderer";
import { renderLogicNetworkSVG } from "./logicNetworkRenderer";
import { renderMixedCircuitSVG } from "./mixedCircuitRenderer";
import { renderMuxDiagramSVG } from "./muxDiagramRenderer";
import { renderMuxGarCircuitSVG } from "./muxGarCircuitRenderer";
import { renderRlcResonanceMaxPowerCircuitSVG } from "./rlcResonanceMaxPowerCircuitRenderer";
import {
  renderSequenceBlock,
  renderSequenceStateDiagram,
  renderSequenceStateTable,
  type SequenceBlockDiagram,
  type SequenceStateDiagram,
  type SequenceStateTable,
} from "./sequenceDetectorRenderer";
import {
  renderTheveninOriginal,
  renderTheveninEquivalent,
  type TheveninOriginalDiagram,
  type TheveninEquivalentDiagram,
} from "./theveninSwitchedRcRenderer";
import {
  renderOpampCascade,
  type OpampCascadeDiagram,
} from "./opampCascadeRenderer";
import { renderViLineGraph } from "./viLineGraphRenderer";
import { renderSrFfMuxSequentialCircuit } from "./srFfMuxSequentialCircuitRenderer";
import { renderAcDcSuperpositionRcCircuit } from "./acDcSuperpositionRcCircuitRenderer";
import { renderAcDcSuperpositionRcDualCircuit } from "./acDcSuperpositionRcDualCircuitRenderer";
import { renderViTheveninMaxPowerCircuit } from "./viTheveninMaxPowerCircuitRenderer";
import { renderFlashAdc2bitCircuit } from "./flashAdc2bitCircuitRenderer";
import { renderZenerBjtRegulatorCircuit } from "./zenerBjtRegulatorCircuitRenderer";
import { renderBjtTwoStageSwitchedCircuit } from "./bjtTwoStageSwitchedCircuitRenderer";
import { renderOpampTwoInputCascade, renderOpampTwoInputDiff } from "./opampTwoInputDiffRenderer";
import { renderDffMuxSequentialCircuit } from "./dffMuxSequentialCircuitRenderer";
import { renderFfMixedAppCircuit } from "./ffMixedAppCircuitRenderer";
import { renderOpampSeriesRegulatorCircuit } from "./opampSeriesRegulatorCircuitRenderer";
import { renderActiveLowpassFilterCircuit } from "./activeLowpassFilterCircuitRenderer";
import { renderOpampSummerCircuit } from "./opampSummerCircuitRenderer";
import { renderAsyncPresetCounterCircuit } from "./asyncPresetCounterCircuitRenderer";
import { renderRlcResonanceBandwidthCircuit } from "./rlcResonanceBandwidthCircuitRenderer";
import { renderRlcResonanceBandwidthDualCircuit } from "./rlcResonanceBandwidthDualCircuitRenderer";
import { renderOpampTwoStage } from "./opampTwoStageCircuitRenderer";
import { renderFunctionGenerator } from "./functionGeneratorCircuitRenderer";
import { renderOpampFiniteGainCircuit } from "./opampFiniteGainCircuitRenderer";
import { renderOpampFiniteGainOffsetCircuit } from "./opampFiniteGainOffsetCircuitRenderer";
import { renderOpampLoopGainStabilityCircuit } from "./opampLoopGainStabilityCircuitRenderer";
import { renderOpampThreeStageSumCircuit } from "./opampThreeStageSumCircuitRenderer";
import { renderAcBridgeCircuit, renderAcBridgeThevenin } from "./acBridgeCircuitRenderer";
import { renderAcTheveninLadderCircuit, renderAcTheveninEquivCircuit } from "./acTheveninLadderCircuitRenderer";
import { renderDcThevenin2srcCircuit, renderDcTheveninEquivCircuit } from "./dcTheveninTwoSourceCircuitRenderer";
import { renderDcWheatstoneBalanceCircuit } from "./dcWheatstoneBalanceCircuitRenderer";
import { renderAcSuperpositionSourceDesignCircuit } from "./acSuperpositionSourceDesignCircuitRenderer";
import { renderJkExcitationCircuit } from "./jkExcitationCircuitRenderer";
import { renderModNCounterCircuit } from "./modNCounterCircuitRenderer";
import { renderNumberRing } from "./numberRingRenderer";
import { renderDemuxCircuit } from "./demuxCircuitRenderer";
import { renderAcPowerFactorCircuit } from "./acPowerFactorCircuitRenderer";
import { renderAcAdmittanceResonanceCircuit, renderAcAdmittanceResonanceDualCircuit } from "./acAdmittanceResonanceCircuitRenderer";
import { renderAcVccsPhasorCircuit } from "./acVccsPhasorCircuitRenderer";
import { renderSwitchedRcDcCircuit } from "./switchedRcDcCircuitRenderer";
import { renderSwitchedRlSourceSwitchCircuit } from "./switchedRlSourceSwitchCircuitRenderer";
import { renderDffStateDesignCircuit } from "./dffStateDesignCircuitRenderer";
import { renderJkSyncCounterCircuit } from "./jkSyncCounterCircuitRenderer";
import { renderJkStateMachineCircuit } from "./jkStateMachineCircuitRenderer";
import { renderJkStateMachineVariantCircuit } from "./jkStateMachineVariantCircuitRenderer";
import { renderJkStateDiagram } from "./jkStateDiagramRenderer";
import { renderCleanCounter } from "./cleanCounterRenderer";
import { renderScrTurnOnCircuit } from "./scrTurnOnCircuitRenderer";
import { renderReactiveViIntegralCircuit } from "./reactiveViIntegralCircuitRenderer";
import { renderSupermeshSwitchedDependentCircuit } from "./supermeshSwitchedDependentCircuitRenderer";
import { renderTruthTable } from "./truth_table";
import { renderWaveform } from "./waveform";
import { renderEmFieldDiagram } from "./emFieldRenderer";
import type { EmFieldDiagram } from "@/lib/generation/topologies/electromagnetics";
import { renderCodeBlock } from "./codeBlockRenderer";
import { renderCommDiagram } from "./commDiagramRenderer";
import type { CommDiagram } from "@/types";

/**
 * 메인 dispatch — diagramType별 전용 renderer.
 * SVG 문자열을 반환하는 renderer는 dangerouslySetInnerHTML로 React에 노출.
 * React JSX를 반환하는 renderer는 그대로 children으로.
 */
export function renderFigure(figure: FigureVariant): ReactNode {
  if (!figure.diagram) return <DiagramMissing figure={figure} />;

  const dt = figure.diagramType as DiagramType;

  switch (dt) {
    case "kmap":
      return wrapSvg(figure, renderKmapSVG(figure.diagram as KmapDiagram));
    case "logic_network":
      return wrapSvg(figure, renderLogicNetworkSVG(figure.diagram as LogicNetworkDiagram));
    case "analog_netlist":
      // 2-rail mesh layout 우선 시도, 적합하지 않으면 내부에서 edge renderer로 fallback
      return wrapSvg(figure, renderAnalogMeshSVG(figure.diagram as CircuitNetlist));
    case "analog_mesh_network":
      return wrapSvg(figure, renderAnalogMeshSVG(figure.diagram as CircuitNetlist));
    case "truth_table":
      return renderTruthTable(figure);
    case "waveform":
      return renderWaveform(figure);
    case "concept_diagram":
      return wrapSvg(figure, renderConceptDiagramSVG(figure.diagram as Parameters<typeof renderConceptDiagramSVG>[0]));
    case "block_diagram":
      return wrapSvg(figure, renderBlockDiagramSVG(figure.diagram as BlockDiagram));
    case "mixed_circuit":
      return wrapSvg(figure, renderMixedCircuitSVG(figure.diagram as MixedCircuitDiagram));
    case "characteristic_curve":
      return wrapSvg(figure, renderCharacteristicCurveSVG(figure.diagram as CharacteristicCurveDiagram));
    case "mux_diagram":
      return wrapSvg(figure, renderMuxDiagramSVG(figure.diagram as MuxDiagram));
    case "imyong_10_dc_nodal":
      return wrapSvg(figure, renderImyong10DcNodalCircuit(figure.diagram as Imyong10DcNodalStructure));
    case "mux_gar_circuit":
      return wrapSvg(figure, renderMuxGarCircuitSVG(figure.diagram as MuxGarCircuitDiagram));
    case "rlc_resonance_max_power_circuit":
      return wrapSvg(figure, renderRlcResonanceMaxPowerCircuitSVG(figure.diagram as RlcResonanceMaxPowerCircuitDiagram));
    case "sequence_block":
      return wrapSvg(figure, renderSequenceBlock(figure.diagram as SequenceBlockDiagram));
    case "sequence_state_diagram":
      return wrapSvg(figure, renderSequenceStateDiagram(figure.diagram as SequenceStateDiagram));
    case "sequence_state_table":
      return wrapSvg(figure, renderSequenceStateTable(figure.diagram as SequenceStateTable));
    case "thevenin_original_circuit":
      return wrapSvg(figure, renderTheveninOriginal(figure.diagram as TheveninOriginalDiagram));
    case "inductor_ramp_circuit":
      return wrapSvg(figure, renderInductorRampCircuit(figure.diagram as unknown as InductorRampCircuitDiagram));
    case "thevenin_equivalent_circuit":
      return wrapSvg(figure, renderTheveninEquivalent(figure.diagram as TheveninEquivalentDiagram));
    case "opamp_cascade":
      return wrapSvg(figure, renderOpampCascade(figure.diagram as OpampCascadeDiagram));
    case "sr_ff_mux_sequential_circuit":
      return wrapSvg(figure, renderSrFfMuxSequentialCircuit(figure.diagram as import("@/types").SrFfMuxSequentialCircuitDiagram));
    case "ac_dc_superposition_rc_circuit":
      return wrapSvg(figure, renderAcDcSuperpositionRcCircuit(figure.diagram as import("@/types").AcDcSuperpositionRcCircuitDiagram));
    case "ac_dc_superposition_rc_dual_circuit":
      return wrapSvg(figure, renderAcDcSuperpositionRcDualCircuit(figure.diagram as import("@/types").AcDcSuperpositionRcDualCircuitDiagram));
    case "vi_thevenin_maxpower_circuit":
      return wrapSvg(figure, renderViTheveninMaxPowerCircuit(figure.diagram as import("@/types").ViTheveninMaxPowerCircuitDiagram));
    case "flash_adc_2bit_circuit":
      return wrapSvg(figure, renderFlashAdc2bitCircuit(figure.diagram as import("@/types").FlashAdc2bitCircuitDiagram));
    case "zener_bjt_regulator_circuit":
      return wrapSvg(figure, renderZenerBjtRegulatorCircuit(figure.diagram as import("@/types").ZenerBjtRegulatorCircuitDiagram));
    case "bjt_two_stage_switched_circuit":
      return wrapSvg(figure, renderBjtTwoStageSwitchedCircuit(figure.diagram as import("@/types").BjtTwoStageSwitchedCircuitDiagram));
    case "opamp_two_input_cascade":
      return wrapSvg(figure, renderOpampTwoInputCascade(figure.diagram as import("@/types").OpampTwoInputCascadeDiagram));
    case "opamp_two_input_diff":
      return wrapSvg(figure, renderOpampTwoInputDiff(figure.diagram as import("@/types").OpampTwoInputDiffDiagram));
    case "dff_mux_sequential_circuit":
      return wrapSvg(figure, renderDffMuxSequentialCircuit(figure.diagram as import("@/types").DffMuxSequentialCircuitDiagram));
    case "ff_mixed_app_circuit":
      return wrapSvg(figure, renderFfMixedAppCircuit(figure.diagram as import("@/types").FfMixedAppCircuitDiagram));
    case "opamp_series_regulator_circuit":
      return wrapSvg(figure, renderOpampSeriesRegulatorCircuit(figure.diagram as import("@/types").OpampSeriesRegulatorCircuitDiagram));
    case "active_lowpass_filter_circuit":
      return wrapSvg(figure, renderActiveLowpassFilterCircuit(figure.diagram as import("@/types").ActiveLowpassFilterCircuitDiagram));
    case "opamp_summer_circuit":
      return wrapSvg(figure, renderOpampSummerCircuit(figure.diagram as import("@/types").OpampSummerCircuitDiagram));
    case "async_preset_counter_circuit":
      return wrapSvg(figure, renderAsyncPresetCounterCircuit(figure.diagram as import("@/types").AsyncPresetCounterCircuitDiagram));
    case "rlc_resonance_bandwidth_circuit":
      return wrapSvg(figure, renderRlcResonanceBandwidthCircuit(figure.diagram as import("@/types").RlcResonanceBandwidthCircuitDiagram));
    case "rlc_resonance_bandwidth_dual_circuit":
      return wrapSvg(figure, renderRlcResonanceBandwidthDualCircuit(figure.diagram as import("@/types").RlcResonanceBandwidthDualCircuitDiagram));
    case "opamp_two_stage_circuit":
      return wrapSvg(figure, renderOpampTwoStage(figure.diagram as import("@/types").OpampTwoStageCircuitDiagram));
    case "function_generator_circuit":
      return wrapSvg(figure, renderFunctionGenerator(figure.diagram as import("@/types").FunctionGeneratorCircuitDiagram));
    case "opamp_finite_gain_circuit":
      return wrapSvg(figure, renderOpampFiniteGainCircuit(figure.diagram as import("@/types").OpampFiniteGainCircuitDiagram));
    case "opamp_finite_gain_offset_circuit":
      return wrapSvg(figure, renderOpampFiniteGainOffsetCircuit(figure.diagram as import("@/types").OpampFiniteGainOffsetCircuitDiagram));
    case "opamp_loop_gain_circuit":
      return wrapSvg(figure, renderOpampLoopGainStabilityCircuit(figure.diagram as import("@/types").OpampLoopGainCircuitDiagram));
    case "opamp_three_stage_sum_circuit":
      return wrapSvg(figure, renderOpampThreeStageSumCircuit(figure.diagram as import("@/types").OpampThreeStageSumCircuitDiagram));
    case "ac_bridge_circuit":
      return wrapSvg(figure, renderAcBridgeCircuit(figure.diagram as import("@/types").AcBridgeCircuitDiagram));
    case "ac_bridge_thevenin_circuit":
      return wrapSvg(figure, renderAcBridgeThevenin(figure.diagram as import("@/types").AcBridgeTheveninCircuitDiagram));
    case "ac_thevenin_ladder_circuit":
      return wrapSvg(figure, renderAcTheveninLadderCircuit(figure.diagram as import("@/types").AcTheveninLadderCircuitDiagram));
    case "ac_thevenin_equiv_circuit":
      return wrapSvg(figure, renderAcTheveninEquivCircuit(figure.diagram as import("@/types").AcTheveninEquivCircuitDiagram));
    case "dc_thevenin_2src_circuit":
      return wrapSvg(figure, renderDcThevenin2srcCircuit(figure.diagram as import("@/types").DcThevenin2srcCircuitDiagram));
    case "dc_thevenin_equiv_circuit":
      return wrapSvg(figure, renderDcTheveninEquivCircuit(figure.diagram as import("@/types").DcTheveninEquivCircuitDiagram));
    case "demux_circuit":
      return wrapSvg(figure, renderDemuxCircuit(figure.diagram as import("@/types").DemuxCircuitDiagram));
    case "number_ring_diagram":
      return wrapSvg(figure, renderNumberRing(figure.diagram as import("@/types").NumberRingDiagram));
    case "mod_n_counter_circuit":
      return wrapSvg(figure, renderModNCounterCircuit(figure.diagram as import("@/types").ModNCounterCircuitDiagram));
    case "jk_excitation_circuit":
      return wrapSvg(figure, renderJkExcitationCircuit(figure.diagram as import("@/types").JkExcitationCircuitDiagram));
    case "ac_superposition_source_design_circuit":
      return wrapSvg(figure, renderAcSuperpositionSourceDesignCircuit(figure.diagram as import("@/types").AcSuperpositionSourceDesignCircuitDiagram));
    case "dc_wheatstone_balance_circuit":
      return wrapSvg(figure, renderDcWheatstoneBalanceCircuit(figure.diagram as import("@/types").DcWheatstoneBalanceCircuitDiagram));
    case "ac_power_factor_circuit":
      return wrapSvg(figure, renderAcPowerFactorCircuit(figure.diagram as import("@/types").AcPowerFactorCircuitDiagram));
    case "ac_admittance_resonance_circuit":
      return wrapSvg(figure, renderAcAdmittanceResonanceCircuit(figure.diagram as import("@/types").AcAdmittanceResonanceCircuitDiagram));
    case "ac_admittance_resonance_dual_circuit":
      return wrapSvg(figure, renderAcAdmittanceResonanceDualCircuit(figure.diagram as import("@/types").AcAdmittanceResonanceDualCircuitDiagram));
    case "ac_vccs_phasor_circuit":
      return wrapSvg(figure, renderAcVccsPhasorCircuit(figure.diagram as import("@/types").AcVccsPhasorCircuitDiagram));
    case "switched_rc_dc_circuit":
      return wrapSvg(figure, renderSwitchedRcDcCircuit(figure.diagram as import("@/types").SwitchedRcDcCircuitDiagram));
    case "switched_rl_dual_src_circuit":
      return wrapSvg(figure, renderSwitchedRlSourceSwitchCircuit(figure.diagram as import("@/types").SwitchedRlDualSrcCircuitDiagram));
    case "dff_state_design_circuit":
      return wrapSvg(figure, renderDffStateDesignCircuit(figure.diagram as import("@/types").DffStateDesignCircuitDiagram));
    case "jk_sync_counter_circuit":
      return wrapSvg(figure, renderJkSyncCounterCircuit(figure.diagram as import("@/types").JkSyncCounterCircuitDiagram));
    case "jk_state_machine_circuit":
      return wrapSvg(figure, renderJkStateMachineCircuit(figure.diagram as import("@/types").JkStateMachineCircuitDiagram));
    case "jk_state_machine_variant_circuit":
      return wrapSvg(figure, renderJkStateMachineVariantCircuit(figure.diagram as import("@/types").JkStateMachineVariantCircuitDiagram));
    case "jk_state_diagram":
      return wrapSvg(figure, renderJkStateDiagram(figure.diagram as import("@/types").JkStateDiagram));
    case "clean_counter_circuit":
      return wrapSvg(figure, renderCleanCounter(figure.diagram as LogicNetworkDiagram));
    case "scr_turn_on_circuit":
      return wrapSvg(figure, renderScrTurnOnCircuit(figure.diagram as import("@/types").ScrTurnOnCircuitDiagram));
    case "reactive_vi_integral_circuit":
      return wrapSvg(figure, renderReactiveViIntegralCircuit(figure.diagram as import("@/types").ReactiveViIntegralCircuitDiagram));
    case "supermesh_switched_dependent_circuit":
      return wrapSvg(figure, renderSupermeshSwitchedDependentCircuit(figure.diagram as import("@/types").SupermeshSwitchedDependentCircuitDiagram));
    case "vi_line_graph":
      return wrapSvg(figure, renderViLineGraph(figure.diagram as Parameters<typeof renderViLineGraph>[0]));
    case "em_field_diagram":
      return wrapSvg(figure, renderEmFieldDiagram(figure.diagram as EmFieldDiagram));
    case "code_block":
      // C언어 코드 스니펫 — React node를 직접 반환 (truth_table·waveform과 동일 패턴)
      return renderCodeBlock(figure);
    case "comm_diagram":
      return wrapSvg(figure, renderCommDiagram(figure.diagram as CommDiagram));
    default:
      return (
        <pre className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          unsupported diagramType: {String(figure.diagramType)}
        </pre>
      );
  }
}

function wrapSvg(figure: FigureVariant, svg: string) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3 space-y-2">
      <FigureHeader figure={figure} />
      <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

// 기존 호환을 위해 PlaceholderFigure도 re-export
export { PlaceholderFigure };
