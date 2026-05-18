import type {
  CircuitComponent,
  CircuitNetlist,
  CircuitTypeParams,
  LogicGate,
  LogicNetworkDiagram,
  MixedCircuitDiagram,
  NodeAnnotation,
  WaveformDiagram,
} from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 임용 8번 형식: 2-bit 동기식 JK 카운터 + R-2R DAC + OPAMP 비교기.
 *
 * 시스템 구성:
 *   클럭 → JK_A (J=K=V_CC=1) → Q_A·Q_A_bar
 *   Q_A → JK_B (J=K=Q_A) → Q_B·Q_B_bar     (동기식, 2-bit count: 00→01→10→11→00...)
 *   Q_A, Q_B → R-2R 저항망 → V_DAC (analog)
 *   V_DAC vs V_REF → OPAMP 비교기 → V_o (V_CC or GND)
 *
 * Figure 구성:
 *   (가-1) logic_network: 두 JK-FF + V_CC 분배 (Q_A_bar·Q_B_bar 출력)
 *   (가-2) analog_netlist: R-2R DAC + OPAMP 비교기 + V_o 출력 (Q_A·Q_B 외부 입력 핀)
 *   (나)   waveform: 클럭·Q_A_bar·Q_B_bar·V_o
 *
 * 학생 단계 (임용 8번 표준):
 *   [단계 1] (가)의 Q_A_bar·Q_B_bar 파형을 (나)의 전체 구간에 도시.
 *   [단계 2] (나)의 특정 시점 ㉠에서 비교기 입력 단자 중앙(+) 전압.
 *   [단계 3] (가)의 비교기 출력 V_o 파형을 (나)의 전체 구간에 도시.
 */

export type CounterDacComparatorGeneration = {
  /** (가) 단일 mixed_circuit — logic + analog 통합 */
  mixedCircuit: MixedCircuitDiagram;
  /** (나) waveform — 문제 템플릿: 클럭만 채워지고 Q_A'·Q_B'·V_o는 빈칸 (학생이 단계 1·3에서 도시) */
  waveformTemplate: WaveformDiagram;
  /** (나) waveform — 정답: 모든 신호 채워짐 (정답·풀이 영역용) */
  waveformSolution: WaveformDiagram;
  /** 정답 — 단계 2의 V+ 전압 (특정 시점) */
  answer: {
    Vplus_at_marker: number;
    Vo_sequence: number[]; // 0(GND) or V_CC at each count (00, 01, 10, 11)
  };
  values: {
    V_CC: number;
    V_REF: number;
    R_unit_kohm: number; // R-2R 저항망의 R
  };
};

