import type { CircuitComponent, CircuitNetlist, CircuitTypeParams, NodeAnnotation } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * AC 다중 전원 + 중첩의 원리 회로 generator (임용 10번 형식).
 *
 * 구조 (5-node 평면):
 *   ┌─── L1 ───┬─── R1 ──┬── R2 ──┐
 *   │          a         b        │
 *   │                   R3        │
 *   V_s                  │        I_s
 *   │                   C1        │
 *   │                    │        │
 *   └──────── GND ───────┴────────┘
 *
 *  · V_s: AC 전압원 (좌측 leg, 예 "20∠-90°V")
 *  · I_s: AC 전류원 (우측 leg, 예 "4∠0°A")
 *  · L1 : 인덕터 임피던스 (예 "j15Ω") — 좌상단 horizontal
 *  · R1, R2: 저항 (각각 5Ω) — 상단 가운데/우측 horizontal
 *  · R3, C1: 중간 leg 직렬 (각각 5Ω, -j5Ω) — 단자 a/b가 가운데 노드
 *
 * 중첩의 원리 풀이 단계:
 *   [단계 1] I_s 개방 → V_s만 → 마디 a에서 b로 흐르는 전류 I_b
 *   [단계 2] V_s 단락 → I_s만 → 마디 a에서 b로 흐르는 전류 I_b
 *   [단계 3] 합성 + 평균 전력 P = (1/2)·|I_b|²·R
 */

export type AcSuperpositionGeneration = {
  netlist: CircuitNetlist;
  /** 단자 (가운데 마디 a, b) */
  terminalA: string;
  terminalB: string;
  /** 사용한 값 (해설/textWriter에 전달) */
  values: {
    Vs: { magnitude: number; angle: number; label: string };
    Is: { magnitude: number; angle: number; label: string };
    L1: { impedance: number; label: string };   // j·ωL
    C1: { impedance: number; label: string };   // -j/(ωC), 음수로 저장
    R1: number;
    R2: number;
    R3: number;
  };
};

const V_MAGS = [10, 15, 20, 25, 30];
const V_ANGLES = [-90, -60, -45, -30, 0, 30, 45, 60, 90];
const I_MAGS = [2, 3, 4, 5, 6];
const I_ANGLES = [-90, -45, 0, 45, 90];
const R_VALUES = [2, 4, 5, 8, 10];
const L_IMPS = [5, 10, 15, 20];
const C_IMPS = [5, 10, 15];

