/**
 * OPAMP 차동증폭기 (임용 9번) — 노턴 입력(I_n∥R_n) + 전압 입력(V_p)의 차동증폭.
 *
 *  고정 토폴로지:
 *    좌측: I_n(전류원) ∥ R_n  →(node N)→ R_1 → V−
 *    피드백: V_o → R_2 → V−
 *    +입력: V_p → R_3 → V+,  R_4: V+ → GND
 *    U1 출력 V_o (단자 a)
 *
 *  이상적 OPAMP(V+=V−, 입력전류 0) 닫힌형 해:
 *    V− = V+ = V_p · R_4/(R_3+R_4)
 *    b  = R_2/(R_1+R_n),  a = R_4/(R_3+R_4)·(1+b)
 *    V_o = a·V_p − b·V_1,   V_1 = I_n·R_n (노턴→테브난 등가 입력전압)
 *    차동모드이득 A_d = (a+b)/2,  공통모드이득 A_c = a − b
 *      (V_1=I_n·R_n, V_2=V_p를 두 입력으로 보고 V_o=A_d·V_d+A_c·V_c, V_d=V_2−V_1, V_c=(V_1+V_2)/2)
 *
 *  학생 단계: [1] V_o 식 [2] 값+V_o로 R_4 역산 [3] A_d·A_c.
 *
 *  ★ generic GPT 추출은 2입력 차동구조(V+ 분배·노턴 입력)를 떨어뜨려 단순 반전증폭으로 축소 →
 *    전용 결정론 archetype. (단위: 저항 kΩ, 전류 mA, 전압 V → I[mA]·R[kΩ]=V)
 */

import type { CircuitComponent, CircuitNetlist, GenerationMode } from "@/types";
import { makeRand } from "./_helpers";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/generation/topologies/opampDifferenceAmp");

export type OpampDifferenceAmpValues = {
  R_n: number; R_1: number; R_2: number; R_3: number; R_4: number; // kΩ
  I_n: number; // mA
  V_p: number; // V
  V_1: number; // V (= I_n·R_n)
  V_minus: number; // V (= V+)
  a: number; b: number;
  V_o: number; // V
  A_d: number; A_c: number;
};

export type OpampDifferenceAmpGeneration = {
  values: OpampDifferenceAmpValues;
  netlist: CircuitNetlist;
};

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const isNiceV = (x: number) => Number.isFinite(x) && Math.abs(x * 10 - Math.round(x * 10)) < 1e-6; // ≤0.1
const isNice2 = (x: number) => Number.isFinite(x) && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6; // ≤0.01

const RN = [5, 10];
const R1 = [5, 10];
const R2 = [40, 60, 80, 100, 120];
const R3 = [10, 20];
const R4 = [40, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180];
const IN = [0.1, 0.2, 0.4, 0.5];
const VP = [1, 2, 3, 4];

function compute(v: Omit<OpampDifferenceAmpValues, "V_1" | "V_minus" | "a" | "b" | "V_o" | "A_d" | "A_c">): OpampDifferenceAmpValues {
  const V_1 = v.I_n * v.R_n;
  const div = v.R_4 / (v.R_3 + v.R_4);
  const V_minus = v.V_p * div;
  const b = v.R_2 / (v.R_1 + v.R_n);
  const a = div * (1 + b);
  const V_o = a * v.V_p - b * V_1;
  const A_d = (a + b) / 2;
  const A_c = a - b;
  return { ...v, V_1: round(V_1), V_minus: round(V_minus), a: round(a), b: round(b), V_o: round(V_o), A_d: round(A_d), A_c: round(A_c) };
}

