import type { GenerationMode, ScrTurnOnCircuitDiagram, WaveformDiagram } from "@/types";

/**
 * SCR(실리콘 제어정류기/사이리스터) 턴온 회로 — 임용 4번류.
 *
 * 회로: +V ─ R_A(전류 I_A) ─ 애노드 A ─[SCR]─ 캐소드 K(접지). 게이트: V_G ─ R_G ─ G.
 * (나) V_G 파형: 구간 ㉠(0~t1)에 V_gate, 구간 ㉡(t1~t2)에 0.
 *
 * ★ 핵심 물리(래칭): SCR은 게이트 펄스로 t=0에 턴온되면, 애노드 전류 I_A가 유지전류 I_H 이상인 한
 *   **게이트가 없어져도 계속 ON**을 유지한다. 따라서:
 *   - 구간 ㉠: SCR ON → I_A = (V − V_AK) / R_A.
 *   - 구간 ㉡: 게이트 0이지만 I_A > I_H 이므로 여전히 ON → I_A = (V − V_AK) / R_A **(㉠과 동일)**.
 *   → 두 구간의 I_A가 **같은 값**인 것이 학습 포인트(GPT는 ㉡을 0으로 오답하기 쉬움).
 *
 * 결정론 생성(GPT 없음). exam_similar/variant는 값 세트만 다름.
 */

export type ScrTurnOnGeneration = {
  V: number;        // 공급 전압 [V]
  R: number;        // 애노드 저항 [Ω]
  vak: number;      // V_AK (ON 시 A-K 전압) [V]
  iH: number;       // 유지전류 [mA]
  vGate: number;    // 게이트 펄스 전압 [V]
  rGate: number;    // 게이트 저항 [Ω]
  t1: number;       // 구간 ㉠ 끝 [s]
  t2: number;       // 구간 ㉡ 끝 [s]
  iA: number;       // I_A [A] (두 구간 공통)
  circuitDiagram: ScrTurnOnCircuitDiagram;
  vgWaveform: WaveformDiagram;
};

/** 사전검증 파라미터 세트 — I_A 깔끔, I_A ≫ I_H(래칭 성립). 첫째=원본. */
const PARAM_SETS: Array<{ V: number; R: number; vak: number; iH: number; vGate: number; rGate: number }> = [
  { V: 15, R: 20, vak: 0.2, iH: 10, vGate: 10, rGate: 1000 },   // 원본: I_A=0.74A
  { V: 20, R: 25, vak: 0.25, iH: 10, vGate: 10, rGate: 1000 },  // 0.79A
  { V: 12, R: 20, vak: 0.2, iH: 5, vGate: 10, rGate: 1000 },    // 0.59A
  { V: 18, R: 25, vak: 0.3, iH: 10, vGate: 12, rGate: 1500 },   // 0.708A
  { V: 24, R: 40, vak: 0.4, iH: 20, vGate: 12, rGate: 2000 },   // 0.59A
  { V: 15, R: 25, vak: 0.25, iH: 5, vGate: 10, rGate: 1000 },   // 0.59A
];

const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : `${n}`);

export function generateScrTurnOn(args: { seed?: number; mode?: GenerationMode; index?: number }): ScrTurnOnGeneration {
  // 결정론: index(또는 seed)로 세트 선택. exam_variant는 뒤쪽 세트 우선.
  const base = args.index ?? Math.floor((args.seed ?? 0));
  const offset = args.mode === "exam_variant" ? 2 : 0;
  const p = PARAM_SETS[(base + offset) % PARAM_SETS.length];
  const iA = Math.round(((p.V - p.vak) / p.R) * 1000) / 1000; // A, 소수 3자리

  const t1 = 5, t2 = 10;
  const circuitDiagram: ScrTurnOnCircuitDiagram = {
    supplyLabel: `+${p.V} V`,
    rLabel: `${fmt(p.R)}Ω`,
    rGateLabel: p.rGate >= 1000 ? `${p.rGate / 1000}kΩ` : `${p.rGate}Ω`,
    vGateLabel: "V_G",
    iaLabel: "I_A",
  };

  // (나) V_G 파형 (step): t=0에 vGate 시작 → t1에서 0으로 → t2까지 0. (중복 t 없이 단조 증가.)
  const vgWaveform: WaveformDiagram = {
    signals: [{
      name: "V_G",
      shape: "step",
      samples: [{ t: 0, v: p.vGate }, { t: t1, v: 0 }, { t: t2, v: 0 }],
    }],
    unit: { time: "s", value: "V" },
    markers: [{ t: t1 / 2, label: "㉠" }, { t: (t1 + t2) / 2, label: "㉡" }],
  };

  return { V: p.V, R: p.R, vak: p.vak, iH: p.iH, vGate: p.vGate, rGate: p.rGate, t1, t2, iA, circuitDiagram, vgWaveform };
}
