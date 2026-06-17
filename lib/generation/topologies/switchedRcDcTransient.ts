import type { GenerationMode, SwitchedRcDcCircuitDiagram } from "@/types";
import { makeRand, pick, round3 } from "./_helpers";

/**
 * t=0 스위치 개방 RC/RL 회로 (임용 2번 회로이론) — 전용 archetype.
 *
 *  토폴로지: 좌측 [V_s(+직렬 R_s) ∥ I_s] ─[SW: t=0 개방]─ 우측 [리액티브 ∥ R_load(v_o)].
 *  ★ 기출유사유형(exam_similar) = RC (커패시터):
 *     t<0 DC정상상태(C 개방): v_c(0⁻) = (V_s/R_s + I_s)/(1/R_s + 1/R_load).
 *     t≥0(C가 R_load로 방전): τ = R_load·C, v_o(t)=v_c(t)=v_c(0⁻)·e^(−t/τ).
 *  ★ 기출변형유형(exam_variant) = RL (코일, 커패시터 대신):
 *     t<0 DC정상상태(L 단락): i_L(0⁻) = V_s/R_s + I_s (노드 0V, 전원전류 전부 L로).
 *     t≥0(L이 R_load로 방전): τ = L/R_load, i_L(t)=i_L(0⁻)·e^(−t/τ),
 *       v_o(t) = R_load·i_L(0⁻)·e^(−t/τ) (R_load 양단, 0→peak→감쇠).
 *
 *  값은 규칙 기반 구성(예시 목록 아님): rejection으로 초깃값 정수·τ 깔끔. RC 원본 튜플 제외.
 */

export type SwitchedRcDcTransientGeneration = {
  kind: "RC" | "RL";
  values: { Vs: number; Rs: number; Is: number; Rload: number; react: number }; // react = C(F) 또는 L(H)
  answer: {
    init0: number;        // v_c(0⁻)[V] (RC) 또는 i_L(0⁻)[A] (RL)
    initSym: string;      // "v_c(0⁻)" | "i_L(0⁻)"
    initUnit: string;     // "V" | "A"
    tau: number;          // s
    outSym: string;       // 출력: "v_o(t)" (RC) | "i_o(t)" (RL)
    outUnit: string;      // "V" | "A"
    outCoeff: number;     // 출력 = outCoeff·e^(−t/τ)
  };
  circuitDiagram: SwitchedRcDcCircuitDiagram;
};

const VS = [4, 5, 6, 8, 10];
const RS = [1, 2];
const IS = [2, 3, 4];
const RLOAD = [2, 3, 4];
const C_CHOICE = [0.5, 1, 2, 2.5];
const L_CHOICE = [1, 2, 3, 4, 6];

/** RC: 정상상태(C 개방) 노드 전압. */
function vc0Of(Vs: number, Rs: number, Is: number, Rload: number): number {
  return (Vs / Rs + Is) / (1 / Rs + 1 / Rload);
}
/** RL: 정상상태(L 단락) 인덕터 전류 = 전원이 노드에 주입하는 총 전류. */
function iL0Of(Vs: number, Rs: number, Is: number): number {
  return Vs / Rs + Is;
}

type Combo = { Vs: number; Rs: number; Is: number; Rload: number; react: number };

function buildSpaceRC(): Combo[] {
  const out: Combo[] = [];
  for (const Vs of VS) for (const Rs of RS) for (const Is of IS) for (const Rload of RLOAD) {
    const v = vc0Of(Vs, Rs, Is, Rload);
    if (Math.abs(v - Math.round(v)) > 1e-9 || v < 2 || v > 20) continue;
    for (const C of C_CHOICE) {
      const tau = Rload * C;
      if (Math.abs(tau * 2 - Math.round(tau * 2)) > 1e-9) continue;
      if (Vs === 5 && Rs === 1 && Is === 4 && Rload === 2 && C === 2.5) continue; // 원본 제외
      out.push({ Vs, Rs, Is, Rload, react: C });
    }
  }
  return out;
}
function buildSpaceRL(): Combo[] {
  const out: Combo[] = [];
  for (const Vs of VS) for (const Rs of RS) for (const Is of IS) for (const Rload of RLOAD) {
    const i = iL0Of(Vs, Rs, Is);
    if (!Number.isInteger(i) || i < 2 || i > 20) continue;
    for (const L of L_CHOICE) {
      const tau = L / Rload;
      if (Math.abs(tau * 2 - Math.round(tau * 2)) > 1e-9) continue; // 0.5 배수
      out.push({ Vs, Rs, Is, Rload, react: L });
    }
  }
  return out;
}
const SPACE_RC = buildSpaceRC();
const SPACE_RL = buildSpaceRL();

function solve(kind: "RC" | "RL", p: Combo): SwitchedRcDcTransientGeneration {
  if (kind === "RC") {
    const vc0 = round3(vc0Of(p.Vs, p.Rs, p.Is, p.Rload));
    const tau = round3(p.Rload * p.react);
    return {
      kind, values: p,
      // RC: 출력은 전압 v_o(t)=v_c(t) (C∥R).
      answer: { init0: vc0, initSym: "v_c(0⁻)", initUnit: "V", tau, outSym: "v_o(t)", outUnit: "V", outCoeff: vc0 },
      circuitDiagram: {
        kind: "RC", vsLabel: `${p.Vs}V`, rsLabel: `${p.Rs}Ω`, isLabel: `${p.Is}A`,
        reactLabel: `${p.react}F`, rlLabel: `${p.Rload}Ω`, reactMeasLabel: "v_c(t)", voLabel: "v_o(t)",
      },
    };
  }
  // RL — 출력은 ★ 전류 i_o(t)=i_L(t) ★ (L∥R, 인덕터 전류가 R_load로 흐름).
  const iL0 = round3(iL0Of(p.Vs, p.Rs, p.Is));
  const tau = round3(p.react / p.Rload);
  return {
    kind, values: p,
    answer: { init0: iL0, initSym: "i_L(0⁻)", initUnit: "A", tau, outSym: "i_o(t)", outUnit: "A", outCoeff: iL0 },
    circuitDiagram: {
      kind: "RL", vsLabel: `${p.Vs}V`, rsLabel: `${p.Rs}Ω`, isLabel: `${p.Is}A`,
      reactLabel: `${p.react}H`, rlLabel: `${p.Rload}Ω`, reactMeasLabel: "i_L(t)", voLabel: "i_o(t)",
    },
  };
}

export function generateSwitchedRcDcTransient(args: { seed?: number; mode: GenerationMode }): SwitchedRcDcTransientGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  // ★ 유사=RC(커패시터), 변형=RL(코일).
  if (args.mode === "exam_variant") return solve("RL", pick(SPACE_RL, rand));
  return solve("RC", pick(SPACE_RC, rand));
}

/** 원본(RC) 검증용 — 생성 풀 제외 튜플. */
export function __originalRcForVerify(): SwitchedRcDcTransientGeneration {
  return solve("RC", { Vs: 5, Rs: 1, Is: 4, Rload: 2, react: 2.5 });
}
