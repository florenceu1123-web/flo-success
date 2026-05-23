/**
 * LogicDAG → LogicNetworkDiagram 변환 + SVG 렌더.
 *
 *   파이프라인 (사용자 명시):
 *     generate → minterms 생성 → kmap 생성 → LogicDAG 생성 →
 *       validateLogicDag → renderLogicDagSvg
 *
 *   구현: 기존 LogicNetworkDiagram + renderLogicNetworkSVG 재활용.
 *     - function leaf → diagram의 input wire
 *     - gate node → diagram의 gate (id를 output wire name으로)
 *     - outputId → diagram의 output wire
 *     - intermediate gate id들 → diagram의 outputs에는 안 들어가지만 gate.output으로 wire 이름 부여
 */

import type { LogicDAG, LogicDAGNode } from "@/lib/graph/digitalSemantic";
import { intermediateSignalsOf, validateLogicDAG } from "@/lib/graph/digitalSemantic";
import { renderLogicNetworkSVG } from "./logicNetworkRenderer";
import type { LogicNetworkDiagram } from "@/types";

/**
 * LogicDAG → LogicNetworkDiagram.
 *   functionLabels: function leaf id → 표시 라벨 (예: "f1" → "f_1").
 */
export function dagToLogicNetwork(
  dag: LogicDAG,
  functionLabels?: Record<string, string>,
): LogicNetworkDiagram {
  const labelOf = (id: string): string => {
    const node = dag.nodes.find((n) => n.id === id);
    if (!node) return id;
    return node.label ?? functionLabels?.[id] ?? id;
  };

  // inputs = function leaf들의 label (회로 외부에서 들어오는 wire)
  const inputs: string[] = dag.nodes
    .filter((n): n is Extract<LogicDAGNode, { kind: "function" }> => n.kind === "function")
    .map((n) => n.label ?? functionLabels?.[n.id] ?? n.id);

  // outputs = outputId의 label
  const outputs: string[] = [labelOf(dag.outputId)];

  // gates = gate node들 — gate.inputs는 다른 node의 label로 표시
  const gates = dag.nodes
    .filter((n): n is Extract<LogicDAGNode, { kind: "gate" }> => n.kind === "gate")
    .map((n) => ({
      id: n.id,
      type: n.gate,
      inputs: n.inputs.map(labelOf),
      output: labelOf(n.id),
    }));

  return { inputs, outputs, gates };
}

/**
 * LogicDAG SVG 렌더 — validateLogicDAG 통과한 dag만 받아 SVG 생성.
 *   외부 노출 entry. 사용자 명시 파이프라인의 "renderLogicDagSvg" 단계.
 */
export function renderLogicDagSvg(
  dag: LogicDAG,
  functionLabels?: Record<string, string>,
): string {
  const errors = validateLogicDAG(dag);
  if (errors.length > 0) {
    return `<pre>LogicDAG validation 실패: ${errors.join(" / ")}</pre>`;
  }
  const network = dagToLogicNetwork(dag, functionLabels);
  return renderLogicNetworkSVG(network);
}

// re-export 편의
export { validateLogicDAG, intermediateSignalsOf };
