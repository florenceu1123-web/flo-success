import type { OpampThreeStageSumCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 3-OPAMP 응용회로: 반전증폭(V_x) + 버퍼 + 가산(R_f 도출) — 임용 2번 전자회로 전용 archetype.
 *
 *  공통 1·2단:
 *    1단(반전): V1 ─Rin1─ (−)U1, Rf1 피드백, (+)U1=GND  → V_x = −(Rf1/Rin1)·V1.
 *    2단(버퍼): V2 → (+)U2 (단위 이득)                 → V_buf = V2.
 *  3단(U3) — 모드별:
 *    exam_similar (반전가산): V_x─Ra·V_buf─Rb → (−)U3, R_f 피드백, (+)=GND → V_o = −R_f·(V_x/Ra+V_buf/Rb).
 *    ★ exam_variant (비반전가산): V_x─Ra·V_buf─Rb → ★(+)U3★, (−)에 R_g(접지)·R_f(피드백)
 *       → V_+ = (V_x·Rb+V_buf·Ra)/(Ra+Rb), V_o = (1+R_f/R_g)·V_+. R_f = R_g·(V_o/V_+ − 1).
 *
 *  ★ generic opamp_cascade/two_stage는 이 "V_x + R_f 도출" 구조를 잃음 → 전용 결정론 archetype.
 *  ★ 값은 규칙 열거+정수 필터, 원본 튜플 제외.
 */

export type OpampThreeStageSumGeneration = {
  values: {
    V1: number; Rin1: number; Rf1: number;  // 1단 (kΩ)
    V2: number;                              // 2단 버퍼 입력
    Ra: number; Rb: number;                  // 3단 입력 저항 (kΩ)
    Vo: number;                              // 목표 출력
    Rg?: number;                             // (변형 비반전) −단자 접지저항
  };
  answer: {
    Vx: number;       // 1단 출력 = −(Rf1/Rin1)·V1
    Vbuf: number;     // 2단 출력 = V2
    Rf: number;       // 도출 저항 (kΩ)
    gain1: number;    // Rf1/Rin1
    Vplus?: number;   // (변형) U3 + 단자 전압 = (V_x·Rb+V_buf·Ra)/(Ra+Rb)
    nonInv?: boolean; // 변형(비반전)이면 true
  };
  circuitDiagram: OpampThreeStageSumCircuitDiagram;
};

type Params = {
  V1: number; Rin1: number; Rf1: number; V2: number; Ra: number; Rb: number; Vo: number; Rg?: number;
};
// 원본 튜플 (참조·검증 전용, 생성 풀 제외): V1=2·Rin1=4·Rf1=8·V2=1·Ra=2·Rb=1·Vo=12 → V_x=−4·R_f=12.
const ORIGINAL: Params = { V1: 2, Rin1: 4, Rf1: 8, V2: 1, Ra: 2, Rb: 1, Vo: 12 };

function baseDiagram(p: Params): OpampThreeStageSumCircuitDiagram {
  return {
    v1Label: `${p.V1}[V]`, rin1Label: `${p.Rin1}[kΩ]`, rf1Label: `${p.Rf1}[kΩ]`,
    v2Label: `${p.V2}[V]`,
    raLabel: `${p.Ra}[kΩ]`, rbLabel: `${p.Rb}[kΩ]`, rfLabel: "R_f[kΩ]",
    vxLabel: "V_x[V]", voLabel: "V_o[V]",
  };
}

/** exam_similar: U3 반전가산. V_o = −R_f·(V_x/Ra + V_buf/Rb). */
function solve(p: Params): OpampThreeStageSumGeneration {
  const gain1 = p.Rf1 / p.Rin1;
  const Vx = -gain1 * p.V1;
  const Vbuf = p.V2;
  const term = Vx / p.Ra + Vbuf / p.Rb;
  const Rf = -p.Vo / term;
  return { values: { ...p }, answer: { Vx, Vbuf, Rf, gain1 }, circuitDiagram: baseDiagram(p) };
}

/** exam_variant: U3 비반전가산. V_+ = (V_x·Rb+V_buf·Ra)/(Ra+Rb), V_o = (1+R_f/R_g)·V_+. */
function solveNonInv(p: Params): OpampThreeStageSumGeneration {
  const gain1 = p.Rf1 / p.Rin1;
  const Vx = -gain1 * p.V1;
  const Vbuf = p.V2;
  const Rg = p.Rg!;
  const Vplus = (Vx * p.Rb + Vbuf * p.Ra) / (p.Ra + p.Rb);
  const Rf = Rg * (p.Vo / Vplus - 1);
  const circuitDiagram: OpampThreeStageSumCircuitDiagram = {
    ...baseDiagram(p), u3NonInverting: true, rgLabel: `${Rg}[kΩ]`,
  };
  return { values: { ...p, Rg }, answer: { Vx, Vbuf, Rf, gain1, Vplus, nonInv: true }, circuitDiagram };
}

/** exam_similar 풀: 반전가산, V_x 정수·R_f 양정수·term<0. 원본 제외. */
function buildSpace(): Params[] {
  const out: Params[] = [];
  const V1s = [1, 2, 3, 4], Rin1s = [1, 2, 4], Rf1s = [4, 6, 8, 12];
  const V2s = [1, 2, 3], Ras = [1, 2, 4], Rbs = [1, 2], Vos = [6, 8, 10, 12, 15, 20];
  for (const V1 of V1s) for (const Rin1 of Rin1s) for (const Rf1 of Rf1s) {
    if (!Number.isInteger(Rf1 / Rin1)) continue;
    for (const V2 of V2s) for (const Ra of Ras) for (const Rb of Rbs) for (const Vo of Vos) {
      const p: Params = { V1, Rin1, Rf1, V2, Ra, Rb, Vo };
      const a = solve(p).answer;
      if (!Number.isInteger(a.Vx) || a.Vx === 0) continue;
      if (a.Vx / Ra + V2 / Rb >= 0) continue;
      if (!Number.isInteger(a.Rf) || a.Rf < 2 || a.Rf > 40) continue;
      if (V1 === ORIGINAL.V1 && Rin1 === ORIGINAL.Rin1 && Rf1 === ORIGINAL.Rf1 &&
          V2 === ORIGINAL.V2 && Ra === ORIGINAL.Ra && Rb === ORIGINAL.Rb && Vo === ORIGINAL.Vo) continue;
      out.push(p);
    }
  }
  return out;
}
/** exam_variant 풀: 비반전가산. V_+>0 정수·이득>1·R_f 양정수. */
function buildSpaceNonInv(): Params[] {
  const out: Params[] = [];
  const V1s = [1, 2, 3], Rin1s = [1, 2], Rf1s = [2, 4, 6];
  const V2s = [4, 6, 8], Ras = [1, 2], Rbs = [1, 2], Rgs = [1, 2, 3, 4], Vos = [6, 8, 9, 10, 12];
  for (const V1 of V1s) for (const Rin1 of Rin1s) for (const Rf1 of Rf1s) {
    if (!Number.isInteger(Rf1 / Rin1)) continue;
    for (const V2 of V2s) for (const Ra of Ras) for (const Rb of Rbs) for (const Rg of Rgs) for (const Vo of Vos) {
      const p: Params = { V1, Rin1, Rf1, V2, Ra, Rb, Vo, Rg };
      const a = solveNonInv(p).answer;
      if (!Number.isInteger(a.Vx)) continue;
      if (a.Vplus === undefined || !Number.isInteger(a.Vplus) || a.Vplus < 1) continue; // V_+ 양의 정수
      if (Vo / a.Vplus <= 1) continue;                                                  // 이득 > 1
      if (!Number.isInteger(a.Rf) || a.Rf < 2 || a.Rf > 40) continue;                   // R_f 양의 정수
      out.push(p);
    }
  }
  return out;
}
const SPACE = buildSpace();
const SPACE_NONINV = buildSpaceNonInv();

export function generateOpampThreeStageSum(args: { seed?: number; mode: GenerationMode }): OpampThreeStageSumGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  if (args.mode === "exam_variant") {
    // ★ 변형유형: U3를 비반전 가산기로 (입력→+, R_g·R_f→−). 회로·정답 공식 달라짐.
    return solveNonInv(pick(SPACE_NONINV.length ? SPACE_NONINV : SPACE.map((p) => ({ ...p, Rg: 2 })), rand));
  }
  const half = Math.floor(SPACE.length / 2);
  return solve(pick(SPACE.slice(0, half).length ? SPACE.slice(0, half) : SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalThreeStageSumForVerify(): OpampThreeStageSumGeneration {
  return solve(ORIGINAL);
}
