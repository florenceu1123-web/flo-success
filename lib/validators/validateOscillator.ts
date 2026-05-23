// src/lib/validators/validateOscillator.ts
//
// Oscillator 회로 validator — voltage_follower collapse·외부 V_in 등 발진기 위반 패턴 차단.
// pipeline: ... → Archetype-specific Generator → validateOscillator → Renderer.

import type { CircuitNetlist } from "@/types";

export type OscillatorValidationResult =
  | { ok: true }
  | { ok: false; error: string };

function ok(): OscillatorValidationResult {
  return { ok: true };
}

function fail(error: string): OscillatorValidationResult {
  return { ok: false, error };
}

export function validateOscillator(circuit: CircuitNetlist): OscillatorValidationResult {

  if (isVoltageFollower(circuit)) {
    return fail("COLLAPSED_TO_VOLTAGE_FOLLOWER");
  }

  if (!hasFeedbackLoop(circuit)) {
    return fail("NO_FEEDBACK_LOOP");
  }

  if (!hasRCNetwork(circuit)) {
    return fail("NO_RC_NETWORK");
  }

  if (hasExternalVin(circuit)) {
    return fail("OSCILLATOR_SHOULD_NOT_HAVE_EXTERNAL_VIN");
  }

  return ok();
}

// ── Predicates ───────────────────────────────────────────────────────

/**
 * Voltage follower 검출 — OPAMP의 V− 핀과 V_out 핀이 같은 노드(직접 단락 피드백).
 *   오실레이터는 V−에 R/C 망을 거쳐 피드백되므로 직접 단락이면 collapse 상태.
 */
function isVoltageFollower(circuit: CircuitNetlist): boolean {
  const opamps = (circuit.components ?? []).filter((c) => c.type === "OPAMP");
  return opamps.some((op) => {
    const vn = op.pins?.[1]?.node;
    const vo = op.pins?.[2]?.node;
    return !!vn && !!vo && vn === vo;
  });
}

/**
 * Feedback loop 검출 — OPAMP V_out에서 V−/V+로 가는 2-pin component path(BFS) 존재.
 *   opampCircuitRenderer.hasChainFeedback과 같은 원리 (재구현 — analog renderer dep 없이 독립).
 */
function hasFeedbackLoop(circuit: CircuitNetlist): boolean {
  const components = circuit.components ?? [];
  const opamps = components.filter((c) => c.type === "OPAMP");
  if (opamps.length === 0) return false;

  for (const op of opamps) {
    const vpNode = op.pins?.[0]?.node;
    const vnNode = op.pins?.[1]?.node;
    const voNode = op.pins?.[2]?.node;
    if (!vpNode || !vnNode || !voNode) continue;

    const adj = new Map<string, Set<string>>();
    for (const c of components) {
      if (c.id === op.id) continue;
      if (c.type === "OPAMP") continue;
      if (!c.pins || c.pins.length !== 2) continue;
      const [a, b] = [c.pins[0].node, c.pins[1].node];
      if (!a || !b || a === b) continue;
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    }

    const visited = new Set<string>([voNode]);
    const queue: string[] = [voNode];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur !== voNode && (cur === vnNode || cur === vpNode)) return true;
      for (const next of adj.get(cur) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** RC 망 존재 — components에 R과 C가 모두 1개 이상. */
function hasRCNetwork(circuit: CircuitNetlist): boolean {
  const components = circuit.components ?? [];
  const hasR = components.some((c) => c.type === "R");
  const hasC = components.some((c) => c.type === "C");
  return hasR && hasC;
}

/**
 * 외부 V_in 존재 — 오실레이터는 자가발진이므로 외부 입력 전압원이 있으면 위반.
 *   기준: V 소자 중 GND를 양/음 단자 중 하나로 가지지 않거나, id/label에 "in"/"V_s" 등 외부 입력 표기.
 *   단, 단일 직류 바이어스 (Vcc 등)는 외부 입력으로 보지 않는다 — 라벨 기반 식별.
 */
function hasExternalVin(circuit: CircuitNetlist): boolean {
  const vsources = (circuit.components ?? []).filter((c) => c.type === "V");
  return vsources.some((v) => {
    const idLower = (v.id ?? "").toLowerCase();
    return /v_?in|v_?s\b|vs\b|input/.test(idLower);
  });
}
