import type { AcSuperpositionSourceDesignCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 2전원(교류 전압원 + 전류원) 페이저 회로 — 중첩의 원리로 **전원 크기 역산** (임용 5번 회로이론).
 *
 *  고정 토폴로지 (원본 그대로):
 *      ┌── R₁ ──┬── R₂ ──┐
 *      │        A        │
 *     V_s∠0°   [R₃]     I_s∠−90°      중간 leg: R₃ + jX_L + (−jX_C) 직렬
 *      │      [jX_L]      │           목표 전압 V_c = 커패시터 양단 (하단 소자)
 *      │      [−jX_C] V_c │
 *      └────── GND ───────┘
 *
 *  · [단계 1] 전류원 개방 → V_c1 = k₁·V_s,  k₁ = (−jX_C)/(R₁+Z_mid)
 *  · [단계 2] 전압원 단락 → V_c2 = k₂·I_s,  k₂ = (−j)(−jX_C)·R₁/(R₁+Z_mid)
 *      (전압원 단락 시 R₁이 접지로 분류 → 중간 leg 전류 = I_s·R₁/(R₁+Z_mid))
 *  · [단계 3] V_c = V_c1 + V_c2 = 목표값 → 실수부·허수부 연립 → **V_s·I_s 크기**
 *  ★ R₂는 이상 전류원과 직렬이라 답에 영향 없음 (원본도 동일 — 구조 보존용).
 *
 *  ★ 왜 전용 archetype인가:
 *    기존 `ac_superposition`(임용 10번)은 **정방향**(전류 I_b·전력 P) 문제라 이 역문제를 재현 못 하고,
 *    generic `universal_ac`로 떨어지면 발문이 "단계별로 회로를 분석하고 각 단계에서 요구하는 결과를
 *    도출하시오"라는 **빈 placeholder**가 되고 전원 값도 기호(V∠0°·I∠−90°)로 남는다(실측 신고).
 *
 *  ★ 값은 규칙 열거 + 필터 — k₁·k₂가 **가우스 정수**가 되는 조합만 채택(단계 1·2 식이 깔끔),
 *    V_s·I_s는 양의 정수, 목표 V_c도 정수. 원본 튜플 제외.
 */

export type AcSuperpositionSourceDesignGeneration = {
  values: {
    R1: number; R2: number; R3: number; XL: number; XC: number;
    Vs: number; Is: number;
    /** 목표 전압을 측정하는 소자 — 유사=커패시터(원본), 변형=인덕터(소자 교환) */
    target: "capacitor" | "inductor";
  };
  answer: {
    Vs: number; Is: number;
    k1: [number, number];       // V_c1 = k1·V_s
    k2: [number, number];       // V_c2 = k2·I_s
    vTarget: [number, number];  // 목표 페이저 (실수부, 허수부)
  };
  circuitDiagram: AcSuperpositionSourceDesignCircuitDiagram;
};

type C = [number, number];
const cAdd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const cMul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cDiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const isInt = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;
const isGauss = (z: C) => isInt(z[0]) && isInt(z[1]);
const rnd = (z: C): C => [Math.round(z[0]), Math.round(z[1])];

type Params = {
  R1: number; R2: number; R3: number; XL: number; XC: number;
  Vs: number; Is: number; target: "capacitor" | "inductor";
};

// 원본 튜플 (참조·검증 전용, 생성 풀 제외): R₁1·R₂2·R₃2·jX_L 11·−jX_C 10, V_c=−7−j → V_s=1·I_s=2.
const ORIGINAL: Params = { R1: 1, R2: 2, R3: 2, XL: 11, XC: 10, Vs: 1, Is: 2, target: "capacitor" };

/** 계수 k₁·k₂ (목표 소자에 따라 −jX_C ↔ jX_L 교체) */
function coeffs(p: Params): { k1: C; k2: C } {
  const Zmid: C = [p.R3, p.XL - p.XC];
  const den: C = cAdd([p.R1, 0], Zmid);
  // 목표 소자의 임피던스 — 유사: 커패시터(−jX_C), 변형: 인덕터(+jX_L)
  const Ztgt: C = p.target === "capacitor" ? [0, -p.XC] : [0, p.XL];
  const k1 = cDiv(Ztgt, den);                                   // 전류원 개방: 분압
  const k2 = cMul([0, -1], cMul(Ztgt, cDiv([p.R1, 0], den)));    // 전압원 단락: I_s∠−90° 전류분배
  return { k1, k2 };
}

function solve(p: Params): AcSuperpositionSourceDesignGeneration {
  const { k1, k2 } = coeffs(p);
  const vTarget: C = [k1[0] * p.Vs + k2[0] * p.Is, k1[1] * p.Vs + k2[1] * p.Is];

  const tgtLabel = p.target === "capacitor" ? "V_c" : "V_L";
  const circuitDiagram: AcSuperpositionSourceDesignCircuitDiagram = {
    r1Label: `${p.R1}[Ω]`,
    r2Label: `${p.R2}[Ω]`,
    r3Label: `${p.R3}[Ω]`,
    lLabel: `j${p.XL}[Ω]`,
    cLabel: `−j${p.XC}[Ω]`,
    vsLabel: "V_s∠0°[V]",
    isLabel: "I_s∠−90°[A]",
    targetLabel: tgtLabel,
    targetOn: p.target,
  };

  return {
    values: { ...p },
    answer: { Vs: p.Vs, Is: p.Is, k1: rnd(k1), k2: rnd(k2), vTarget: rnd(vTarget) },
    circuitDiagram,
  };
}

/**
 * 규칙 열거 + 필터 (예시 하드코딩 금지):
 *   k₁·k₂가 가우스 정수 → 단계 1·2의 계수가 깔끔.
 *   V_s·I_s 양의 정수(≤6), 목표 V_c 실수부·허수부 정수(|·|≤30, 0 아님). 원본 튜플 제외.
 */
function buildSpace(target: "capacitor" | "inductor"): Params[] {
  const out: Params[] = [];
  const R1s = [1, 2, 3];
  const R2s = [2, 3, 4];
  const R3s = [1, 2, 3, 4];
  const XLs = [3, 4, 5, 6, 8, 9, 11, 12];
  const XCs = [2, 4, 5, 6, 8, 10, 12, 15];
  for (const R1 of R1s)
    for (const R3 of R3s)
      for (const XL of XLs)
        for (const XC of XCs) {
          if (XL === XC) continue;                       // 직렬 공진(허수부 0)은 제외
          const probe: Params = { R1, R2: R2s[0], R3, XL, XC, Vs: 1, Is: 1, target };
          const { k1, k2 } = coeffs(probe);
          if (!isGauss(k1) || !isGauss(k2)) continue;    // 단계 식이 깔끔한 조합만
          if (k1[0] === 0 && k1[1] === 0) continue;
          if (k2[0] === 0 && k2[1] === 0) continue;
          // k1·k2가 1차 독립이어야 (V_s, I_s) 해가 유일
          const det = k1[0] * k2[1] - k1[1] * k2[0];
          if (Math.abs(det) < 1e-9) continue;
          for (const R2 of R2s)
            for (let Vs = 1; Vs <= 6; Vs++)
              for (let Is = 1; Is <= 6; Is++) {
                const re = k1[0] * Vs + k2[0] * Is, im = k1[1] * Vs + k2[1] * Is;
                if (!isInt(re) || !isInt(im)) continue;
                if (Math.abs(re) > 30 || Math.abs(im) > 30) continue;
                if (re === 0 && im === 0) continue;
                const p: Params = { R1, R2, R3, XL, XC, Vs, Is, target };
                if (target === ORIGINAL.target &&
                    p.R1 === ORIGINAL.R1 && p.R2 === ORIGINAL.R2 && p.R3 === ORIGINAL.R3 &&
                    p.XL === ORIGINAL.XL && p.XC === ORIGINAL.XC &&
                    p.Vs === ORIGINAL.Vs && p.Is === ORIGINAL.Is) continue;  // ★ 원본 그대로 금지
                out.push(p);
                if (out.length >= 600) return out;
              }
        }
  return out;
}

// 유사 = 원본 구조(목표 전압 = 커패시터 양단) / 변형 = 목표 소자 교환(인덕터 양단 V_L)
const SIMILAR_SPACE = buildSpace("capacitor");
const VARIANT_SPACE = buildSpace("inductor");

export function generateAcSuperpositionSourceDesign(args: { seed?: number; mode: GenerationMode }): AcSuperpositionSourceDesignGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const space = args.mode === "exam_variant" ? VARIANT_SPACE : SIMILAR_SPACE;
  return solve(pick(space.length ? space : SIMILAR_SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플: V_c=−7−j → V_s=1[V]·I_s=2[A]). */
export function __originalAcSuperpositionDesignForVerify(): AcSuperpositionSourceDesignGeneration {
  return solve(ORIGINAL);
}
