import type { ZenerBjtRegulatorCircuitDiagram } from "@/types";
import { makeRand, pick, round3 } from "./_helpers";

/**
 * 제너다이오드 + BJT 전압 레귤레이터 (임용 8번 전자회로 형식) — 전용 archetype.
 *
 *  회로: 20V ─R1─ V_o(출력) ─ R3∥R4 ─ GND (부하, I_L).
 *        V_o 노드에 제너(V_z) + BJT 션트가 걸려 V_o = V_z + V_BE 로 안정화.
 *        R2는 베이스 기준 저항. 트랜지스터 포화(V_CE=0), V_BE=0.7.
 *
 *  ★ generic bjt 경로는 "포화영역" 키워드로 bjt_characteristic_curve(특성곡선)로 오분류 → 전용 archetype.
 *
 *  3단계 풀이 (닫힌형):
 *   [단계 1] V_o = V_z + V_BE.
 *   [단계 2] I_1 = (V_in − V_o)/R_1,  I_z = I_1 − I_L (션트 전류).
 *   [단계 3] R_3∥R_4 = V_o/I_L → R_4 = (R_load·R_3)/(R_3 − R_load).
 *
 *  ★ 토폴로지/풀이는 표준 제너-BJT 션트 레귤레이터 해석 (사용자 확인 시 정정 가능).
 */

export type ZenerBjtRegulatorGeneration = {
  circuitDiagram: ZenerBjtRegulatorCircuitDiagram;
  answer: {
    Vo: number;      // V
    I1: number;      // A
    I1mA: number;
    Iz: number;      // A
    IzmA: number;
    Rload: number;   // R3∥R4 (Ω)
    R4: number;      // Ω
  };
  values: { Vin: number; Vz: number; Vbe: number; R1: number; R2: number; R3: number; IL_mA: number };
};

type ParamSet = { Vin: number; Vz: number; Vbe: number; R1: number; R2: number; R3: number; IL_mA: number };

// 사전검증 세트 — 모두 깨끗한 답. 첫 세트 = 원본(20V·Vz7.3·R1=120·R3=150·IL=80mA → Vo=8·I1=100mA·Iz=20mA·R4=300Ω).
//   조건: Vo=Vz+Vbe, I1=(Vin−Vo)/R1 > IL (션트양수), Rload=Vo/IL < R3 (R4 양수).
const PARAM_SETS: ParamSet[] = [
  { Vin: 20, Vz: 7.3, Vbe: 0.7, R1: 120, R2: 500, R3: 150, IL_mA: 80 }, // 원본
  { Vin: 15, Vz: 4.3, Vbe: 0.7, R1: 100, R2: 470, R3: 200, IL_mA: 50 }, // Vo=5·I1=100·Iz=50·R4=200/... Rload=100
  { Vin: 24, Vz: 9.3, Vbe: 0.7, R1: 100, R2: 680, R3: 300, IL_mA: 100 },// Vo=10·I1=140·Iz=40·R4=150
  { Vin: 18, Vz: 5.3, Vbe: 0.7, R1: 80, R2: 470, R3: 300, IL_mA: 60 },  // Vo=6·I1=150·Iz=90
];

function solveSet(s: ParamSet): ZenerBjtRegulatorGeneration {
  const Vo = round3(s.Vz + s.Vbe);
  const I1 = (s.Vin - Vo) / s.R1;       // A
  const IL = s.IL_mA / 1000;
  const Iz = I1 - IL;                    // 션트 전류
  const Rload = Vo / IL;                 // R3∥R4
  const R4 = (Rload * s.R3) / (s.R3 - Rload);

  const fmtR = (r: number) => `${round3(r)}Ω`;
  const circuitDiagram: ZenerBjtRegulatorCircuitDiagram = {
    vinLabel: `${s.Vin}V`,
    vzLabel: `${s.Vz}V`,
    r1Label: fmtR(s.R1), r2Label: fmtR(s.R2), r3Label: fmtR(s.R3),
    voLabel: "V_o", ilLabel: "I_L", i1Label: "I_1",
  };
  return {
    circuitDiagram,
    answer: {
      Vo, I1: round3(I1), I1mA: round3(I1 * 1000),
      Iz: round3(Iz), IzmA: round3(Iz * 1000),
      Rload: round3(Rload), R4: round3(R4),
    },
    values: { Vin: s.Vin, Vz: s.Vz, Vbe: s.Vbe, R1: s.R1, R2: s.R2, R3: s.R3, IL_mA: s.IL_mA },
  };
}

export function generateZenerBjtRegulator(args: { seed?: number }): ZenerBjtRegulatorGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  return solveSet(pick(PARAM_SETS, rand));
}