/** nice 후보 열거 — V_o(≤0.1)·A_d(≤0.1)·A_c(≤0.01)·V_1(≤0.1) 모두 깔끔하고 V_o>0. */
function enumerateCandidates(): OpampDifferenceAmpValues[] {
  const out: OpampDifferenceAmpValues[] = [];
  for (const R_n of RN) for (const R_1 of R1) for (const R_2 of R2)
    for (const R_3 of R3) for (const R_4 of R4) for (const I_n of IN) for (const V_p of VP) {
      const c = compute({ R_n, R_1, R_2, R_3, R_4, I_n, V_p });
      if (c.V_o <= 0.5) continue;                       // 양의 출력, 자명하지 않게
      if (Math.abs(c.A_c) < 1e-9) continue;             // A_c=0(완전 CMRR)은 단계3이 자명 → 제외
      if (c.A_c < 0 || c.A_c > 2) continue;             // 공통모드이득 작고 양수
      if (!isNiceV(c.V_o) || !isNiceV(c.A_d) || !isNice2(c.A_c) || !isNiceV(c.V_1)) continue;
      out.push(c);
    }
  // 원본 유사(R_2 큰=고이득) 우선
  out.sort((x, y) => y.R_2 - x.R_2 || y.V_o - x.V_o);
  return out;
}

let CACHE: OpampDifferenceAmpValues[] | null = null;

export function generateOpampDifferenceAmp(args: { seed?: number; mode?: GenerationMode }): OpampDifferenceAmpGeneration {
  const rand = makeRand(args.seed);
  if (!CACHE) CACHE = enumerateCandidates();
  const pool = CACHE;
  if (pool.length === 0) throw new Error("opampDifferenceAmp: nice 후보 없음");
  const idx = args.mode === "exam_variant"
    ? Math.floor(rand() * pool.length)
    : Math.floor(rand() * Math.min(pool.length, 8));
  const v = pool[idx];
  log.info("opamp_difference_amp_generated", {
    R_n: v.R_n, R_1: v.R_1, R_2: v.R_2, R_3: v.R_3, R_4: v.R_4, I_n: v.I_n, V_p: v.V_p,
    V_o: v.V_o, A_d: v.A_d, A_c: v.A_c,
  });
  return { values: v, netlist: buildNetlist(v) };
}

/** 고정 토폴로지 netlist (R_4는 미지 → "R_4" 표기). 단자 a = 출력. */
function buildNetlist(v: OpampDifferenceAmpValues): CircuitNetlist {
  const components: CircuitComponent[] = [
    { id: "I_n", type: "I", value: `${v.I_n}mA`, pins: [
      { id: "p", node: "N_in", side: "top", role: "positive" },
      { id: "n", node: "GND", side: "bottom", role: "negative" }] },
    { id: "R_n", type: "R", value: `${v.R_n}kΩ`, pins: [
      { id: "p", node: "N_in", side: "top" }, { id: "n", node: "GND", side: "bottom" }] },
    { id: "R_1", type: "R", value: `${v.R_1}kΩ`, pins: [
      { id: "p", node: "N_in", side: "left" }, { id: "n", node: "V_minus", side: "right" }] },
    { id: "R_2", type: "R", value: `${v.R_2}kΩ`, pins: [
      { id: "p", node: "V_minus", side: "left" }, { id: "n", node: "Vo", side: "right" }] },
    { id: "V_p", type: "V", value: `${v.V_p}V`, pins: [
      { id: "p", node: "P_src", side: "top", role: "positive" },
      { id: "n", node: "GND", side: "bottom", role: "negative" }] },
    { id: "R_3", type: "R", value: `${v.R_3}kΩ`, pins: [
      { id: "p", node: "P_src", side: "left" }, { id: "n", node: "V_plus", side: "right" }] },
    { id: "R_4", type: "R", value: "R_4", pins: [
      { id: "p", node: "V_plus", side: "top" }, { id: "n", node: "GND", side: "bottom" }] },
    { id: "U1", type: "OPAMP", pins: [
      { id: "vp", node: "V_plus", side: "left", role: "non_inverting" },
      { id: "vn", node: "V_minus", side: "left", role: "inverting" },
      { id: "vo", node: "Vo", side: "right" }] },
  ];
  return {
    components, ground: "GND",
    archetype: "OPAMP_DIFFERENCE_AMP",
    nodeAnnotations: [{ node: "Vo", label: "a", style: "label_only" }],
  };
}
