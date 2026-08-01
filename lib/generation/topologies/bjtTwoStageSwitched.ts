/**
 * SW + 상보형 2단 BJT 바이어스 (임용 10번 형식) — 전용 archetype. GPT 없음(결정론).
 *
 *  ★ 원본 구조 (사용자 확인 2026-07-23):
 *    - +V_CC 전원, 좌측: V_CC ─ SW ─ R1 ─ 마디 B1(Q1 베이스) ─ R2 ─ GND  (SW-gated 분압)
 *    - Q1 (NPN): 베이스 B1, 컬렉터 C1 ─ R5 ─ V_CC, 이미터 E1 ─ R3 ─ 마디 M
 *    - M ─ R4 ─ GND,  ★M = Q2 베이스★ (Q1 이미터 쪽 노드가 Q2를 구동)
 *    - Q2 (PNP): 베이스 M, 이미터 E2 ─ R6 ─ V_CC, 컬렉터 C2 ─ R7 ─ GND,  V_O = C2
 *    - R5(Q1 컬렉터 저항)·R6(Q2 이미터 저항)이 학생 도출 미지.
 *
 *  ★ 물리 (활성영역, V_BE1=0.7(NPN)·V_EB2=0.7(PNP)·I_C≈I_E, 베이스 전류 무시):
 *    V_B1 = V_CC·R2/(R1+R2),  V_E1 = V_B1 − 0.7,  I_E1 = V_E1/(R3+R4) [mA]
 *    V_M  = I_E1·R4,  V_C1 = V_CC − I_C1·R5,  V_CE1 = V_C1 − V_E1
 *    V_E2 = V_M + 0.7,  I_E2 = (V_CC − V_E2)/R6 [mA],  V_C2 = I_C2·R7,  V_EC2 = V_E2 − V_C2
 *
 *  단계: [1] Q1 바이어스(V_B1·V_E1·I_E1) / [2] V_CE1 주어질 때 R5 / [3] I_E2 주어질 때 R6·V_EC2.
 */
import { round3, makeRand } from "./_helpers";

export type BjtTwoStageParams = {
  Vcc: number; // V
  R1: number;  // kΩ (SW 분압 상단)
  R2: number;  // kΩ (분압 하단)
  R3: number;  // kΩ (Q1 이미터)
  R4: number;  // kΩ (M → GND, Q2 베이스 분압)
  R5: number;  // kΩ (Q1 컬렉터 — 단계2 미지)
  R6: number;  // kΩ (Q2 이미터 — 단계3 미지)
  R7: number;  // kΩ (Q2 컬렉터 → GND)
};

export type BjtTwoStageSolved = {
  Vb1: number; Ve1: number; Ie1: number; Vm: number;
  Vc1: number; Vce1: number;
  Ve2: number; Ie2: number; Vc2: number; Vec2: number; Vo: number;
};

const VBE = 0.7;

export function solveBjtTwoStage(p: BjtTwoStageParams): BjtTwoStageSolved {
  const Vb1 = (p.Vcc * p.R2) / (p.R1 + p.R2);
  const Ve1 = Vb1 - VBE;
  const Ie1 = Ve1 / (p.R3 + p.R4); // mA (V/kΩ)
  const Ic1 = Ie1;
  const Vm = Ie1 * p.R4;
  const Vc1 = p.Vcc - Ic1 * p.R5;
  const Vce1 = Vc1 - Ve1;
  const Ve2 = Vm + VBE;
  const Ie2 = (p.Vcc - Ve2) / p.R6; // mA
  const Ic2 = Ie2;
  const Vc2 = Ic2 * p.R7;
  const Vec2 = Ve2 - Vc2;
  return {
    Vb1: round3(Vb1), Ve1: round3(Ve1), Ie1: round3(Ie1), Vm: round3(Vm),
    Vc1: round3(Vc1), Vce1: round3(Vce1),
    Ve2: round3(Ve2), Ie2: round3(Ie2), Vc2: round3(Vc2),
    Vec2: round3(Vec2), Vo: round3(Vc2),
  };
}

/** 활성영역·양수·깔끔한 값만 통과 (sanity). */
function isValid(p: BjtTwoStageParams, s: BjtTwoStageSolved): boolean {
  if (s.Ve1 <= 0.3 || s.Ie1 <= 0.05 || s.Vm <= 0.1) return false;
  if (s.Vce1 <= 0.2 || s.Vec2 <= 0.2) return false;      // 활성영역
  if (s.Ie2 <= 0.05) return false;
  if (s.Ve2 >= p.Vcc - 0.3) return false;                 // Q2 이미터 여유
  // 단계2·3 미지(R5·R6)이 깔끔한 kΩ이 되도록: 원 파라미터가 이미 깔끔하니 통과.
  return true;
}

// 사전검증 파라미터 풀 (모두 활성영역 + 깔끔 답). 원본과 값이 다른 유사·변형용.
const SIMILAR_SETS: BjtTwoStageParams[] = [
  { Vcc: 12, R1: 8, R2: 4, R3: 1, R4: 2, R5: 5, R6: 7, R7: 0.5 },
  { Vcc: 10, R1: 6, R2: 4, R3: 1, R4: 1, R5: 3, R6: 5, R7: 1 },
  { Vcc: 15, R1: 10, R2: 5, R3: 2, R4: 2, R5: 6, R6: 9, R7: 0.5 },
  { Vcc: 12, R1: 8, R2: 4, R3: 2, R4: 2, R5: 5, R6: 8, R7: 0.5 },
];
const VARIANT_SETS: BjtTwoStageParams[] = [
  { Vcc: 12, R1: 6, R2: 3, R3: 1, R4: 1, R5: 3, R6: 6, R7: 0.5 },
  { Vcc: 10, R1: 6, R2: 4, R3: 2, R4: 1, R5: 4, R6: 5, R7: 0.5 },
  { Vcc: 12, R1: 10, R2: 5, R3: 2, R4: 1, R5: 4, R6: 8, R7: 1 },
  { Vcc: 15, R1: 12, R2: 4, R3: 1, R4: 2, R5: 6, R6: 10, R7: 0.5 },
];

export type BjtTwoStageGeneration = {
  params: BjtTwoStageParams;
  solved: BjtTwoStageSolved;
};

export function generateBjtTwoStageSwitched(args: {
  mode: "exam_similar" | "exam_variant";
  seed?: number;
  index?: number;
}): BjtTwoStageGeneration {
  const pool = (args.mode === "exam_variant" ? VARIANT_SETS : SIMILAR_SETS).filter(
    (p) => isValid(p, solveBjtTwoStage(p)),
  );
  const rand = makeRand(args.seed);
  const base = Math.floor(rand() * pool.length);
  const idx = ((base + (args.index ?? 0)) % pool.length + pool.length) % pool.length;
  const params = pool[idx];
  return { params, solved: solveBjtTwoStage(params) };
}
