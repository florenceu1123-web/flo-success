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
import { hasOpAmp, validateOpAmpCircuit } from "@/lib/renderers/opampCircuitRenderer";
import { CONNECTION_LAYOUT_RULES } from "@/lib/generation/branchTemplate";
import { validateAnalogClosure } from "./validateAnalogClosure";
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
      // 단, label_only annotation 노드(외부 입력/출력 단자) + ground는 면제
      const externalTerminals = new Set<string>();
      for (const ann of d.nodeAnnotations ?? []) {
        if (ann.style === "label_only") externalTerminals.add(ann.node);
      }
      if (d.ground) externalTerminals.add(d.ground);
      const degree = new Map<string, number>();
      for (const c of d.components ?? []) {
        for (const p of c.pins ?? []) {
          if (!p.node) continue;
          degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
        }
      }
      for (const [node, deg] of degree) {
        if (externalTerminals.has(node)) continue;
        // CONNECTION_LAYOUT_RULES.minNodeDegree = 2 (Rule-1: 회로 완결성)
        if (deg < CONNECTION_LAYOUT_RULES.minNodeDegree) {
          issues.push({ rule: "netlist_dangling_node", message: `${f.id}: node "${node}" — degree ${deg} (≥${CONNECTION_LAYOUT_RULES.minNodeDegree} 필요)` });
        }
      }
      // 회로 폐쇄성 검사 (회로이론 가이드 — 전원 포함 closed loop)
      const closureErrors = validateAnalogClosure(d);
      for (const e of closureErrors) {
        issues.push({ rule: "analog_circuit_open", message: `${f.id}: ${e}` });
      }
      // ★ 분리된 부분회로 검사 (2026-07-27) — 접지로만 이어진 독립 루프가 여러 개면
      //   "한 문제의 회로"가 아니라 **별개 회로 N개**다(실측 신고: V+R 루프 4개가 하단 레일로만
      //   연결된 그림이 생성됨). 각 루프는 개별적으로는 폐회로라 기존 검사(dangling·closure)를
      //   모두 통과해 그대로 화면까지 나갔다.
      //   ※ 접지만 공유하는 **2망 구조**는 정당한 archetype이 있으므로(ac_vccs_phasor 캐스케이드)
      //     3개 이상일 때만 결함으로 본다.
      {
        const isGndNode = (n: string) =>
          n === d.ground || ["GND", "gnd", "Gnd", "0", "ground", "Ground"].includes(n);
        const adj = new Map<string, Set<string>>();
        const link = (a: string, b: string) => {
          if (!adj.has(a)) adj.set(a, new Set());
          if (!adj.has(b)) adj.set(b, new Set());
          adj.get(a)!.add(b);
          adj.get(b)!.add(a);
        };
        for (const c of d.components ?? []) {
          const nodes = (c.pins ?? []).map((p) => p.node).filter((n) => n && !isGndNode(n));
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) link(nodes[i], nodes[j]);
          }
          if (nodes.length === 1) link(nodes[0], nodes[0]);
        }
        const seen = new Set<string>();
        let groups = 0;
        for (const start of adj.keys()) {
          if (seen.has(start)) continue;
          groups++;
          const stack = [start];
          while (stack.length > 0) {
            const cur = stack.pop()!;
            if (seen.has(cur)) continue;
            seen.add(cur);
            for (const nb of adj.get(cur) ?? []) if (!seen.has(nb)) stack.push(nb);
          }
        }
        if (groups >= 3) {
          issues.push({
            rule: "circuit_disconnected_subcircuits",
            message: `${f.id}: 접지로만 이어진 독립 회로가 ${groups}개 — 한 문제의 단일 회로가 아님`,
          });
        }
      }

      // ★ OPAMP 결선 검사 — 같은 검증을 렌더러(analogMeshRenderer)도 하는데, 거기서 걸리면
      //   회로 대신 raw <pre> 에러 박스가 화면에 그대로 노출된다(실측 신고:
      //   "OPAMP1: OPAMP feedback branch 누락"). 검증 단계에서 잡아 **재생성 트리거**로 돌린다.
      //   규칙 #8(open-loop 비교기)은 validateOpAmpCircuit이 이미 면제 처리.
      if (hasOpAmp(d)) {
        for (const e of validateOpAmpCircuit(d)) {
          issues.push({ rule: "opamp_wiring_invalid", message: `${f.id}: ${e}` });
        }
      }
    } else if (f.diagramType === "concept_diagram") {
      // ★ 렌더러(conceptDiagramRenderer)는 nodes가 비면 raw <pre> 에러를 화면에 그대로 노출한다
      //   (실측 신고: "concept_diagram: nodes 비어있음"). 검증 단계에서 잡아 재생성 트리거로 돌린다.
      const d = f.diagram as { nodes?: unknown[] } | null | undefined;
      if (!d || !Array.isArray(d.nodes) || d.nodes.length === 0) {
        issues.push({ rule: "concept_diagram_empty", message: `${f.id}: concept_diagram에 nodes가 없음` });
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
