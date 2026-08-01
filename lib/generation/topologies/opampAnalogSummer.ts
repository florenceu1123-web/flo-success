import type { OpampSummerCircuitDiagram, WaveformDiagram } from "@/types";
import { makeRand } from "./_helpers";

/**
 * 아날로그 시스템 설계 — 2-OPAMP 가산기 (임용 전자 형식) 전용 archetype.
 *
 *  원본: 입력 v₁(삼각파)·v₂(구형파)와 출력 v₀ 파형이 주어지고, ★연산증폭기 2개 + 모든 저항 동일 +
 *        이상적 소자★로 v₀를 만드는 회로를 설계. 사용자 확정: v₀ = v₁ + v₂.
 *  ★ 회로: 반전 가산기 U₁ (v_m = −(v₁+v₂)) → 반전 단위증폭 U₂ (v₀ = −v_m = v₁+v₂). 모든 R 동일, op-amp 2개.
 *  ★ generic opamp 경로는 파형·설계 성격을 잃고 임의 수치 opamp 문제로 변질 → 전용 archetype.
 *
 *  풀이 3단계: [1] 파형에서 v₀ = v₁ + v₂ 관계 도출, [2] 반전 가산기로 v_m=−(v₁+v₂),
 *              [3] 반전 증폭기로 v₀ = v₁+v₂ (모든 R 동일).
 *
 *  모드: exam_similar = v₁ 삼각파 + v₂ 구형파 / exam_variant = v₁ 톱니파 + v₂ 구형파 (다른 입력 파형, 같은 설계).
 */

const PERIODS = 4;

export type OpampAnalogSummerGeneration = {
  mode: "exam_similar" | "exam_variant";
  circuitDiagram: OpampSummerCircuitDiagram;
  waveform: WaveformDiagram;
  values: { V: number; T: number; R: number; v1shape: "triangle" | "sawtooth" };
};

type Tuple = { V: number; T: number; R: number };

const V_SET = [4, 5, 6];
const T_SET = [8, 10, 12];
const R_SET = [10, 20]; // kΩ (모두 동일)

/** 구형파 세그먼트 값 (원본 위상): 세그먼트 j(=[jT/2,(j+1)T/2])에서 j 짝수(상승 반주기) → 0, 홀수(하강 반주기) → −V. */
const v2Seg = (j: number, V: number): number => (j % 2 === 0 ? 0 : -V);

/**
 * v₁ 값 (좌·우 극한). 삼각파는 연속. 톱니파는 주기 경계(t=kT)에서 좌=V·우=0 (리셋 점프).
 */
function v1Lim(t: number, T: number, V: number, shape: "triangle" | "sawtooth", side: "left" | "right"): number {
  const p = ((t % T) + T) % T;
  if (shape === "triangle") {
    return p <= T / 2 ? (V * p) / (T / 2) : (V * (T - p)) / (T / 2);
  }
  // sawtooth
  const atBoundary = Math.abs(p) < 1e-9; // t가 T의 배수 = 리셋 지점
  if (atBoundary) return side === "left" ? V : 0;
  return (V * p) / T;
}

function buildWaveform(t: Tuple, shape: "triangle" | "sawtooth"): WaveformDiagram {
  const { V, T } = t;
  const half = T / 2;
  const nSeg = 2 * PERIODS;
  const EPS = half * 0.015; // 점프를 near-vertical로 (t 단조 증가 유지)

  // v₁ (linear) — 톱니파 리셋은 t·t+EPS 두 샘플로 near-vertical 강하
  const v1: Array<{ t: number; v: number }> = [];
  for (let i = 0; i <= nSeg; i++) {
    const tt = i * half;
    const l = v1Lim(tt, T, V, shape, "left");
    const r = v1Lim(tt, T, V, shape, "right");
    if (i === 0) { v1.push({ t: tt, v: r }); continue; }
    if (i === nSeg) { v1.push({ t: tt, v: l }); continue; }
    if (Math.abs(l - r) > 1e-9) { v1.push({ t: tt, v: l }); v1.push({ t: tt + EPS, v: r }); }
    else v1.push({ t: tt, v: l });
  }

  // v₂ (step, 구형파) — 세그먼트별 값 (zero-order hold, 중복 t 없음)
  const v2: Array<{ t: number; v: number }> = [];
  for (let j = 0; j < nSeg; j++) v2.push({ t: j * half, v: v2Seg(j, V) });
  v2.push({ t: nSeg * half, v: v2Seg(nSeg - 1, V) });

  // v₀ = v₁ + v₂ (linear) — 경계마다 점프(t·t+EPS 두 샘플)
  const v0: Array<{ t: number; v: number }> = [];
  for (let i = 0; i <= nSeg; i++) {
    const tt = i * half;
    const vL = v1Lim(tt, T, V, shape, "left") + v2Seg(i - 1, V);
    const vR = v1Lim(tt, T, V, shape, "right") + v2Seg(i, V);
    if (i === 0) { v0.push({ t: tt, v: vR }); continue; }
    if (i === nSeg) { v0.push({ t: tt, v: vL }); continue; }
    if (Math.abs(vL - vR) > 1e-9) { v0.push({ t: tt, v: vL }); v0.push({ t: tt + EPS, v: vR }); }
    else v0.push({ t: tt, v: vL });
  }

  return {
    signals: [
      { name: "v₁", samples: v1, shape: "linear" },
      { name: "v₂", samples: v2, shape: "step" },
      { name: "v₀", samples: v0, shape: "linear" },
    ],
    unit: { time: "ms", value: "V" },
    xAxis: { symbol: "t", unit: "ms" },
  };
}

function solve(t: Tuple, mode: "exam_similar" | "exam_variant"): OpampAnalogSummerGeneration {
  const shape: "triangle" | "sawtooth" = mode === "exam_variant" ? "sawtooth" : "triangle";
  const circuitDiagram: OpampSummerCircuitDiagram = {
    rLabel: "R", v1Label: "v₁", v2Label: "v₂", voLabel: "v₀", vmLabel: "v_m",
  };
  return {
    mode,
    circuitDiagram,
    waveform: buildWaveform(t, shape),
    values: { V: t.V, T: t.T, R: t.R, v1shape: shape },
  };
}

function buildSpace(): Tuple[] {
  const out: Tuple[] = [];
  for (const V of V_SET) for (const T of T_SET) for (const R of R_SET) out.push({ V, T, R });
  return out;
}
const SPACE = buildSpace();

export function generateOpampAnalogSummer(args: {
  seed?: number;
  mode: "exam_similar" | "exam_variant";
  index?: number;
}): OpampAnalogSummerGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand();
  const offset = args.mode === "exam_variant" ? 7 : 0;
  const idx = (Math.floor(rand() * SPACE.length) + offset + (args.index ?? 0)) % SPACE.length;
  return solve(SPACE[idx], args.mode);
}
