import type {
  AcBridgeCircuitDiagram,
  AcBridgeTheveninCircuitDiagram,
  GenerationMode,
} from "@/types";
import { makeRand, pick, round3 } from "./_helpers";

/**
 * AC 휘트스톤 브리지 + 테브난 등가 + 최대평균전력 (임용 7번 회로이론) — 전용 archetype.
 *
 *  (가) 브리지: 교류원 V(∠0°). 다이아몬드 4-arm:
 *    좌상 Z1=−jXc1(C), 우상 Z2=R2, 좌하 Z3=+jXl(L), 우하 Z4=R4. 부하 R_L이 A–B 가교.
 *    V_A = Z3 양단 전압(A↔하단), V_B = Z4 양단 전압.
 *  3단계:
 *    [1] A–B 개방 시 V_A = V·Z3/(Z1+Z3), V_B = V·Z4/(Z2+Z4).  (∴ V_TH = V_A − V_B)
 *    [2] Z_TH = (Z1∥Z3) + (Z2∥Z4) = Rpar − jXpar.
 *    [3] 순저항 부하 최대평균전력 → R_L = |Z_TH| = √(Rpar²+Xpar²),  P_max = |V_TH|²·R_L/((Rpar+R_L)²+Xpar²).
 *
 *  ★ generic universal_ac는 브리지(다이아몬드 4-arm + A·B 가교) 구조를 잃고 임의 병렬회로로 변질
 *    → figure·답 모두 깨짐 → 전용 결정론 archetype 필수.
 *
 *  값은 규칙 기반 구성(좌=리액티브 분압·우=저항 분압, Pythagorean으로 |Z_TH| 정수), 원본 튜플 제외.
 */

export type AcBridgeMaxPowerGeneration = {
  values: { V: number; Xc1: number; Xl: number; R2: number; R4: number };
  answer: {
    VA: number;      // V (∠0°)
    VB: number;
    VTH: number;     // V_A − V_B
    Rpar: number;    // Re(Z_TH) = Z2∥Z4
    Xpar: number;    // |Im(Z_TH)| = Xc1·Xl/(Xl−Xc1) (용량성, −jXpar)
    absZth: number;  // |Z_TH|
    RL: number;      // = |Z_TH|
    Pmax: number;    // W
  };
  bridgeDiagram: AcBridgeCircuitDiagram;       // (가)
  theveninDiagram: AcBridgeTheveninCircuitDiagram; // (나)
};

type Family = { Xc1: number; Xl: number; R2: number; R4: number };
// Pythagorean (Rpar, Xpar) → |Z_TH| 정수. (Xpar=Xc1·Xl/(Xl−Xc1), Rpar=R2∥R4)
const FAMILIES: Family[] = [
  { Xc1: 2, Xl: 4, R2: 6, R4: 6 },   // Rpar3·Xpar4·|5|  (원본 패밀리)
  { Xc1: 2, Xl: 6, R2: 8, R4: 8 },   // Rpar4·Xpar3·|5|
  { Xc1: 4, Xl: 8, R2: 12, R4: 12 }, // Rpar6·Xpar8·|10|
  { Xc1: 3, Xl: 6, R2: 16, R4: 16 }, // Rpar8·Xpar6·|10|
];
const V_CHOICES = [4, 6, 8, 10, 12];

function solveBridge(V: number, f: Family): AcBridgeMaxPowerGeneration {
  const { Xc1, Xl, R2, R4 } = f;
  const VA = V * Xl / (Xl - Xc1);          // 좌 리액티브 분압 (실수)
  const VB = V * R4 / (R2 + R4);           // 우 저항 분압
  const VTH = VA - VB;
  const Rpar = (R2 * R4) / (R2 + R4);      // Z2∥Z4
  const Xpar = (Xc1 * Xl) / (Xl - Xc1);    // |Z1∥Z3| 리액턴스 (용량성)
  const absZth = Math.sqrt(Rpar * Rpar + Xpar * Xpar);
  const RL = absZth;
  const Pmax = (VTH * VTH * RL) / ((Rpar + RL) ** 2 + Xpar * Xpar);

  const z = (re: number, imSign: "+" | "-", im: number) => `${re === 0 ? "" : re}${imSign === "-" ? "−" : "+"}j${im}Ω`;
  const bridgeDiagram: AcBridgeCircuitDiagram = {
    vLabel: `V=${V}∠0°V`,
    z1Label: `−j${Xc1}Ω`,
    z2Label: `${R2}Ω`,
    z3Label: `j${Xl}Ω`,
    z4Label: `${R4}Ω`,
    rlLabel: "R_L",
  };
  const theveninDiagram: AcBridgeTheveninCircuitDiagram = {
    vthLabel: "V_TH",
    zthLabel: "Z_TH",
    rlLabel: "R_L",
  };
  void z;

  return {
    values: { V, Xc1, Xl, R2, R4 },
    answer: {
      VA: round3(VA), VB: round3(VB), VTH: round3(VTH),
      Rpar: round3(Rpar), Xpar: round3(Xpar), absZth: round3(absZth),
      RL: round3(RL), Pmax: round3(Pmax),
    },
    bridgeDiagram,
    theveninDiagram,
  };
}

/** 규칙 제약(V_A·V_B·V_TH 정수, 원본 제외) 만족 조합 enumerate. */
function buildSpace(): Array<{ V: number; f: Family }> {
  const out: Array<{ V: number; f: Family }> = [];
  for (const f of FAMILIES)
    for (const V of V_CHOICES) {
      const g = solveBridge(V, f);
      const a = g.answer;
      if (!Number.isInteger(a.VA) || !Number.isInteger(a.VB) || !Number.isInteger(a.VTH)) continue;
      if (a.VTH <= 0) continue;
      // 원본 제외 (V=4, Xc1=2, Xl=4, R2=R4=6)
      if (V === 4 && f.Xc1 === 2 && f.Xl === 4 && f.R2 === 6 && f.R4 === 6) continue;
      out.push({ V, f });
    }
  return out;
}
const SPACE = buildSpace();

export function generateAcBridgeMaxPower(args: { seed?: number; mode: GenerationMode }): AcBridgeMaxPowerGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  const half = Math.floor(SPACE.length / 2);
  const space = args.mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  const c = pick(space.length ? space : SPACE, rand);
  return solveBridge(c.V, c.f);
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalBridgeForVerify(): AcBridgeMaxPowerGeneration {
  return solveBridge(4, FAMILIES[0]);
}
