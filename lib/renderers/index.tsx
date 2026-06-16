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
import { renderAsyncPresetCounterCircuit } from "./asyncPresetCounterCircuitRenderer";
import { renderRlcResonanceBandwidthCircuit } from "./rlcResonanceBandwidthCircuitRenderer";
import { renderRlcResonanceBandwidthDualCircuit } from "./rlcResonanceBandwidthDualCircuitRenderer";
import { renderTruthTable } from "./truth_table";
import { renderWaveform } from "./waveform";

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
    case "async_preset_counter_circuit":
      return wrapSvg(figure, renderAsyncPresetCounterCircuit(figure.diagram as import("@/types").AsyncPresetCounterCircuitDiagram));
    case "rlc_resonance_bandwidth_circuit":
      return wrapSvg(figure, renderRlcResonanceBandwidthCircuit(figure.diagram as import("@/types").RlcResonanceBandwidthCircuitDiagram));
    case "rlc_resonance_bandwidth_dual_circuit":
      return wrapSvg(figure, renderRlcResonanceBandwidthDualCircuit(figure.diagram as import("@/types").RlcResonanceBandwidthDualCircuitDiagram));
    case "vi_line_graph":
      return wrapSvg(figure, renderViLineGraph(figure.diagram as Parameters<typeof renderViLineGraph>[0]));
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
