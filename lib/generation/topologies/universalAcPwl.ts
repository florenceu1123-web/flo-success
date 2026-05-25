/**
 * Universal AC PWL generator (임용 6번 형식) — 다이오드 + SPDT SW + AC clamp 회로.
 *
 *  - 변형 수치(V_CC, V_i_peak, T, C, R_L)를 randomize
 *  - 표준 netlist 생성 (V_i, V_CC, SW, C, D_1, D_2, R_L) — diodePwlCircuitRenderer로 시각화
 *  - **두-phase simulateSwitchEvent** 기반:
 *      preSwitch (t<0): SW=단자2 (C 좌측 GND) → V_C(0⁻) 계산
 *      postSwitch (t≥0): SW=단자1 (C 좌측 v_in) → V_C(0⁻)이 V0로 자동 주입
 *  - extractImyong6Answers로 3단계 답 추출
 *
 *  SW convention (renderer의 closed_to_term1과 일관):
 *    단자1 = V_i (signal line) 측 — POST-switch
 *    단자2 = GND (common ground rail) 측 — PRE-switch
 *    common = C 좌측
 */

import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  NodeAnnotation,
  MeasurementMark,
} from "@/types";
import { makeRand, pick } from "./_helpers";
import type { TimeVaryingVSource, CapacitorBranch } from "@/lib/solver/diodeTimeStepPwl";
import type { DiodeBranch } from "@/lib/solver/diodeMnaPwl";
import type { SolverNetwork } from "@/lib/solver/mna";
import {
  simulateSwitchEvent,
  extractImyong6Answers,
  type CircuitPhase,
} from "@/lib/solver/diodeSwitchEvent";

export type WaveformSamples = Array<{ t: number; v: number }>;

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
  /** preSwitch 종료 시점 V_C (= V_C(0⁻)). textWriter narration용. */
  V_C_initial: number;
  /** v_i(t) 파형 샘플 (한 주기, t in ms) — 문제 figure 용. */
  viWaveform: WaveformSamples;
  /** v_o(t) 파형 샘플 (정상상태 마지막 주기, t in ms) — 풀이 figure 용. */
  voWaveform: WaveformSamples;
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

  // ─── 두-phase 회로 정의 ─────────────────────────────────
  //   공통 nodes: n_clamp (V_o 측정점), n_vcc (V_CC + 단자). GND는 groundId.
  //   공통 컴포넌트: V_CC, R_L, D_1, D_2 (양 phase 공통)
  //
  //   pre  : C 좌측 = GND   → C: a="GND", b="n_clamp", V_C(pre) = -V_clamp
  //   post : C 좌측 = v_in  → C: a="v_in", b="n_clamp", V_C(post) = V(v_in) - V_clamp
  //
  //   ⚠️ a/b 컨벤션 차이로 handoff 시 부호 처리 필요.
  //   simulateSwitchEvent는 preFinal.capacitorVoltages.C 값을 그대로 postSwitch.C.V0에
  //   넣는다. preSwitch에서 V(GND)=0, V_clamp(t<0)≈0이므로 V_C(pre)=0 → V0=0.
  //   post의 V_C 초기값도 V(v_in,0) - V_clamp(0⁺) = 0 - 0 = 0 → 일관성 OK.
  const diodes: DiodeBranch[] = [
    { id: "D_1", anode: "n_clamp", cathode: "n_vcc" },
    { id: "D_2", anode: "GND", cathode: "n_clamp" },
  ];
  const baseClampNet = (extraNodes: string[]): SolverNetwork => ({
    nodeIds: [...extraNodes, "n_clamp", "n_vcc"],
    groundId: "GND",
    resistors: [{ id: "R_L", a: "n_clamp", b: "GND", R: R_L_ohm }],
    vsources: [{ id: "V_CC", a: "n_vcc", b: "GND", V: V_CC }],
    isources: [],
  });

  const preSwitchPhase: CircuitPhase = {
    baseNet: baseClampNet([]),
    // SW가 단자2(GND)에 있으므로 V_i는 회로에서 분리됨 (time-varying source 없음)
    vSourcesTimeVarying: [],
    capacitors: [{ id: "C", a: "GND", b: "n_clamp", C: C_farad, V0: 0 }],
    diodes,
  };

  const vSourcesTimeVarying: TimeVaryingVSource[] = [
    // 원본 임용 6번: v_i(t) = -V_peak·sin(ωt) — 음의 반주기 먼저(0→-peak→0→+peak→0)
    { id: "V_i", a: "v_in", b: "GND", vFunc: (t: number) => -V_i_peak * Math.sin(omega * t) },
  ];
  const postCapacitors: CapacitorBranch[] = [
    // V0는 simulateSwitchEvent가 preSwitch 최종값으로 덮어씀
    { id: "C", a: "v_in", b: "n_clamp", C: C_farad, V0: 0 },
  ];
  const postSwitchPhase: CircuitPhase = {
    baseNet: baseClampNet(["v_in"]),
    vSourcesTimeVarying,
    capacitors: postCapacitors,
    diodes,
  };

  // 시뮬레이션 — pre 3주기, post 10주기 (post 마지막 주기를 정상상태로 사용)
  const preSwitchPeriods = 3;
  const postSwitchPeriods = 10;
  const dt = T_sec / 200;
  const simResult = simulateSwitchEvent({
    preSwitch: preSwitchPhase,
    postSwitch: postSwitchPhase,
    T: T_sec,
    preSwitchPeriods,
    postSwitchPeriods,
    dt,
  });
  const V_C_initial = simResult.preSwitchFinalCapVoltages.C ?? 0;
  const raw = extractImyong6Answers(simResult.postSwitchSamples, "n_clamp", T_sec, postSwitchPeriods);

  // ─── netlist (renderer 입력용 — diodePwlCircuitRenderer 매칭 id) ────
  const components: CircuitComponent[] = [
    {
      id: "V_i",
      type: "V",
      value: `-${V_i_peak}sin(ωt) V`,
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

  // ─── 파형 데이터 추출 ─────────────────────────────────
  // v_i(t) = -V_peak·sin(ωt), 한 주기를 60 sample (analytic, ms 단위 t)
  const viWaveform: WaveformSamples = [];
  for (let k = 0; k <= 60; k++) {
    const t_sec = (k / 60) * T_sec;
    viWaveform.push({ t: t_sec * 1000, v: -V_i_peak * Math.sin(omega * t_sec) });
  }
  // v_o(t): postSwitch 마지막 주기 [(periods-1)*T, periods*T]에서 sample 추출, t를 한 주기 기준(0~T_ms)으로 shift
  const lastStart = (postSwitchPeriods - 1) * T_sec;
  const lastEnd = postSwitchPeriods * T_sec;
  const voWaveform: WaveformSamples = [];
  for (const s of simResult.postSwitchSamples) {
    if (s.t < lastStart || s.t > lastEnd) continue;
    voWaveform.push({ t: (s.t - lastStart) * 1000, v: s.nodeVoltages.n_clamp ?? 0 });
  }

  return {
    netlist,
    answer: {
      step1_Vo_at_halfT: trunc3(raw.step1_Vo_at_halfT),
      step2_Vo_at_T: trunc3(raw.step2_Vo_at_T),
      step3_Vo_min: trunc3(raw.step3_Vo_min),
      step3_Vo_max: trunc3(raw.step3_Vo_max),
    },
    values: { V_CC, V_i_peak, T_ms, C_uF, R_L_kohm },
    V_C_initial: trunc3(V_C_initial),
    viWaveform,
    voWaveform,
  };
}