export function generateCounterDacComparator(args: {
  params?: CircuitTypeParams;
  seed?: number;
}): CounterDacComparatorGeneration {
  const rand = makeRand(args.seed);

  const V_CC = pick([5, 10], rand);
  const V_REF = pick([V_CC / 4, V_CC / 2, (3 * V_CC) / 4], rand); // counter 4 state 중 일부 트리거
  const R = pick([1, 2, 5], rand); // R-2R unit (kΩ)

  // 2-bit count: Q_A is LSB, Q_B is MSB. count 00→01→10→11.
  // V_DAC (R-2R DAC): V_DAC = V_CC · (Q_B·2 + Q_A) / 4
  // V_o = V_CC if V_DAC > V_REF, else GND (비교기 V+ = V_DAC, V- = V_REF, OPAMP open-loop)
  const counts: Array<[number, number]> = [
    [0, 0], [1, 0], [0, 1], [1, 1], // Q_A, Q_B
  ];
  const Vo_sequence = counts.map(([qa, qb]) => {
    const vdac = V_CC * (qb * 2 + qa) / 4;
    return vdac > V_REF ? V_CC : 0;
  });
  // Marker 시점 (예: count=10일 때 V+ = V_DAC)
  const markerCount = 2; // 임의 — count[2] = (0, 1)
  const Vplus_at_marker = V_CC * (counts[markerCount][1] * 2 + counts[markerCount][0]) / 4;

  // ─── (가-1) logic_network: 2개 JK-FF + V_CC 입력 ──────────────
  const gates: LogicGate[] = [
    // JK_A: J=K=V_CC (always 1) → Q_A 토글 매 클럭. 동기식 ripple counter.
    {
      id: "JK_A",
      type: "JKFF",
      inputs: ["V_CC", "V_CC"], // J=K=1
      output: "Q_A",
      clockSignal: "CLK",
    },
    // JK_B: J_B=K_B=Q_A. Q_A=1일 때 Q_B 토글.
    {
      id: "JK_B",
      type: "JKFF",
      inputs: ["Q_A", "Q_A"],
      output: "Q_B",
      clockSignal: "CLK",
    },
    // NOT(Q_A) → Q_A_bar, NOT(Q_B) → Q_B_bar (학생이 도시할 출력)
    { id: "NOT_QA", type: "NOT", inputs: ["Q_A"], output: "Q_A_bar" },
    { id: "NOT_QB", type: "NOT", inputs: ["Q_B"], output: "Q_B_bar" },
  ];
  const logicNetlist: LogicNetworkDiagram = {
    inputs: ["V_CC", "CLK"],
    outputs: ["Q_A_bar", "Q_B_bar"],
    gates,
    signalLabels: { Q_A: "Q_A", Q_B: "Q_B" },
  };

  // ─── (가-2) analog_netlist: R-2R DAC + OPAMP 비교기 ───────────
  //   Q_A·Q_B (digital input 외부 핀) → R 분압 → V_DAC → OPAMP V+
  //   V_REF → OPAMP V-
  //   V_o 출력
  const components: CircuitComponent[] = [
    // Q_A 외부 입력 핀 (label_only)
    {
      id: "R_QA",
      type: "R",
      value: `${2 * R}kΩ`,
      pins: [
        { id: "p", node: "Q_A_in", side: "left" },
        { id: "n", node: "V_DAC_node", side: "right" },
      ],
    },
    {
      id: "R_QB",
      type: "R",
      value: `${R}kΩ`,
      pins: [
        { id: "p", node: "Q_B_in", side: "left" },
        { id: "n", node: "V_DAC_node", side: "right" },
      ],
    },
    // V_DAC → V+ (OPAMP)
    {
      id: "U1",
      type: "OPAMP",
      pins: [
        { id: "vp", node: "V_DAC_node", side: "left", role: "non_inverting" },
        { id: "vn", node: "Vref_node", side: "left", role: "inverting" },
        { id: "vo", node: "V_o_node", side: "right" },
      ],
    },
  ];
  const nodeAnnotations: NodeAnnotation[] = [
    { node: "Q_A_in", label: "Q_A", style: "label_only" },
    { node: "Q_B_in", label: "Q_B", style: "label_only" },
    { node: "Vref_node", label: `V_REF = ${V_REF.toFixed(2)}V`, style: "label_only" },
    { node: "V_o_node", label: "V_o", style: "label_only" },
  ];
  const analogNetlist: CircuitNetlist = {
    components,
    ground: "GND",
    nodeAnnotations,
  };

  // ─── (나) waveform: 클럭·Q_A_bar·Q_B_bar·V_o ─────────────────
  const CYCLES = 8; // 2 cycles of 4-count 반복
  const clkSeq: number[] = [];
  const QA_bar_seq: number[] = [];
  const QB_bar_seq: number[] = [];
  const Vo_seq: number[] = [];
  for (let i = 0; i < CYCLES; i++) {
    clkSeq.push(i % 2);
    const countIdx = i % 4;
    const [qa, qb] = counts[countIdx];
    QA_bar_seq.push(1 - qa);
    QB_bar_seq.push(1 - qb);
    Vo_seq.push(Vo_sequence[countIdx] === V_CC ? 1 : 0);
  }

  const stepSamples = (arr: number[]) => {
    const out = arr.map((v, i) => ({ t: i, v }));
    if (arr.length > 0) out.push({ t: arr.length, v: arr[arr.length - 1] });
    return out;
  };

  const markers = [{ t: markerCount + 0.5, label: "㉠" }];

  // (나) 문제 템플릿 — 클럭만 채워지고 나머지는 blank 트랙 (학생이 단계 1·3에서 도시).
  // blank 트랙은 sample 없이 vRange로 lane 범위만 명시.
  const waveformTemplate: WaveformDiagram = {
    signals: [
      { name: "클럭", samples: stepSamples(clkSeq), shape: "step" },
      { name: "Q_A'", samples: [], shape: "step", blank: true, vRange: { min: 0, max: 1 } },
      { name: "Q_B'", samples: [], shape: "step", blank: true, vRange: { min: 0, max: 1 } },
      { name: "V_o", samples: [], shape: "step", blank: true, vRange: { min: 0, max: 1 } },
    ],
    unit: { time: "t" },
    markers,
  };

  // (나) 정답 — 모든 신호 채워짐. 정답·풀이 영역에 표시.
  const waveformSolution: WaveformDiagram = {
    signals: [
      { name: "클럭", samples: stepSamples(clkSeq), shape: "step" },
      { name: "Q_A'", samples: stepSamples(QA_bar_seq), shape: "step" },
      { name: "Q_B'", samples: stepSamples(QB_bar_seq), shape: "step" },
      { name: "V_o", samples: stepSamples(Vo_seq), shape: "step" },
    ],
    unit: { time: "t" },
    markers,
  };

  // (가) 단일 mixed_circuit — logic part + analog part 통합 + bridge mapping
  const mixedCircuit: MixedCircuitDiagram = {
    logic: logicNetlist,
    analog: analogNetlist,
    bridgeNodes: { Q_A: "Q_A_in", Q_B: "Q_B_in" },
  };

  return {
    mixedCircuit,
    waveformTemplate,
    waveformSolution,
    answer: {
      Vplus_at_marker,
      Vo_sequence,
    },
    values: {
      V_CC,
      V_REF,
      R_unit_kohm: R,
    },
  };
}
