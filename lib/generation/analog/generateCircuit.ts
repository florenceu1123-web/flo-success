// src/lib/generation/analog/generateCircuit.ts
//
// Analog 회로 생성 dispatch — analysis → archetype detect → archetype-specific generator.
// archetype enum은 lib/analog/archetypeRegistry.ts에서 단일 소스로 관리.

import type { AnalogArchetype } from "@/lib/analog/archetypeRegistry";

export type AnalogAnalysis = {
  family: "OPAMP";
  archetype: AnalogArchetype;
};

export function generateCircuit(a: AnalogAnalysis) {

  switch (a.archetype) {

    case "WIEN_BRIDGE_OSCILLATOR":
      return generateWienBridgeOscillator(a);

    case "RC_PHASE_SHIFT_OSCILLATOR":
      return generateRCPhaseShiftOscillator(a);

    case "NONINVERTING_AMP":
      return generateNonInvertingAmp(a);

    case "INVERTING_AMP":
      return generateInvertingAmp(a);

    case "VOLTAGE_FOLLOWER":
      return generateVoltageFollower(a);

    case "ACTIVE_FILTER":
      return generateActiveFilter(a);

    default:
      throw new Error(
        `UNSUPPORTED_ARCHETYPE: ${(a as AnalogAnalysis).archetype}`
      );
  }
}

// ── Generator stubs ──────────────────────────────────────────────────
// 실제 구현은 archetype별 별도 파일로 채워질 예정.

function generateWienBridgeOscillator(_a: AnalogAnalysis): unknown {
  throw new Error("NOT_IMPLEMENTED: generateWienBridgeOscillator");
}

function generateRCPhaseShiftOscillator(_a: AnalogAnalysis): unknown {
  throw new Error("NOT_IMPLEMENTED: generateRCPhaseShiftOscillator");
}

function generateNonInvertingAmp(_a: AnalogAnalysis): unknown {
  throw new Error("NOT_IMPLEMENTED: generateNonInvertingAmp");
}

function generateInvertingAmp(_a: AnalogAnalysis): unknown {
  throw new Error("NOT_IMPLEMENTED: generateInvertingAmp");
}

function generateVoltageFollower(_a: AnalogAnalysis): unknown {
  throw new Error("NOT_IMPLEMENTED: generateVoltageFollower");
}

function generateActiveFilter(_a: AnalogAnalysis): unknown {
  throw new Error("NOT_IMPLEMENTED: generateActiveFilter");
}
