// src/lib/digital/renderLogicDagSvg.ts

import type { GateType, LogicDAG } from "./logicDag";
import { layoutLogicDag } from "./layoutLogicDag";

export function renderLogicDagSvg(dag: LogicDAG): string {
  const nodes = layoutLogicDag(dag);
  const byId = new Map(nodes.map(n => [n.id, n]));

  const wires: string[] = [];
  const shapes: string[] = [];

  // 게이트 입력 wire — 각 source의 오른쪽 끝에서 gate의 왼쪽 끝으로 라우팅.
  for (const node of nodes) {
    if ("inputs" in node) {
      for (const inputId of node.inputs) {
        const src = byId.get(inputId);
        if (!src) continue;

        wires.push(`
          <path d="M ${src.x + 60} ${src.y} H ${node.x - 40} V ${node.y} H ${node.x - 20}"
                fill="none" stroke="black" stroke-width="2"/>
        `);
      }
    }
  }

  // 게이트 출력 stub — 게이트 오른쪽 끝에서 짧게 우측으로.
  for (const node of nodes) {
    if (node.kind === "gate") {
      const gateRightX = node.x + 25;
      wires.push(`
        <path d="M ${gateRightX} ${node.y} H ${gateRightX + 40}"
              fill="none" stroke="black" stroke-width="2"/>
      `);
    }
  }

  for (const node of nodes) {
    if (node.kind === "function" || node.kind === "input") {
      shapes.push(`
        <text x="${node.x}" y="${node.y + 5}" font-size="16">${node.label}</text>
        <circle cx="${node.x + 50}" cy="${node.y}" r="3" fill="black"/>
      `);
    }

    if (node.kind === "gate") {
      shapes.push(renderGate(node.gate, node.x, node.y));
      // 게이트 출력 라벨 (X·Y·Z 같은 intermediate signal 이름) — 출력 stub 위에 표기.
      const outputLabel = node.label ?? node.id;
      shapes.push(`
        <text x="${node.x + 50}" y="${node.y - 8}" font-size="15">${outputLabel}</text>
      `);
    }
  }

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="700" height="400" viewBox="-80 -180 700 400">
    ${wires.join("\n")}
    ${shapes.join("\n")}
  </svg>`;
}

function renderGate(gate: GateType, x: number, y: number) {
  switch (gate) {
    case "AND":
      return renderAndGate(x, y);

    case "OR":
      return renderOrGate(x, y);

    case "XOR":
      return renderXorGate(x, y);

    case "NOT":
      return renderNotGate(x, y);

    default:
      return renderBoxGate(x, y, gate);
  }
}

/** AND — D-shape (flat left, semicircle right). */
function renderAndGate(x: number, y: number): string {
  return `
    <path d="M ${x - 20} ${y - 25} h 20 a 25 25 0 0 1 0 50 h -20 z"
          fill="white" stroke="black" stroke-width="2"/>
  `;
}

/** OR — shield shape (concave back, convex front). */
function renderOrGate(x: number, y: number): string {
  return `
    <path d="M ${x - 25} ${y - 25}
             q 15 12 15 25 q 0 13 -15 25
             q 25 0 50 -25
             q -25 -25 -50 -25 z"
          fill="white" stroke="black" stroke-width="2"/>
  `;
}

/** XOR — OR + extra arc on back. */
function renderXorGate(x: number, y: number): string {
  return `
    <path d="M ${x - 32} ${y - 25} q 15 12 15 25 q 0 13 -15 25"
          fill="none" stroke="black" stroke-width="2"/>
    <path d="M ${x - 25} ${y - 25}
             q 15 12 15 25 q 0 13 -15 25
             q 25 0 50 -25
             q -25 -25 -50 -25 z"
          fill="white" stroke="black" stroke-width="2"/>
  `;
}

/** NOT — triangle + inversion bubble. */
function renderNotGate(x: number, y: number): string {
  return `
    <polygon points="${x - 20},${y - 20} ${x - 20},${y + 20} ${x + 15},${y}"
             fill="white" stroke="black" stroke-width="2"/>
    <circle cx="${x + 19}" cy="${y}" r="4"
            fill="white" stroke="black" stroke-width="2"/>
  `;
}

/** Fallback (NAND·NOR·XNOR) — labeled rounded rect. */
function renderBoxGate(x: number, y: number, gate: string): string {
  return `
    <rect x="${x - 20}" y="${y - 25}" width="50" height="50"
          rx="8" fill="white" stroke="black" stroke-width="2"/>
    <text x="${x + 5}" y="${y + 5}" font-size="12" text-anchor="middle">${gate}</text>
  `;
}
