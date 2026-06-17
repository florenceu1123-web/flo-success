import type { GenerationMode, SwitchedRcDcCircuitDiagram } from "@/types";
import { makeRand, pick, round3 } from "./_helpers";

/**
 * t=0 스위치 개방 RC 회로 (임용 2번 회로이론) — 전용 archetype.
 *
 *  토폴로지: 좌측 [V_s(+직렬 R_s) ∥ I_s(전류원)] ─[SW: t=0 개방]─ 우측 [C(v_c) ∥ R_load(v_o)].
 *  t<0 (SW 닫힘, DC 정상상태): C 개방 → 노드 전압 v_c(0⁻) = (V_s/R_s + I_s)/(1/R_s + 1/R_load).
 *  t≥0 (SW 개방): 좌측 분리 → C가 R_load로 방전. τ = R_load·C, v_c(0⁺)=v_c(0⁻) (연속).
 *    v_o(t) = v_c(t) = v_c(0⁻)·e^(−t/τ)  (C∥R_load 병렬이라 v_o=v_c).
 *
 *  ★ generic switched_rc는 "τ·V_C(t)" generic 문제(지저분한 수치)를 만들어 원본의
 *    "v_c(0⁻) DC정상상태 + v_o(t) 방전" 구조를 잃음 → 전용 결정론 archetype.
 *
 *  값은 규칙 기반 구성(원본 예시 하드코딩 아님): V_s·R_s·I_s·R_load·C를 골라
 *  v_c(0⁻) 정수·τ 깔끔 되게 rejection. 원본 튜플 제외.
 */

export type SwitchedRcDcTransientGeneration = {
  values: { Vs: number; Rs: number; Is: number; Rload: number; C: number };
  answer: {
    vc0: number;     // v_c(0⁻) (V)
    tau: number;     // R_load·C (s)
    coeff: number;   // v_o(t) = coeff·e^(−t/τ), coeff = vc0
    rate: number;    // 1/τ
  };
  circuitDiagram: SwitchedRcDcCircuitDiagram;
};

const VS = [4, 5, 6, 8, 10];
const RS = [1, 2];
const IS = [2, 3, 4];
const RLOAD = [2, 3, 4];
const CCHOICE = [0.5, 1, 2, 2.5];

function vc0Of(Vs: number, Rs: number, Is: number, Rload: number): number {
  return (Vs / Rs + Is) / (1 / Rs + 1 / Rload);
}

function buildSpace(): Array<{ Vs: number; Rs: number; Is: number; Rload: number; C: number }> {
  const out: Array<{ Vs: number; Rs: number; Is: number; Rload: number; C: number }> = [];
  for (const Vs of VS)
    for (const Rs of RS)
      for (const Is of IS)
        for (const Rload of RLOAD) {
          const vc0 = vc0Of(Vs, Rs, Is, Rload);
          if (Math.abs(vc0 - Math.round(vc0)) > 1e-9) continue; // 정수
          if (vc0 < 2 || vc0 > 20) continue;
          for (const C of CCHOICE) {
            const tau = Rload * C;
            if (Math.abs(tau * 2 - Math.round(tau * 2)) > 1e-9) continue; // 0.5 배수
            // 원본 제외 (5V·1Ω·4A·2Ω·2.5F)
            if (Vs === 5 && Rs === 1 && Is === 4 && Rload === 2 && C === 2.5) continue;
            out.push({ Vs, Rs, Is, Rload, C });
          }
        }
  return out;
}
const SPACE = buildSpace();

function solve(p: { Vs: number; Rs: number; Is: number; Rload: number; C: number }): SwitchedRcDcTransientGeneration {
  const vc0 = round3(vc0Of(p.Vs, p.Rs, p.Is, p.Rload));
  const tau = round3(p.Rload * p.C);
  return {
    values: p,
    answer: { vc0, tau, coeff: vc0, rate: round3(1 / tau) },
    circuitDiagram: {
      vsLabel: `${p.Vs}V`,
      rsLabel: `${p.Rs}Ω`,
      isLabel: `${p.Is}A`,
      cLabel: `${p.C}F`,
      rlLabel: `${p.Rload}Ω`,
      vcLabel: "v_c(t)",
      voLabel: "v_o(t)",
    },
  };
}

export function generateSwitchedRcDcTransient(args: { seed?: number; mode: GenerationMode }): SwitchedRcDcTransientGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  const half = Math.floor(SPACE.length / 2);
  const space = args.mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return solve(pick(space.length ? space : SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외). */
export function __originalRcForVerify(): SwitchedRcDcTransientGeneration {
  return solve({ Vs: 5, Rs: 1, Is: 4, Rload: 2, C: 2.5 });
}
