import type {
  AcDcSuperpositionRcCircuitDiagram,
  AcDcSuperpositionRcDualCircuitDiagram,
  GenerationMode,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * AC+DC 중첩 RC 회로 (임용 12번 회로이론 형식) — 결정론 생성기.
 *
 *  ★ 원본 토폴로지 (2026-08-05 원본 이미지를 **확대해 재확정** — [[feedback_verify_wiring_by_zoom]]):
 *    g ─ v(t) ─ TL ─ C ─ a                 (좌측 AC 소스 + 직렬 C)
 *    a ─[ R_2 ∥ R_3 ]─ c                    (상단 병렬 저항쌍, 둘 다 a–c 사이. 원본 2kΩ∥2kΩ)
 *    c ─ R_4 ─ g                            (우측 세로 저항, c→접지. **문항이 묻는 저항**, 원본 1kΩ)
 *    a ─ V_dc ─ ★R_1★ ─ b ─ g              (중앙: DC 소스 **아래 직렬 저항 R_1**, 원본 2kΩ)
 *    i_ac = a로 흘러드는 교류 전류, I_DC = b 지점 직류 전류.
 *
 *  ★★ **이전 구현은 R_1이 통째로 빠져 있었다** (사용자 신고 2026-08-05 "직류 전압원 아래 저항만 하나
 *     직렬로 추가하면 원본과 같을 것 같아"). R_1이 없으면 교류 해석에서 이상 전압원이 **점 a를 접지에
 *     그대로 클램프**해 `I_R4(AC) = 0`이 되어 [단계 1]의 둘째 물음이 무의미해진다. 실제 원본은 a가
 *     R_1을 거쳐 접지에 묶이므로 교류 전류가 **양쪽으로 나뉜다**(그게 이 문항의 핵심).
 *     ※ 문항이 묻는 R_4도 병렬쌍의 한쪽이 아니라 **우측 세로 저항**이다(원본 라벨 확인).
 *
 *  Rp = R_2 ∥ R_3, S = Rp + R_4 (a에서 우측 경로 저항).  중첩 해석:
 *   [DC] C 개방 → AC 가지 차단. 단일 루프 V_dc·R_1·Rp·R_4 → **I_DC = V_dc/(R_1+Rp+R_4)**.
 *        R_4는 그 루프에 직렬이므로 **I_R4(DC) = I_DC**.
 *   [AC] V_dc 단락 → 점 a에서 본 저항 **Z_R = R_1 ∥ S**. 직렬 C와 합쳐
 *        **i_ac 최댓값 = V_peak/√(X_C² + Z_R²)**, 전류분배로 **I_R4(AC) = i_ac·R_1/(R_1+S)**.
 *   [전체] R_4 최대 순시전류 = I_R4(DC) + I_R4(AC).
 *
 *  ★ 값 설계 규칙: **R_1 = S** 이고 **X_C = Z_R = S/2** 로 두면 위 네 값이 전부 깔끔하게 떨어진다
 *    (원본: S=2kΩ·R_1=2kΩ·X_C=1kΩ → I_DC=5mA·i_ac=10mA·I_R4(AC)=5mA·전체 10mA — 원본 정답과 일치).
 *  값은 사전검증 PARAM_SETS(원본값 포함). GPT 호출 없음.
 */

export type AcDcSuperpositionRcGeneration = {
  values: {
    vacPeak: number;   // AC peak (V)
    vacCoeff: number;  // vacPeak = vacCoeff·√2
    vdc: number;       // DC (V)
    omega: number;     // rad/s
    cUf: number;       // C (µF)
    r1: number;        // DC 전원과 직렬인 저항 (Ω) — 원본 R₁
    r3: number; r4: number; r5: number; // Ω (r3·r4 = 상단 병렬쌍 = 원본 R₂·R₃, r5 = 우측 세로 = 원본 R₄)
  };
  derived: {
    xC: number;         // |Z_C| = 1/(ωC) (Ω)
    rp: number;         // 상단 병렬쌍 합성 (Ω)
    sRight: number;     // S = rp + r5 (a에서 우측 경로 저항, Ω)
    zR: number;         // 교류에서 a가 보는 저항 = r1 ∥ S (Ω)
    iDcMa: number;      // I_DC (mA) — 단일 루프 전류
    iR4DcMa: number;    // I_R4(DC) (mA) = I_DC (직렬)
    iAbAcCoeff: number; // i_ac 최댓값 (mA) — 설계 규칙상 정수
    iAbAcMa: number;    // i_ac 최댓값 십진 (mA)
    iR4AcMa: number;    // I_R4(AC) 최댓값 (mA)
    iR4TotalMaxMa: number; // 전체 R_4 최대 순시전류 = I_R4(DC) + I_R4(AC)
  };
  circuitDiagram: AcDcSuperpositionRcCircuitDiagram;
};

type ParamSet = {
  vacCoeff: number; vdc: number; omega: number; cUf: number;
  r1: number; r3: number; r4: number; r5: number;
};

// 사전검증 세트 — 설계 규칙 **R_1 = S = Rp + R_4**, **X_C = S/2** (그러면 네 답이 모두 정수 mA).
//   첫 세트 = 원본 값 (v=10√2, 20V, C=0.2µF, R₁=2k, 병렬쌍 2k∥2k, 우측 1k)
//   → I_DC=5mA · i_ac=10mA · I_R4(AC)=5mA · 전체 10mA (원본 정답).
const PARAM_SETS: ParamSet[] = [
  { vacCoeff: 10, vdc: 20, omega: 5000, cUf: 0.2, r1: 2000, r3: 2000, r4: 2000, r5: 1000 }, // 원본
  { vacCoeff: 8,  vdc: 16, omega: 5000, cUf: 0.2, r1: 2000, r3: 2000, r4: 2000, r5: 1000 },
  { vacCoeff: 6,  vdc: 24, omega: 5000, cUf: 0.2, r1: 2000, r3: 2000, r4: 2000, r5: 1000 },
  { vacCoeff: 12, vdc: 24, omega: 5000, cUf: 0.1, r1: 4000, r3: 4000, r4: 4000, r5: 2000 },
  { vacCoeff: 10, vdc: 20, omega: 5000, cUf: 0.4, r1: 1000, r3: 1000, r4: 1000, r5: 500 },
];

const round3 = (x: number): number => Math.round(x * 1000) / 1000;
const sqrt2Label = (coeff: number): string => `${coeff}√2`;

function solve(set: ParamSet): AcDcSuperpositionRcGeneration {
  const { vacCoeff, vdc, omega, cUf, r1, r3, r4, r5 } = set;
  const vacPeak = vacCoeff * Math.SQRT2;
  const c = cUf * 1e-6;
  const xC = 1 / (omega * c);
  const rp = (r3 * r4) / (r3 + r4);        // 상단 병렬쌍
  const sRight = rp + r5;                   // a → (병렬쌍) → c → R_4 → 접지
  const zR = (r1 * sRight) / (r1 + sRight); // 교류에서 a가 보는 저항 (V_dc 단락)

  // [DC] C 개방 → 단일 루프 V_dc · R_1 · Rp · R_4. R_4는 루프에 직렬이라 I_R4(DC)=I_DC.
  const iDc = vdc / (r1 + sRight);        // A
  const iR4Dc = iDc;                       // 직렬
  // [AC] V_dc 단락 → Z = −jX_C + (R_1 ∥ S). 전류분배로 R_4 가지 몫을 구한다.
  const iAcA = vacPeak / Math.hypot(xC, zR);      // A peak (a로 흘러드는 교류 전류)
  const iR4AcA = iAcA * (r1 / (r1 + sRight));     // A peak (우측 가지 몫)

  const toMa = (a: number) => round3(a * 1000);
  const iR4DcMa = toMa(iR4Dc);
  const iR4AcMa = toMa(iR4AcA);

  const derived = {
    xC: round3(xC),
    rp: round3(rp),
    sRight: round3(sRight),
    zR: round3(zR),
    iDcMa: toMa(iDc),
    iR4DcMa,
    iAbAcCoeff: toMa(iAcA),   // 설계 규칙(X_C=Z_R=S/2)상 정수 mA로 떨어진다
    iAbAcMa: toMa(iAcA),
    iR4AcMa,
    iR4TotalMaxMa: round3(iR4DcMa + iR4AcMa),
  };

  const fmtR = (r: number): string => (r >= 1000 ? `${r / 1000}kΩ` : `${r}Ω`);
  const circuitDiagram: AcDcSuperpositionRcCircuitDiagram = {
    vacLabel: `v(t) = ${sqrt2Label(vacCoeff)} cos${omega}t [V]`,
    vacPhasor: `${sqrt2Label(vacCoeff)}∠0° V`,
    vdcLabel: `${vdc}V`,
    cLabel: `${cUf}µF`,
    omegaLabel: `${omega} rad/s`,
    r1Label: fmtR(r1),
    r3Label: fmtR(r3),
    r4Label: fmtR(r4),
    r5Label: fmtR(r5),
    iabLabel: "i_ac(t)",
    idcLabel: "I_DC",
  };

  return {
    values: { vacPeak: round3(vacPeak), vacCoeff, vdc, omega, cUf, r1, r3, r4, r5 },
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
    r1d: number;       // R₁의 쌍대 (직류 전류원과 **병렬**)
    r3d: number; r4d: number; r5d: number; // Ω (쌍대)
  };
  derived: {
    xL: number;          // ωL (Ω)
    rSeries: number;     // R2'+R3' (원본 병렬쌍의 쌍대 = 직렬 합, Ω)
    vDcV: number;        // V_DC (V) = 직류 응답 (원본 I_DC[mA]의 거울)
    vR4DcV: number;      // V_R4(DC) (V)
    vAbAcCoeff: number;  // v_ac 최댓값 (V) — 원본 i_ac[mA]의 거울
    vAbAcV: number;      // v_ac 최댓값 십진 (V)
    vR4AcV: number;      // V_R4(AC) 최댓값 (V) — ★ 더 이상 0이 아니다 (R₁' 효과)
    vR4TotalMaxV: number;// 전체 V_R4 최대 = V_R4(DC) + V_R4(AC)
  };
  circuitDiagram: AcDcSuperpositionRcDualCircuitDiagram;
};

function solveDual(set: ParamSet): AcDcSuperpositionRcDualGeneration {
  const { vacCoeff, vdc, omega, cUf, r1, r3, r4, r5 } = set;
  const c = cUf * 1e-6;
  // ★ 쌍대 소자 매핑 (임피던스 스케일 R0): V↔I · 직렬↔병렬 · R↔R0²/R · C↔L=R0²·C.
  //   원본(수정 후)은 마디 a에서 접지로 가는 **세 가지**가 병렬이다:
  //     ① v(t)+직렬 C   ② V_dc+직렬 R₁   ③ (R₂∥R₃)+직렬 R₄
  //   그 쌍대는 **하나의 루프에 세 소자가 직렬**이고, 각 가지 내부는 직렬↔병렬로 뒤집힌다:
  //     ① i(t)∥L        ② I_dc∥R₁'      ③ (R₂'+R₃')∥R₄'
  const r1d = (R0 * R0) / r1;
  const r3d = (R0 * R0) / r3;
  const r4d = (R0 * R0) / r4;
  const r5d = (R0 * R0) / r5;
  const lH = R0 * R0 * c;               // L = R0²·C
  const xL = omega * lH;
  const rSeries = r3d + r4d;            // (R₂∥R₃)의 쌍대 = 직렬 합

  // ★★ 답은 **원본 해의 정확한 거울**이다 (I[mA] ↔ V[V], 스케일 R0=1kΩ).
  //   쌍대 회로를 따로 풀지 않고 원본 해를 매핑한다 — 듀얼리티가 일치를 보장하고,
  //   두 경로가 서로 다른 식으로 계산돼 어긋나는 사고(이 저장소에서 반복)를 원천 차단한다.
  //   ※ 단위: V = I[A]·R₀ = (I[mA]/1000)·1000Ω → **수치가 그대로** 옮겨진다(mA 값 = V 값).
  const base = solve(set);
  const vDc = base.derived.iDcMa;         // V
  const vAbAc = base.derived.iAbAcMa;     // V peak
  const vR4Dc = base.derived.iR4DcMa;     // V
  const vR4Ac = base.derived.iR4AcMa;     // V
  const vAbAcCoeff = round3(base.derived.iAbAcMa);

  const fmtR = (r: number): string => (r >= 1000 ? `${round3(r / 1000)}kΩ` : `${round3(r)}Ω`);
  const circuitDiagram: AcDcSuperpositionRcDualCircuitDiagram = {
    iacLabel: `i(t) = ${vacCoeff}√2 cos${omega}t [mA]`,
    iacPhasor: `${vacCoeff}√2∠0° mA`,
    idcLabel: `${vdc}mA`,
    lLabel: `L=${round3(lH)}H`,
    omegaLabel: `${omega} rad/s`,
    r1Label: fmtR(r1d),
    r3Label: fmtR(r3d),
    r4Label: fmtR(r4d),
    r5Label: fmtR(r5d),
    vabLabel: "v_ab(t)",
    vdcLabel: "V_DC",
  };

  return {
    values: {
      iacCoeff: vacCoeff, idcMa: vdc, omega, lH: round3(lH),
      r1d: round3(r1d), r3d: round3(r3d), r4d: round3(r4d), r5d: round3(r5d),
    },
    derived: {
      xL: round3(xL),
      rSeries: round3(rSeries),
      vDcV: round3(vDc),
      vR4DcV: round3(vR4Dc),
      vAbAcCoeff,
      vAbAcV: round3(vAbAc),
      vR4AcV: round3(vR4Ac),
      vR4TotalMaxV: round3(vR4Dc + vR4Ac),
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
