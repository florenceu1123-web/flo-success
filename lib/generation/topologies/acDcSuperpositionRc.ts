import type {
  AcDcSuperpositionRcCircuitDiagram,
  AcDcSuperpositionRcDualCircuitDiagram,
  GenerationMode,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * AC+DC 중첩 RC 회로 (임용 12번 회로이론 형식) — 결정론 생성기.
 *
 *  ★ 원본 토폴로지 (사용자 이미지 확정, 4 노드 a·b·c·g):
 *    g ─ v(t) ─ TL ─ C ─ a                (좌측 AC 소스 + 직렬 C)
 *    a ─[ R_3 ∥ R_4 ]─ c                   (상단 병렬 저항쌍, 둘 다 a–c 사이)
 *    c ─ R_5 ─ g                           (우측 세로 저항, c→접지)
 *    a ─ V_dc ─ b ─ (도선) ─ g             (중앙: DC 소스, b는 바닥 접지선 직결)
 *    i_ab = a→b (20V 가지 전류), I_DC = b 지점.
 *
 *  Rp = R_3 ∥ R_4.  중첩 해석:
 *   [DC] C 개방 → AC 가지 차단. 직렬 루프 V_dc·Rp·R_5 → I_dc = V_dc/(Rp+R_5).
 *        i_ab(DC)=I_DC = I_dc, I_R4(DC) = I_dc·R_3/(R_3+R_4) (병렬 전류분배).
 *   [AC] V_dc 단락 → 점 a가 접지에 클램프(이상 전압원=AC 단락). R_3∥R_4 양단 전압 0 →
 *        ★ I_R4(AC) = 0. 모든 교류는 20V 가지로: i_ab(AC) = V_peak/|Z_C| = V_peak·ωC.
 *   [전체] R_4 최대 순시전류 = I_R4(DC) + I_R4(AC) = I_R4(DC). (AC분 0)
 *         i_ab 최대 = I_dc + i_ab(AC).
 *
 *  ★ 교육 포인트: 직류 전원이 교류 해석에서 단락이 되어 점 a를 클램프 → R₃·R₄엔 교류 전류 없음.
 *  값은 사전검증 PARAM_SETS(원본값 포함). GPT 호출 없음.
 */

export type AcDcSuperpositionRcGeneration = {
  values: {
    vacPeak: number;   // AC peak (V)
    vacCoeff: number;  // vacPeak = vacCoeff·√2
    vdc: number;       // DC (V)
    omega: number;     // rad/s
    cUf: number;       // C (µF)
    r3: number; r4: number; r5: number; // Ω
  };
  derived: {
    xC: number;         // |Z_C| = 1/(ωC) (Ω)
    rp: number;         // R_3 ∥ R_4 (Ω)
    iDcMa: number;      // I_dc = i_ab(DC) = I_DC (mA)
    iR4DcMa: number;    // I_R4(DC) (mA)
    iAbAcCoeff: number; // i_ab(AC) = iAbAcCoeff·√2 (mA)
    iAbAcMa: number;    // i_ab(AC) 십진 (mA)
    iR4AcMa: number;    // I_R4(AC) = 0 (mA)
    iR4TotalMaxMa: number; // 전체 R_4 최대 순시전류 (= I_R4(DC))
  };
  circuitDiagram: AcDcSuperpositionRcCircuitDiagram;
};

type ParamSet = {
  vacCoeff: number; vdc: number; omega: number; cUf: number;
  r3: number; r4: number; r5: number;
};

// 사전검증 세트 — DC 정수 mA + i_ab(AC) = 정수·√2 mA (coeff·1000/X 정수).
//   첫 세트 = 원본 값 (v=10√2, 20V, C=0.2µF, R3=R4=2k, R5=1k).
const PARAM_SETS: ParamSet[] = [
  { vacCoeff: 10, vdc: 20, omega: 5000, cUf: 0.2, r3: 2000, r4: 2000, r5: 1000 }, // 원본
  { vacCoeff: 8,  vdc: 16, omega: 5000, cUf: 0.2, r3: 2000, r4: 2000, r5: 1000 },
  { vacCoeff: 12, vdc: 24, omega: 5000, cUf: 0.2, r3: 2000, r4: 2000, r5: 2000 },
  { vacCoeff: 10, vdc: 24, omega: 5000, cUf: 0.1, r3: 4000, r4: 4000, r5: 2000 },
  { vacCoeff: 6,  vdc: 18, omega: 5000, cUf: 0.2, r3: 2000, r4: 2000, r5: 1000 },
];

const round3 = (x: number): number => Math.round(x * 1000) / 1000;
const sqrt2Label = (coeff: number): string => `${coeff}√2`;

function solve(set: ParamSet): AcDcSuperpositionRcGeneration {
  const { vacCoeff, vdc, omega, cUf, r3, r4, r5 } = set;
  const vacPeak = vacCoeff * Math.SQRT2;
  const c = cUf * 1e-6;
  const xC = 1 / (omega * c);
  const rp = (r3 * r4) / (r3 + r4);

  // DC: 직렬 루프 Vdc·Rp·R5
  const iDc = vdc / (rp + r5);            // A
  const iR4Dc = iDc * (r3 / (r3 + r4));   // 병렬 분배
  // AC: 점 a 클램프 → R3∥R4 교류 전류 0. i_ab(AC) = Vpeak/X (모두 20V 가지로)
  const iAbAcA = vacPeak / xC;            // A peak
  const iAbAcCoeff = round3((vacCoeff * 1000) / xC); // √2 계수 (mA)

  const toMa = (a: number) => round3(a * 1000);
  const iR4DcMa = toMa(iR4Dc);

  const derived = {
    xC: round3(xC),
    rp: round3(rp),
    iDcMa: toMa(iDc),
    iR4DcMa,
    iAbAcCoeff,
    iAbAcMa: toMa(iAbAcA),
    iR4AcMa: 0,
    iR4TotalMaxMa: iR4DcMa, // + 0
  };

  const fmtR = (r: number): string => (r >= 1000 ? `${r / 1000}kΩ` : `${r}Ω`);
  const circuitDiagram: AcDcSuperpositionRcCircuitDiagram = {
    vacLabel: `v(t) = ${sqrt2Label(vacCoeff)} cos${omega}t [V]`,
    vacPhasor: `${sqrt2Label(vacCoeff)}∠0° V`,
    vdcLabel: `${vdc}V`,
    cLabel: `${cUf}µF`,
    omegaLabel: `${omega} rad/s`,
    r3Label: fmtR(r3),
    r4Label: fmtR(r4),
    r5Label: fmtR(r5),
    iabLabel: "i_ab(t)",
    idcLabel: "I_DC",
  };

  return {
    values: { vacPeak: round3(vacPeak), vacCoeff, vdc, omega, cUf, r3, r4, r5 },
    derived,
    circuitDiagram,
  };
}

export function generateAcDcSuperpositionRc(args: {
  seed?: number;
  mode: GenerationMode;
}): AcDcSuperpositionRcGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  const set = pick(PARAM_SETS, rand);
  return solve(set);
}

