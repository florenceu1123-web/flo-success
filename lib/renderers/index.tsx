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
import { renderBjtEarlyStructureSVG, renderBjtEarlyCurveSVG } from "./bjtEarlyEffectRenderer";
import { renderR2rLadderDacCircuit } from "./r2rLadderDacCircuitRenderer";
import { renderJfetDepletionPanels } from "./jfetDepletionPanelsRenderer";
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
import { renderAcDeltaWyeBridgeCircuit, renderAcDeltaWyeEquivCircuit } from "./acDeltaWyeBridgeCircuitRenderer";
import { renderOscilloscopeScreen, renderOscilloscopePhaseCircuit } from "./oscilloscopePhaseCircuitRenderer";
import { renderAcTwoSourceMeshCircuit } from "./acTwoSourceMeshCircuitRenderer";
import { renderTheveninDepGraphCircuit } from "./theveninDepGraphCircuitRenderer";
import { renderOpampAvgSuperpositionCircuit } from "./opampAvgSuperpositionCircuitRenderer";
import { renderAcTheveninLadderCircuit, renderAcTheveninEquivCircuit } from "./acTheveninLadderCircuitRenderer";
import { renderAcTheveninDepCircuit, renderAcTheveninDepEquivCircuit } from "./acTheveninDependentCircuitRenderer";
import { renderAcTheveninDesignAbCircuit } from "./acTheveninDesignAbCircuitRenderer";
import { renderZenerShuntRegulatorCircuit } from "./zenerShuntRegulatorCircuitRenderer";
import { renderSwitchedRlcSourceFreeCircuit } from "./switchedRlcSourceFreeCircuitRenderer";
import { renderRlcStateEquationCircuit } from "./rlcStateEquationCircuitRenderer";
import { renderSwitchedRlcDualSwitchCircuit } from "./switchedRlcDualSwitchCircuitRenderer";
import { renderOpampTwoStageRxCircuit } from "./opampTwoStageRxCircuitRenderer";
import { renderDcTwoSourceLadderCircuit } from "./dcTwoSourceLadderCircuitRenderer";
import { renderBjtTheveninBiasCircuit } from "./bjtTheveninBiasCircuitRenderer";
import { renderBjtSwitchLogicCircuit } from "./bjtSwitchLogicCircuitRenderer";
import { renderComparatorDiodeOrCircuit } from "./comparatorDiodeOrCircuitRenderer";
import { renderOpampSummerTFeedbackCircuit } from "./opampSummerTFeedbackCircuitRenderer";
import { renderAcTheveninTwoBoxCircuit } from "./acTheveninTwoBoxCircuitRenderer";
import { renderDiodeClamperCircuit, renderDiodeClamperWaveform } from "./diodeClamperCircuitRenderer";
import { renderDcThevenin2srcCircuit, renderDcTheveninEquivCircuit } from "./dcTheveninTwoSourceCircuitRenderer";
import { renderDcWheatstoneBalanceCircuit } from "./dcWheatstoneBalanceCircuitRenderer";
import { renderAcSuperpositionSourceDesignCircuit } from "./acSuperpositionSourceDesignCircuitRenderer";
import { renderJkExcitationCircuit } from "./jkExcitationCircuitRenderer";
import { renderDffPresetClearCircuit } from "./dffPresetClearCircuitRenderer";
import { renderSwitchedRlDualShortCircuit } from "./switchedRlDualShortCircuitRenderer";
import { renderTwoSourceRlSuperpositionCircuit } from "./twoSourceRlSuperpositionCircuitRenderer";
import { renderAcDcSourceSuperpositionCircuit } from "./acDcSourceSuperpositionCircuitRenderer";
import { renderRlcAntiresonanceLadderCircuit } from "./rlcAntiresonanceLadderCircuitRenderer";
import { renderJkTwoPhaseClockCircuit } from "./jkTwoPhaseClockCircuitRenderer";
import { renderMaxPowerTwoSourceCircuit } from "./maxPowerTwoSourceCircuitRenderer";
import { renderModNCounterCircuit } from "./modNCounterCircuitRenderer";
import { renderTff3CounterCircuit } from "./tff3CounterCircuitRenderer";
import { renderJfetBiasCircuit } from "./jfetBiasCircuitRenderer";
import { renderOpampRcTOscillator } from "./opampRcTOscillatorRenderer";
import { renderAcRlAveragePowerCircuit } from "./acRlAveragePowerCircuitRenderer";
import { renderNumberRing } from "./numberRingRenderer";
import { renderDemuxCircuit } from "./demuxCircuitRenderer";
import { renderAcPowerFactorCircuit } from "./acPowerFactorCircuitRenderer";
import { renderAcAdmittanceResonanceCircuit, renderAcAdmittanceResonanceDualCircuit } from "./acAdmittanceResonanceCircuitRenderer";
import { renderAcVccsPhasorCircuit } from "./acVccsPhasorCircuitRenderer";
import { renderSwitchedRcDcCircuit } from "./switchedRcDcCircuitRenderer";
import { renderSwitchedRlSourceSwitchCircuit } from "./switchedRlSourceSwitchCircuitRenderer";
import { renderSwitchedCapShortRlCircuit } from "./switchedCapShortRlCircuitRenderer";
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
    case "jfet_depletion_panels":
      return wrapSvg(figure, renderJfetDepletionPanels(figure.diagram as import("@/types").JfetDepletionPanelsDiagram));
    case "r2r_ladder_dac_circuit":
      return wrapSvg(figure, renderR2rLadderDacCircuit(figure.diagram as import("@/types").R2rLadderDacDiagram));
    case "bjt_early_structure":
      return wrapSvg(figure, renderBjtEarlyStructureSVG(figure.diagram as import("@/types").BjtEarlyStructureDiagram));
    case "bjt_early_curve":
      return wrapSvg(figure, renderBjtEarlyCurveSVG(figure.diagram as import("@/types").BjtEarlyCurveDiagram));
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
    case "ac_delta_wye_bridge_circuit":
      return wrapSvg(figure, renderAcDeltaWyeBridgeCircuit(figure.diagram as import("@/types").AcDeltaWyeBridgeCircuitDiagram));
    case "ac_delta_wye_equiv_circuit":
      return wrapSvg(figure, renderAcDeltaWyeEquivCircuit(figure.diagram as import("@/types").AcDeltaWyeEquivCircuitDiagram));
    case "opamp_avg_superposition_circuit":
      return wrapSvg(figure, renderOpampAvgSuperpositionCircuit(figure.diagram as import("@/lib/generation/topologies/opampAvgSuperpositionR").OpampAvgSuperpositionCircuitDiagram));
    case "thevenin_dep_graph_circuit":
      return wrapSvg(figure, renderTheveninDepGraphCircuit(figure.diagram as import("@/lib/generation/topologies/theveninDepGraphMaxPower").TheveninDepGraphCircuitDiagram));
    case "ac_two_source_mesh_circuit":
      return wrapSvg(figure, renderAcTwoSourceMeshCircuit(figure.diagram as import("@/types").AcTwoSourceMeshCircuitDiagram));
    case "oscilloscope_screen":
      return wrapSvg(figure, renderOscilloscopeScreen(figure.diagram as import("@/types").OscilloscopeScreenDiagram));
    case "oscilloscope_phase_circuit":
      return wrapSvg(figure, renderOscilloscopePhaseCircuit(figure.diagram as import("@/types").OscilloscopePhaseCircuitDiagram));
    case "ac_thevenin_ladder_circuit":
      return wrapSvg(figure, renderAcTheveninLadderCircuit(figure.diagram as import("@/types").AcTheveninLadderCircuitDiagram));
    case "ac_thevenin_equiv_circuit":
      return wrapSvg(figure, renderAcTheveninEquivCircuit(figure.diagram as import("@/types").AcTheveninEquivCircuitDiagram));
    case "ac_thevenin_dep_circuit":
      return wrapSvg(figure, renderAcTheveninDepCircuit(figure.diagram as import("@/types").AcTheveninDepCircuitDiagram));
    case "ac_thevenin_dep_equiv_circuit":
      return wrapSvg(figure, renderAcTheveninDepEquivCircuit(figure.diagram as import("@/types").AcTheveninDepEquivCircuitDiagram));
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
    case "ac_rl_average_power_circuit":
      return wrapSvg(figure, renderAcRlAveragePowerCircuit(figure.diagram as import("@/types").AcRlAveragePowerDiagram));
    case "opamp_rc_t_oscillator_circuit":
      return wrapSvg(figure, renderOpampRcTOscillator(figure.diagram as import("@/types").OpampRcTOscillatorDiagram));
    case "jfet_bias_circuit":
      return wrapSvg(figure, renderJfetBiasCircuit(figure.diagram as import("@/types").JfetBiasCircuitDiagram));
    case "tff3_counter_circuit":
      return wrapSvg(figure, renderTff3CounterCircuit(figure.diagram as import("@/types").Tff3CounterCircuitDiagram));
    case "jk_excitation_circuit":
      return wrapSvg(figure, renderJkExcitationCircuit(figure.diagram as import("@/types").JkExcitationCircuitDiagram));
    case "max_power_two_source_circuit":
      return wrapSvg(figure, renderMaxPowerTwoSourceCircuit(figure.diagram as import("@/types").MaxPowerTwoSourceCircuitDiagram));
    case "jk_two_phase_clock_circuit":
      return wrapSvg(figure, renderJkTwoPhaseClockCircuit(figure.diagram as import("@/types").JkTwoPhaseClockCircuitDiagram));
    case "rlc_antiresonance_ladder_circuit":
      return wrapSvg(figure, renderRlcAntiresonanceLadderCircuit(figure.diagram as import("@/types").RlcAntiresonanceLadderCircuitDiagram));
    case "ac_dc_source_superposition_circuit":
      return wrapSvg(figure, renderAcDcSourceSuperpositionCircuit(figure.diagram as import("@/types").AcDcSourceSuperpositionCircuitDiagram));
    case "two_source_rl_superposition_circuit":
      return wrapSvg(figure, renderTwoSourceRlSuperpositionCircuit(figure.diagram as import("@/types").TwoSourceRlSuperpositionCircuitDiagram));
    case "switched_rl_dual_short_circuit":
      return wrapSvg(figure, renderSwitchedRlDualShortCircuit(figure.diagram as import("@/types").SwitchedRlDualShortCircuitDiagram));
    case "dff_preset_clear_circuit":
      return wrapSvg(figure, renderDffPresetClearCircuit(figure.diagram as import("@/types").DffPresetClearCircuitDiagram));
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
    case "switched_cap_short_rl_circuit":
      return wrapSvg(figure, renderSwitchedCapShortRlCircuit(figure.diagram as import("@/types").SwitchedCapShortRlCircuitDiagram));
    case "bjt_thevenin_bias_circuit":
      return wrapSvg(figure, renderBjtTheveninBiasCircuit(figure.diagram as import("@/types").BjtTheveninBiasCircuitDiagram));
    case "bjt_switch_logic_circuit":
      return wrapSvg(figure, renderBjtSwitchLogicCircuit(figure.diagram as import("@/types").BjtSwitchLogicCircuitDiagram));
    case "comparator_diode_or_circuit":
      return wrapSvg(figure, renderComparatorDiodeOrCircuit(figure.diagram as import("@/types").ComparatorDiodeOrCircuitDiagram));
    case "opamp_summer_tfeedback_circuit":
      return wrapSvg(figure, renderOpampSummerTFeedbackCircuit(figure.diagram as import("@/types").OpampSummerTFeedbackCircuitDiagram));
    case "ac_thevenin_two_box_circuit":
      return wrapSvg(figure, renderAcTheveninTwoBoxCircuit(figure.diagram as import("@/types").AcTheveninTwoBoxCircuitDiagram));
    case "diode_clamper_circuit":
      return wrapSvg(figure, renderDiodeClamperCircuit(figure.diagram as import("@/types").DiodeClamperCircuitDiagram));
    case "diode_clamper_waveform":
      return wrapSvg(figure, renderDiodeClamperWaveform(figure.diagram as import("@/types").DiodeClamperWaveformDiagram));
    case "dc_two_source_ladder_circuit":
      return wrapSvg(figure, renderDcTwoSourceLadderCircuit(figure.diagram as import("@/types").DcTwoSourceLadderCircuitDiagram));
    case "opamp_two_stage_rx_circuit":
      return wrapSvg(figure, renderOpampTwoStageRxCircuit(figure.diagram as import("@/types").OpampTwoStageRxCircuitDiagram));
    case "ac_thevenin_design_ab_circuit":
      return wrapSvg(figure, renderAcTheveninDesignAbCircuit(figure.diagram as import("@/types").AcTheveninDesignAbCircuitDiagram));
    case "zener_shunt_regulator_circuit":
      return wrapSvg(figure, renderZenerShuntRegulatorCircuit(figure.diagram as import("@/types").ZenerShuntRegulatorCircuitDiagram));
    case "switched_rlc_source_free_circuit":
      return wrapSvg(figure, renderSwitchedRlcSourceFreeCircuit(figure.diagram as import("@/types").SwitchedRlcSourceFreeCircuitDiagram));
    case "rlc_state_equation_circuit":
      return wrapSvg(figure, renderRlcStateEquationCircuit(figure.diagram as import("@/types").RlcStateEquationCircuitDiagram));
    case "switched_rlc_dual_switch_circuit":
      return wrapSvg(figure, renderSwitchedRlcDualSwitchCircuit(figure.diagram as import("@/types").SwitchedRlcDualSwitchCircuitDiagram));
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
