import type {
  CircuitNetlist,
  FigureVariant,
  KmapDiagram,
  LogicNetworkDiagram,
  WaveformDiagram,
} from "@/types";
import { validateNetlistRenderable } from "@/lib/renderers/netlist/validate";
import { validateKmap } from "@/lib/renderers/kmapRenderer";
import { validateLogicNetwork } from "@/lib/renderers/logicNetworkRenderer";
import type { ValidationResult, ValidationIssue } from "./validateProblem";

/**
 * diagramType별 validator dispatch.
 *  - analog_netlist: pin/node 누락 + dangling(degree<2) 검사
 *  - logic_network: 신호 그래프 검증 (input의 source 존재 등). dangling 미적용
 *  - kmap: rowVars/colVars/cells 차원 검사
 *  - waveform: signals[].samples 시간 단조 증가
 */
export function validateFigures(figures: FigureVariant[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  for (const f of figures) {
    if (f.diagramType === "analog_netlist") {
      const d = f.diagram as CircuitNetlist | null | undefined;
      if (!d) { issues.push({ rule: "netlist_missing", message: `${f.id}: diagram 누락` }); continue; }
      const v = validateNetlistRenderable(d);
      for (const e of v.errors) issues.push({ rule: "netlist_renderable", message: `${f.id}: ${e}` });
      // dangling: 같은 node에 묶인 pin이 1개뿐이면
      const degree = new Map<string, number>();
      for (const c of d.components ?? []) {
        for (const p of c.pins ?? []) {
          if (!p.node) continue;
          degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
        }
      }
      for (const [node, deg] of degree) {
        if (deg < 2) {
          issues.push({ rule: "netlist_dangling_node", message: `${f.id}: node "${node}" — degree ${deg} (≥2 필요)` });
        }
      }
    } else if (f.diagramType === "logic_network") {
      const d = f.diagram as LogicNetworkDiagram | null | undefined;
      if (!d) { issues.push({ rule: "logic_network_missing", message: `${f.id}: diagram 누락` }); continue; }
      const v = validateLogicNetwork(d);
      for (const e of v.errors) issues.push({ rule: "logic_network_invalid", message: `${f.id}: ${e}` });
    } else if (f.diagramType === "kmap") {
      const d = f.diagram as KmapDiagram | null | undefined;
      if (!d || !Array.isArray(d.variables) || !Array.isArray(d.rows)) {
        issues.push({ rule: "kmap_shape", message: `${f.id}: kmap diagram에 variables/rows 누락` });
        continue;
      }
      const v = validateKmap(d);
      for (const e of v.errors) issues.push({ rule: "kmap_invalid", message: `${f.id}: ${e}` });
    } else if (f.diagramType === "waveform") {
      const d = f.diagram as Partial<WaveformDiagram> | null | undefined;
      if (!d || !Array.isArray(d.signals)) {
        issues.push({ rule: "waveform_shape", message: `${f.id}: waveform diagram에 signals 누락` });
        continue;
      }
      for (const sig of d.signals) {
        for (let i = 1; i < sig.samples.length; i++) {
          if (sig.samples[i].t <= sig.samples[i - 1].t) {
            issues.push({
              rule: "waveform_time_not_monotonic",
              message: `${f.id}: signal "${sig.name}" 시간이 단조 증가하지 않음 (idx ${i})`,
            });
            break;
          }
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
