import type { ActiveLowpassFilterCircuitDiagram } from "@/types";
import { makeRand } from "./_helpers";

/**
 * 1차 능동 저역통과 필터 — 대역폭(차단주파수) 분석 (임용 31번 전자회로 형식) — 전용 archetype.
 *
 *  회로: v_i ─ R ─ 마디 P ─ OPAMP(+) 입력,  P ─ C ─ GND (입력단 RC 저역통과).
 *        OPAMP 비반전 버퍼(R_f 피드백, 이득 1). 출력 v_o.
 *  전달함수 H(jω)=1/(1+jωRC) → ★대역폭 = 차단주파수 f_c = 1/(2πRC)★. (OPAMP 이득은 대역폭 불변.)
 *
 *  ★ generic opamp 경로는 커패시터·필터·대역폭을 잃고 단순 반전증폭기로 변질 → 전용 archetype 필수.
 *
 *  질문: 소자값을 바꿀 때 대역폭[Hz] 변화량.
 *   exam_similar = C 변경(C1→C2, 원본: C 증가 → 대역폭 감소).
 *   exam_variant = R 변경(R1→R2, C 고정 → 대역폭 변화). 같은 원리, 바뀌는 소자만 다름.
 *
 *  풀이 3단계:
 *   [단계1] 대역폭 = f_c = 1/(2πRC).
 *   [단계2] 변경 전/후 f_c 계산.
 *   [단계3] 변화량 Δf = f_after − f_before → 약 N Hz 증가/감소.
 */

const PI = 3.14; // 원본 지시대로 π=3.14

const fc = (R: number, C: number): number => 1 / (2 * PI * R * C);
const round1 = (x: number): number => Math.round(x * 10) / 10;

/** "약" 답 — 50 단위 반올림. */
function roundNice(x: number): number {
  const a = Math.abs(x);
  return Math.round(a / 50) * 50;
}

export type ActiveLowpassFilterGeneration = {
  circuitDiagram: ActiveLowpassFilterCircuitDiagram;
  mode: "exam_similar" | "exam_variant";
  answer: {
    fcBefore: number; // Hz
    fcAfter: number;  // Hz
    delta: number;    // Hz (after − before)
    deltaNice: number;
    direction: "증가" | "감소";
  };
  values: {
    changed: "C" | "R";
    R: number;   // Ω (입력 저항, similar에선 고정)
    Rf: number;  // Ω (피드백)
    // similar
    C1?: number; C2?: number; // F
    // variant
    C?: number;  // F (고정)
    R1?: number; R2?: number; // Ω
    Cbefore: number; Cafter: number; // 실제 사용된 C (라벨용, F)
    Rbefore: number; Rafter: number; // 실제 사용된 R
  };
};

type SimTuple = { R: number; C1: number; C2: number };
type VarTuple = { C: number; R1: number; R2: number };

const R_SET = [20000, 25000, 40000, 50000, 100000];
const C_SET = [4e-9, 5e-9, 8e-9, 10e-9, 16e-9, 20e-9];

// 원본 튜플 (R=50k·C1=8n·C2=16n) 제외.
const isOriginalSim = (t: SimTuple) => t.R === 50000 && t.C1 === 8e-9 && t.C2 === 16e-9;

/** similar 공간 — C를 2배로 키움(대역폭 감소). f_c1가 합리적 범위. */
function buildSimSpace(): SimTuple[] {
  const out: SimTuple[] = [];
  for (const R of R_SET)
    for (const C1 of C_SET) {
      const C2 = 2 * C1;
      if (!C_SET.includes(C2)) continue; // C2도 nice 값
      const f1 = fc(R, C1);
      if (f1 < 90 || f1 > 2200) continue;
      const t = { R, C1, C2 };
      if (isOriginalSim(t)) continue;
      out.push(t);
    }
  return out;
}

/** variant 공간 — R을 절반으로 줄임(대역폭 증가). */
function buildVarSpace(): VarTuple[] {
  const out: VarTuple[] = [];
  for (const C of C_SET)
    for (const R1 of R_SET) {
      const R2 = R1 / 2;
      if (!R_SET.includes(R2)) continue;
      const f1 = fc(R1, C);
      if (f1 < 90 || f1 > 2200) continue;
      out.push({ C, R1, R2 });
    }
  return out;
}

const SIM_SPACE = buildSimSpace();
const VAR_SPACE = buildVarSpace();

const fmtR = (r: number) => `${r / 1000}kΩ`;
const fmtC = (c: number) => `${c * 1e9}nF`;

function solveSim(t: SimTuple): ActiveLowpassFilterGeneration {
  const fcBefore = fc(t.R, t.C1);
  const fcAfter = fc(t.R, t.C2);
  const delta = fcAfter - fcBefore;
  const circuitDiagram: ActiveLowpassFilterCircuitDiagram = {
    viLabel: "v_i", rLabel: fmtR(t.R), cLabel: "C", rfLabel: "5kΩ", voLabel: "v_o",
  };
  return {
    circuitDiagram, mode: "exam_similar",
    answer: {
      fcBefore: round1(fcBefore), fcAfter: round1(fcAfter),
      delta: round1(delta), deltaNice: roundNice(delta),
      direction: delta >= 0 ? "증가" : "감소",
    },
    values: {
      changed: "C", R: t.R, Rf: 5000, C1: t.C1, C2: t.C2,
      Cbefore: t.C1, Cafter: t.C2, Rbefore: t.R, Rafter: t.R,
    },
  };
}

function solveVar(t: VarTuple): ActiveLowpassFilterGeneration {
  const fcBefore = fc(t.R1, t.C);
  const fcAfter = fc(t.R2, t.C);
  const delta = fcAfter - fcBefore;
  const circuitDiagram: ActiveLowpassFilterCircuitDiagram = {
    viLabel: "v_i", rLabel: "R", cLabel: fmtC(t.C), rfLabel: "5kΩ", voLabel: "v_o",
  };
  return {
    circuitDiagram, mode: "exam_variant",
    answer: {
      fcBefore: round1(fcBefore), fcAfter: round1(fcAfter),
      delta: round1(delta), deltaNice: roundNice(delta),
      direction: delta >= 0 ? "증가" : "감소",
    },
    values: {
      changed: "R", R: t.R1, Rf: 5000, C: t.C,
      R1: t.R1, R2: t.R2, Cbefore: t.C, Cafter: t.C, Rbefore: t.R1, Rafter: t.R2,
    },
  };
}

export function generateActiveLowpassFilter(args: {
  seed?: number;
  mode: "exam_similar" | "exam_variant";
  index?: number;
}): ActiveLowpassFilterGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  if (args.mode === "exam_variant") {
    const idx = (Math.floor(rand() * VAR_SPACE.length) + (args.index ?? 0)) % VAR_SPACE.length;
    return solveVar(VAR_SPACE[idx]);
  }
  const idx = (Math.floor(rand() * SIM_SPACE.length) + (args.index ?? 0)) % SIM_SPACE.length;
  return solveSim(SIM_SPACE[idx]);
}