export function generateAcSuperposition(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): AcSuperpositionGeneration {
  const rand = makeRand(args.seed);

  const vMag = pick(V_MAGS, rand);
  const vAng = pick(V_ANGLES, rand);
  const iMag = pick(I_MAGS, rand);
  const iAng = pick(I_ANGLES, rand);
  const lImp = pick(L_IMPS, rand);
  const cImp = pick(C_IMPS, rand);
  const r1 = pick(R_VALUES, rand);
  const r2 = pick(R_VALUES, rand);
  const r3 = pick(R_VALUES, rand);

  const phasorV = `${vMag}∠${vAng}°V`;
  const phasorI = `${iMag}∠${iAng}°A`;
  const lLabel = `j${lImp}Ω`;
  const cLabel = `-j${cImp}Ω`;

  // node 이름:
  //   N_lt  : V_s 위 (= L1 좌측)
  //   N_m   : L1 우측 (= R1 좌측)
  //   N_a   : R1 우측 = R2 좌측 = R3 위 (★ 단자 a)
  //   N_mid : R3 아래 = C1 위 (중간 노드, 라벨 없음)
  //   N_b   : C1 아래 (★ 단자 b — a-R3-C1-b 직렬 끝, N_a와 같은 x)
  //   N_rt  : R2 우측 = I_s 위
  //   GND   : 그라운드 rail
  const N_LT  = "N_lt";
  const N_M   = "N_m";
  const N_A   = "a";
  const N_MID = "N_mid";
  const N_B   = "b";
  const N_RT  = "N_rt";
  const GND   = "GND";

  const components: CircuitComponent[] = [
    // V_s: GND → N_LT (좌측 leg, vertical)
    {
      id: "V_s",
      type: "V",
      value: phasorV,
      pins: [
        { id: "p", node: N_LT, side: "top" },
        { id: "n", node: GND,  side: "bottom" },
      ],
    },
    // L1: N_LT — N_M (상단 좌측 horizontal)
    {
      id: "L1",
      type: "L",
      value: lLabel,
      pins: [
        { id: "p", node: N_LT, side: "left" },
        { id: "n", node: N_M,  side: "right" },
      ],
    },
    // R1: N_M — N_A (상단 가운데 좌측 horizontal). N_A가 단자 a.
    {
      id: "R1",
      type: "R",
      value: `${r1}Ω`,
      pins: [
        { id: "p", node: N_M, side: "left" },
        { id: "n", node: N_A, side: "right" },
      ],
    },
    // R2: N_A — N_RT (상단 가운데 우측 horizontal). 단자 a를 R1·R2가 공유.
    {
      id: "R2",
      type: "R",
      value: `${r2}Ω`,
      pins: [
        { id: "p", node: N_A,  side: "left" },
        { id: "n", node: N_RT, side: "right" },
      ],
    },
    // I_s: GND → N_RT (우측 leg)
    {
      id: "I_s",
      type: "I",
      value: phasorI,
      pins: [
        { id: "p", node: N_RT, side: "top" },
        { id: "n", node: GND,  side: "bottom" },
      ],
    },
    // R3: N_A → N_MID (vertical leg 위쪽). 단자 a 바로 아래.
    //   legRoot=N_A로 R3+C1+WIRE이 단일 vertical chain으로 그려지도록.
    {
      id: "R3",
      type: "R",
      value: `${r3}Ω`,
      legRoot: N_A,
      pins: [
        { id: "p", node: N_A,   side: "top" },
        { id: "n", node: N_MID, side: "bottom" },
      ],
    },
    // C1: N_MID → N_B (vertical leg 가운데). 단자 b는 C1 바로 아래.
    {
      id: "C1",
      type: "C",
      value: cLabel,
      legRoot: N_A,
      pins: [
        { id: "p", node: N_MID, side: "top" },
        { id: "n", node: N_B,   side: "bottom" },
      ],
    },
    // WIRE: N_B → GND. 0-symbol — 단자 b를 chain의 명시적 mid 노드로 만들어 b 라벨이
    //   C1 바로 아래(a-R3-C1-b 직렬 끝)에 표시되도록.
    {
      id: "W_b",
      type: "WIRE",
      legRoot: N_A,
      pins: [
        { id: "p", node: N_B, side: "top" },
        { id: "n", node: GND, side: "bottom" },
      ],
    },
  ];

  const nodeAnnotations: NodeAnnotation[] = [
    { node: N_A, label: "a", style: "terminal_dot" },
    { node: N_B, label: "b", style: "terminal_dot" },
  ];

  // positions hint — N_A·N_B 같은 x(420)로 두어 단자 a·b 수직 평행.
  // N_B는 C1 아래(chain bottom 직전) 위치 → renderer가 자동 계산하므로 hint는 참고용.
  const positions: Record<string, { x: number; y: number }> = {
    [GND]:   { x: 420, y: 360 },
    [N_LT]:  { x: 80,  y: 160 },
    [N_M]:   { x: 240, y: 160 },
    [N_A]:   { x: 420, y: 160 },
    [N_MID]: { x: 420, y: 220 },
    [N_B]:   { x: 420, y: 290 },
    [N_RT]:  { x: 600, y: 160 },
  };

  return {
    netlist: {
      components,
      ground: GND,
      nodeAnnotations,
      positions,
    },
    terminalA: N_A,
    terminalB: N_B,
    values: {
      Vs: { magnitude: vMag, angle: vAng, label: phasorV },
      Is: { magnitude: iMag, angle: iAng, label: phasorI },
      L1: { impedance: lImp, label: lLabel },
      C1: { impedance: -cImp, label: cLabel },
      R1: r1,
      R2: r2,
      R3: r3,
    },
  };
}
