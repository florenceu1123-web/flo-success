// src/lib/digital/validateLogicDag.ts

import type { LogicDAG } from "./logicDag";

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * 게이트 종류 다양성 검증 — typed logic synthesis 원칙.
 *
 *   모든 gate node가 한 종류로 collapse되면 원본 회로의 semantic
 *   (예: (f1·f2)→X AND, (f3+f4)→Y OR, X⊕Y→Z XOR)이 손실된 것으로 간주.
 *
 *   노드 연결만 보존 ❌
 *   게이트 종류까지 semantic 보존 ✅
 */
export function validateGateDiversity(dag: LogicDAG): ValidationResult {
  const gates = dag.nodes
    .filter(n => n.kind === "gate")
    .map(n => (n as { gate: string }).gate);

  const unique = new Set(gates);

  if (unique.size < 2) {
    return {
      ok: false,
      error: "ALL_GATES_COLLAPSED",
    };
  }

  return { ok: true };
}