// =====================================================================
// 쌍대(dual) 회로 — 기출변형유형. V↔I, R↔1/R, C↔L, 직렬↔병렬 (스케일 R0=1kΩ).
//   원본(RC·전압원·전류측정)의 정확한 쌍대 = RL·전류원·전압측정.
//   해석도 쌍대: [DC] L 단락(↔C 개방), [AC] 직류 전류원 개방(↔직류 전압원 단락)→V_R4(AC)=0.
// =====================================================================
const R0 = 1000; // 쌍대 스케일 저항 (Ω)

export type AcDcSuperpositionRcDualGeneration = {
  values: {
    iacCoeff: number;  // i(t) peak = iacCoeff·√2 (mA)
    idcMa: number;     // 직류 전류원 (mA)
    omega: number;
    lH: number;        // L (H)
    r3d: number; r4d: number; r5d: number; // Ω (쌍대)
  };
  derived: {
    xL: number;          // ωL (Ω)
    rSeries: number;     // R3'+R4' (Ω)
    vDcV: number;        // V_DC (V) = 직류 응답
    vR4DcV: number;      // V_R4(DC) (V)
    vAbAcCoeff: number;  // v_ab(AC) = coeff·√2 (V)
    vAbAcV: number;      // v_ab(AC) 십진 (V)
    vR4AcV: number;      // V_R4(AC) = 0
    vR4TotalMaxV: number;// 전체 V_R4 최대 (= V_R4(DC))
  };
  circuitDiagram: AcDcSuperpositionRcDualCircuitDiagram;
};

function solveDual(set: ParamSet): AcDcSuperpositionRcDualGeneration {
  const { vacCoeff, vdc, omega, cUf, r3, r4, r5 } = set;
  const c = cUf * 1e-6;
  // 쌍대 소자
  const r3d = (R0 * R0) / r3;
  const r4d = (R0 * R0) / r4;
  const r5d = (R0 * R0) / r5;
  const lH = R0 * R0 * c;               // L = R0²·C
  const iacPeakA = (vacCoeff * Math.SQRT2) / R0; // i(t) peak (A)
  const idcA = vdc / R0;                 // 직류 전류원 (A)

  const xL = omega * lH;
  const rSeries = r3d + r4d;
  const rPar = (r5d * rSeries) / (r5d + rSeries);
  // DC (L 단락): V_DC = Idc · (R5' ∥ (R3'+R4'))
  const vDc = idcA * rPar;               // V
  const iBranch = vDc / rSeries;         // R3'+R4' 가지 전류
  const vR4Dc = iBranch * r4d;           // V
  // AC (직류 전류원 개방): V_R4(AC)=0, v_ab(AC)=i(t)·ωL
  const vAbAc = iacPeakA * xL;           // V peak
  const vAbAcCoeff = round3((vacCoeff * 1000) / (1 / (omega * c))); // = iAbAcCoeff (mirror)

  const fmtR = (r: number): string => (r >= 1000 ? `${round3(r / 1000)}kΩ` : `${round3(r)}Ω`);
  const circuitDiagram: AcDcSuperpositionRcDualCircuitDiagram = {
    iacLabel: `i(t) = ${vacCoeff}√2 cos${omega}t [mA]`,
    iacPhasor: `${vacCoeff}√2∠0° mA`,
    idcLabel: `${vdc}mA`,
    lLabel: `L=${round3(lH)}H`,
    omegaLabel: `${omega} rad/s`,
    r3Label: fmtR(r3d),
    r4Label: fmtR(r4d),
    r5Label: fmtR(r5d),
    vabLabel: "v_ab(t)",
    vdcLabel: "V_DC",
  };

  return {
    values: { iacCoeff: vacCoeff, idcMa: vdc, omega, lH: round3(lH), r3d: round3(r3d), r4d: round3(r4d), r5d: round3(r5d) },
    derived: {
      xL: round3(xL),
      rSeries: round3(rSeries),
      vDcV: round3(vDc),
      vR4DcV: round3(vR4Dc),
      vAbAcCoeff,
      vAbAcV: round3(vAbAc),
      vR4AcV: 0,
      vR4TotalMaxV: round3(vR4Dc),
    },
    circuitDiagram,
  };
}

export function generateAcDcSuperpositionRcDual(args: {
  seed?: number;
}): AcDcSuperpositionRcDualGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const set = pick(PARAM_SETS, rand);
  return solveDual(set);
}
