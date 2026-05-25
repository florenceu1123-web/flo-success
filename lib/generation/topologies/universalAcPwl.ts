/**
 * Universal AC PWL generator (임용 6번 형식) — 다이오드 + SPDT SW + AC clamp 회로.
 *
 *  - 변형 수치(V_CC, V_i_peak, T, C, R_L)를 randomize
 *  - 표준 netlist 생성 (V_i, V_CC, SW, C, D_1, D_2, R_L) — diodePwlCircuitRenderer로 시각화
 *  - simulateTimeStepPwl로 V_o(t) 시뮬레이션 후 extractImyong6Answers로 3단계 답 추출
 *
 *  Phase 5 deliverable. SW event 의미는 v1에서 visual only — 시뮬은 단일 phase
 *  (t=0~M·T, V_C(0)=0) 가정으로 단순화.
 */

import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  NodeAnnotation,
  MeasurementMark,
} from "@/types";
import { makeRand, pick } from "./_helpers";
import {
  simulateTimeStepPwl,
  type TimeVaryingVSource,
  type CapacitorBranch,
} from "@/lib/solver/diodeTimeStepPwl";
import type { DiodeBranch } from "@/lib/solver/diodeMnaPwl";
import type { SolverNetwork } from "@/lib/solver/mna";
import { extractImyong6Answers } from "@/lib/solver/diodeSwitchEvent";

export type UniversalAcPwlGeneration = {
  netlist: CircuitNetlist;
  /** 정답 (시뮬에서 추출한 단계별 결과) */
  answer: {
    step1_Vo_at_halfT: number;  // V_o(T/2)
    step2_Vo_at_T: number;      // V_o(T)
    step3_Vo_min: number;       // last period min
    step3_Vo_max: number;       // last period max
  };
  /** 입력 값 (text writer용) */
  values: {
    V_CC: number;        // DC clamp 전원 (V)
    V_i_peak: number;    // AC 진폭 (V)
    T_ms: number;        // 주기 (ms)
    C_uF: number;        // 캐패시턴스 (μF)
    R_L_kohm: number;    // 부하저항 (kΩ)
  };
};

/** 소수점 셋째자리 절사 (임용 6번 규칙). */
function trunc3(x: number): number {
  return Math.trunc(x * 1000) / 1000;
}

export function generateUniversalAcPwl(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): UniversalAcPwlGeneration {
  const rand = makeRand(args.seed);

  // 변형 수치 — 원본 임용 6번: V_CC=15V, V_i_peak=10V, T·C·R_L은 명시 없음
  const V_CC = pick([12, 15, 18], rand);
  const V_i_peak = pick([8, 10, 12], rand);
  const T_ms = pick([1, 2, 4], rand);
  const C_uF = pick([10, 22, 47], rand);
  const R_L_kohm = pick([10, 22, 47], rand);  // 큰 R_L → "R_L 방전 무시" approx

  // 물리 단위로 환산
  const T_sec = T_ms * 1e-3;
  const omega = 2 * Math.PI / T_sec;
  const C_farad = C_uF * 1e-6;
  const R_L_ohm = R_L_kohm * 1000;

  // ─── 시뮬 setup (단일 phase, post-switch 동작) ──────────────
  //   nodes: v_in (AC 끝), n_clamp (V_o 측정점), n_vcc (V_CC + 단자), GND
  //   V_i: v_in → GND (sinusoidal). V_CC: n_vcc → GND (DC). R_L: n_clamp → GND.
  //   C: v_in ↔ n_clamp. D_1: n_clamp(anode) → n_vcc(cathode). D_2: GND(anode) → n_clamp(cathode).
  const baseNet: SolverNetwork = {
    nodeIds: ["v_in", "n_clamp", "n_vcc"],
    groundId: "GND",
    resistors: [{ id: "R_L", a: "n_clamp", b: "GND", R: R_L_ohm }],
    vsources: [{ id: "V_CC", a: "n_vcc", b: "GND", V: V_CC }],
    isources: [],
  };
  const vSourcesTimeVarying: TimeVaryingVSource[] = [
    { id: "V_i", a: "v_in", b: "GND", vFunc: (t: number) => V_i_peak * Math.sin(omega * t) },
  ];
  const capacitors: CapacitorBranch[] = [
    { id: "C", a: "v_in", b: "n_clamp", C: C_farad, V0: 0 },
  ];
  const diodes: DiodeBranch[] = [
    { id: "D_1", anode: "n_clamp", cathode: "n_vcc" },
    { id: "D_2", anode: "GND", cathode: "n_clamp" },
  ];

  // 시뮬레이션 — 10 주기 (정상상태 도달까지)
  const periods = 10;
  const dt = T_sec / 200;
  const samples = simulateTimeStepPwl({
    baseNet, vSourcesTimeVarying, capacitors, diodes,
    options: { tStart: 0, tEnd: periods * T_sec, dt, sampleEvery: 1 },
  });
  const raw = extractImyong6Answers(samples, "n_clamp", T_sec, periods);

  // ─── netlist (renderer 입력용 — diodePwlCircuitRenderer 매칭 id) ────
  const components: CircuitComponent[] = [
    {
      id: "V_i",
      type: "V",
      value: `${V_i_peak}sin(ωt) V`,
      pins: [
        { id: "p", node: "v_in", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "V_CC",
      type: "V",
      value: `${V_CC}V`,
      pins: [
        { id: "p", node: "n_vcc", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "SW",
      type: "SW",
      value: "단자1↔2",
      pins: [
        { id: "p", node: "v_in", side: "left" },
        { id: "n", node: "n_sw_out", side: "right" },
      ],
    },
    {
      id: "C",
      type: "C",
      value: `${C_uF}μF`,
      pins: [
        { id: "p", node: "n_sw_out", side: "left" },
        { id: "n", node: "n_clamp", side: "right" },
      ],
    },
    {
      id: "D_1",
      type: "D",
      pins: [
        { id: "anode", node: "n_clamp", side: "bottom" },
        { id: "cathode", node: "n_vcc", side: "top" },
      ],
    },
    {
      id: "D_2",
      type: "D",
      pins: [
        { id: "anode", node: "GND", side: "bottom" },
        { id: "cathode", node: "n_clamp", side: "top" },
      ],
    },
    {
      id: "R_L",
      type: "R",
      value: `${R_L_kohm}kΩ`,
      pins: [
        { id: "p", node: "n_clamp", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
  ];

  const nodeAnnotations: NodeAnnotation[] = [
    { node: "n_clamp", label: "V_o(t)", style: "label_only" },
  ];
  const measurementMarks: MeasurementMark[] = [
    { kind: "voltage", refs: ["n_clamp", "GND"], label: "V_o" },
  ];

  const netlist: CircuitNetlist = {
    components,
    ground: "GND",
    nodeAnnotations,
    measurementMarks,
  };

  return {
    netlist,
    answer: {
      step1_Vo_at_halfT: trunc3(raw.step1_Vo_at_halfT),
      step2_Vo_at_T: trunc3(raw.step2_Vo_at_T),
      step3_Vo_min: trunc3(raw.step3_Vo_min),
      step3_Vo_max: trunc3(raw.step3_Vo_max),
    },
    values: { V_CC, V_i_peak, T_ms, C_uF, R_L_kohm },
  };
}
