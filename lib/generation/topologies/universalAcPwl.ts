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
 *
 *  Polarity (exam_similar vs exam_variant):
 *    "positive" (exam_similar / 원본 임용 6번): V_o ∈ [0, V_CC]
 *      - v_i(t) = -V_p·sin(ωt) (음의 반주기 먼저)
 *      - V_CC = +값, D_1 (a=clamp, c=V_CC), D_2 (a=GND, c=clamp)
 *    "negative" (exam_variant / 변형): V_o ∈ [-V_CC, 0] (음의 클램퍼, 정확히 mirror)
 *      - v_i(t) = +V_p·sin(ωt) (양의 반주기 먼저)
 *      - V_CC = -값, D_1' (a=V_CC, c=clamp), D_2' (a=clamp, c=GND)
 */

import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  GenerationMode,
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

export type ClamperPolarity = "positive" | "negative";

export type UniversalAcPwlGeneration = {
  netlist: CircuitNetlist;
  /** 클램퍼 극성 — renderer·textWriter 분기에 사용. */
  polarity: ClamperPolarity;
  /** 정답 (시뮬에서 추출한 단계별 결과) */
  answer: {
    step1_Vo_at_halfT: number;  // V_o(T/2)
    step2_Vo_at_T: number;      // V_o(T)
    step3_Vo_min: number;       // last period min
    step3_Vo_max: number;       // last period max
  };
  /** 입력 값 (text writer용) */
  values: {
    /** V_CC absolute 값 (V) — polarity가 negative면 회로에는 -V_CC로 적용됨. */
    V_CC: number;
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
  /** GenerationMode — exam_variant이면 negative clamper. 미지정 시 positive. */
  mode?: GenerationMode;
}): UniversalAcPwlGeneration {
  const rand = makeRand(args.seed);
  const polarity: ClamperPolarity = args.mode === "exam_variant" ? "negative" : "positive";
  const sign = polarity === "negative" ? -1 : 1;  // polarity 반영용 부호

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
  //   polarity="positive": V_CC=+V_CC, D_1(a=clamp,c=V_CC), D_2(a=GND,c=clamp). V_o ∈ [0, V_CC].
  //   polarity="negative": V_CC=-V_CC, D_1(a=V_CC,c=clamp), D_2(a=clamp,c=GND). V_o ∈ [-V_CC, 0].
  //
  //   pre  : C 좌측 = GND   → C: a="GND", b="n_clamp"
  //   post : C 좌측 = v_in  → C: a="v_in", b="n_clamp"
  const diodes: DiodeBranch[] = polarity === "negative"
    ? [
        // 음의 클램퍼: D_1' (V_CC -> clamp 방향 forward), D_2' (clamp -> GND 방향 forward)
        { id: "D_1", anode: "n_vcc", cathode: "n_clamp" },
        { id: "D_2", anode: "n_clamp", cathode: "GND" },
      ]
    : [
        // 양의 클램퍼 (원본): D_1 (clamp -> V_CC forward), D_2 (GND -> clamp forward)
        { id: "D_1", anode: "n_clamp", cathode: "n_vcc" },
        { id: "D_2", anode: "GND", cathode: "n_clamp" },
      ];
  const V_CC_signed = sign * V_CC;  // negative clamper면 -V_CC
  const baseClampNet = (extraNodes: string[]): SolverNetwork => ({
    nodeIds: [...extraNodes, "n_clamp", "n_vcc"],
    groundId: "GND",
    resistors: [{ id: "R_L", a: "n_clamp", b: "GND", R: R_L_ohm }],
    vsources: [{ id: "V_CC", a: "n_vcc", b: "GND", V: V_CC_signed }],
    isources: [],
  });

  const preSwitchPhase: CircuitPhase = {
    baseNet: baseClampNet([]),
    // SW가 단자2(GND)에 있으므로 V_i는 회로에서 분리됨 (time-varying source 없음)
    vSourcesTimeVarying: [],
    capacitors: [{ id: "C", a: "GND", b: "n_clamp", C: C_farad, V0: 0 }],
    diodes,
  };

  // polarity 따라 v_i 부호 반전: positive → -sin (음의 반주기 먼저), negative → +sin (양의 반주기 먼저)
  const viSign = polarity === "negative" ? 1 : -1;
  const vSourcesTimeVarying: TimeVaryingVSource[] = [
    { id: "V_i", a: "v_in", b: "GND", vFunc: (t: number) => viSign * V_i_peak * Math.sin(omega * t) },
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
  //   value 표기는 renderer가 그대로 라벨로 사용. polarity 따라 형태 분기.
  const viLabel = polarity === "negative" ? `+${V_i_peak}sin(ωt) V` : `-${V_i_peak}sin(ωt) V`;
  const vccLabel = polarity === "negative" ? `-${V_CC}V` : `${V_CC}V`;
  const components: CircuitComponent[] = [
    {
      id: "V_i",
      type: "V",
      value: viLabel,
      pins: [
        { id: "p", node: "v_in", side: "top" },
        { id: "n", node: "GND", side: "bottom" },
      ],
    },
    {
      id: "V_CC",
      type: "V",
      value: vccLabel,
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
    // D_1·D_2 pin side는 polarity에 따라 anode/cathode 위치가 바뀜.
    //   positive: D_1 anode=clamp(bottom)·cathode=V_CC(top), D_2 anode=GND(bottom)·cathode=clamp(top)
    //   negative: D_1 anode=V_CC(top)·cathode=clamp(bottom), D_2 anode=clamp(top)·cathode=GND(bottom)
    polarity === "negative"
      ? {
          id: "D_1",
          type: "D",
          pins: [
            { id: "anode", node: "n_vcc", side: "top" },
            { id: "cathode", node: "n_clamp", side: "bottom" },
          ],
        }
      : {
          id: "D_1",
          type: "D",
          pins: [
            { id: "anode", node: "n_clamp", side: "bottom" },
            { id: "cathode", node: "n_vcc", side: "top" },
          ],
        },
    polarity === "negative"
      ? {
          id: "D_2",
          type: "D",
          pins: [
            { id: "anode", node: "n_clamp", side: "top" },
            { id: "cathode", node: "GND", side: "bottom" },
          ],
        }
      : {
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
  // v_i(t) = ±V_peak·sin(ωt), 한 주기를 60 sample (analytic, ms 단위 t)
  const viWaveform: WaveformSamples = [];
  for (let k = 0; k <= 60; k++) {
    const t_sec = (k / 60) * T_sec;
    viWaveform.push({ t: t_sec * 1000, v: viSign * V_i_peak * Math.sin(omega * t_sec) });
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
    polarity,
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
