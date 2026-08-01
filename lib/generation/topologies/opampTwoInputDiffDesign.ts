/**
 * 2입력 2-OPAMP 캐스케이드 (가) + 차동증폭기 설계 (나) — 임용 5번 전자회로. 전용 archetype. GPT 없음.
 *
 *  원본 구조 (사용자 확인 2026-07-23, 자기일관 검증):
 *   (가) 2-OPAMP 캐스케이드:
 *     - OP1 반전: V₂ ─Ri1─ (−), 피드백 Rf1, (+)=GND → out1 = −(Rf1/Ri1)·V₂ = −V₂ (Ri1=Rf1)
 *     - OP2 반전가산: out1 ─Ra─ (−), V₁ ─Rb─ (−), 피드백 Rf2, (+)=GND
 *        → V_o = −(Rf2/Ra)·out1 − (Rf2/Rb)·V₁ = (Rf2/Ra)·V₂ − (Rf2/Rb)·V₁
 *     - Ra=Rb=R0, Rf2=k·R0, Ri1=Rf1 → ★ V_o = k·V₂ − k·V₁ = k(V₂ − V₁) ★
 *   (나) 차동증폭기 (단일 OPAMP): V₁ ─R_v1─ (−), V₂ ─R₁─ (+), (+)─R₂─GND, 피드백 R₂
 *     → V_o = −(R₂/R_v1)V₁ + (1+R₂/R_v1)·R₂/(R₁+R₂)·V₂
 *     (가)와 동일(V_o=k(V₂−V₁))하려면 ★ R₂=k·R_v1, R₁=R_v1 ★.
 *
 *  단계: [1] (가)의 V_o=k(V₂−V₁) 관계식 / [2] (나)가 같은 출력 되도록 R₁·R₂ 설계 / [3] V₁·V₂ 대입 V_o.
 */
import { makeRand } from "./_helpers";

export type OpampTwoInputParams = {
  k: number;      // 차동 이득 (V_o = k(V₂−V₁))
  R0: number;     // (가) OP2 입력 저항 Ra=Rb [kΩ]
  Ri1: number;    // (가) OP1 입력·피드백 [kΩ] (Ri1=Rf1 → g1=1)
  Rv1: number;    // (나) V₁ 입력 저항 [kΩ]
  v1: number;     // 단계3 V₁ [V]
  v2: number;     // 단계3 V₂ [V]
};

export type OpampTwoInputSolved = {
  R1na: number;   // (나) R₁ = R_v1
  R2na: number;   // (나) R₂ = k·R_v1
  Rf2: number;    // (가) OP2 피드백 = k·R0
  Vo3: number;    // 단계3 V_o = k(v2−v1)
};

export function solveOpampTwoInput(p: OpampTwoInputParams): OpampTwoInputSolved {
  return {
    R1na: p.Rv1,
    R2na: p.k * p.Rv1,
    Rf2: p.k * p.R0,
    Vo3: p.k * (p.v2 - p.v1),
  };
}

const SIMILAR_SETS: OpampTwoInputParams[] = [
  { k: 4, R0: 1, Ri1: 1, Rv1: 2, v1: 1, v2: 2 },  // 원본
  { k: 3, R0: 1, Ri1: 1, Rv1: 2, v1: 1, v2: 3 },
  { k: 2, R0: 2, Ri1: 1, Rv1: 1, v1: 2, v2: 3 },
  { k: 5, R0: 1, Ri1: 2, Rv1: 1, v1: 1, v2: 2 },
];
const VARIANT_SETS: OpampTwoInputParams[] = [
  { k: 3, R0: 2, Ri1: 1, Rv1: 2, v1: 2, v2: 4 },
  { k: 4, R0: 1, Ri1: 2, Rv1: 1, v1: 1, v2: 3 },
  { k: 2, R0: 1, Ri1: 1, Rv1: 2, v1: 3, v2: 5 },
  { k: 5, R0: 2, Ri1: 1, Rv1: 1, v1: 2, v2: 3 },
];

export type OpampTwoInputGeneration = {
  params: OpampTwoInputParams;
  solved: OpampTwoInputSolved;
};

export function generateOpampTwoInputDiffDesign(args: {
  mode: "exam_similar" | "exam_variant";
  seed?: number;
  index?: number;
}): OpampTwoInputGeneration {
  const pool = args.mode === "exam_variant" ? VARIANT_SETS : SIMILAR_SETS;
  const rand = makeRand(args.seed);
  const base = Math.floor(rand() * pool.length);
  const idx = ((base + (args.index ?? 0)) % pool.length + pool.length) % pool.length;
  const params = pool[idx];
  return { params, solved: solveOpampTwoInput(params) };
}
