// src/lib/digital/layoutLogicDag.ts

import type { LogicDAG, LogicNode } from "./logicDag";

export type Point = { x: number; y: number };

export type LayoutNode = LogicNode & {
  x: number;
  y: number;
  level: number;
};

export function layoutLogicDag(dag: LogicDAG): LayoutNode[] {
  const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));

  const memo = new Map<string, number>();

  function levelOf(id: string): number {
    if (memo.has(id)) return memo.get(id)!;

    const node = nodeMap.get(id);
    if (!node) return 0;

    if (node.kind === "input" || node.kind === "function") {
      memo.set(id, 0);
      return 0;
    }

    if ("inputs" in node) {
      const level = Math.max(...node.inputs.map(levelOf)) + 1;
      memo.set(id, level);
      return level;
    }

    return 0;
  }

  const grouped = new Map<number, LogicNode[]>();

  for (const node of dag.nodes) {
    const level = levelOf(node.id);
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level)!.push(node);
  }

  const result: LayoutNode[] = [];

  for (const [level, nodes] of grouped) {
    const startY = -((nodes.length - 1) * 70) / 2;

    nodes.forEach((node, i) => {
      result.push({
        ...node,
        level,
        x: level * 180,
        y: startY + i * 70,
      });
    });
  }

  return result;
}
